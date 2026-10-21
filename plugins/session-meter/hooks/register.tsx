import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, SessionCost, SessionRateLimit } from 'claude-code'

import type { Meter } from '../types'

const PANE = 'session-meter'
const meter = atom({ plugin: 'session-meter', key: 'meter' } as const, null)

const LABEL: Record<string, string> = {
  five_hour: '5-hour limit',
  seven_day: '7-day limit',
  spend_limit: 'Spend limit',
}

const bar = (pct: number) => {
  const n = Math.max(0, Math.min(20, Math.round(pct / 5)))
  return '[' + '#'.repeat(n) + '-'.repeat(20 - n) + ']'
}

const k = (n?: number) => (n === undefined ? '?' : n >= 1000 ? Math.round(n / 1000) + 'k' : String(n))

const word = (pct: number) => (pct >= 90 ? 'FULL - wrap up now' : pct >= 75 ? 'HIGH - plan a wrap-up' : pct >= 50 ? 'HALF' : 'OK')

const resetIn = (iso?: string, now?: number) => {
  if (!iso || now === undefined) return ''
  const ms = Date.parse(iso) - now
  if (!(ms > 0)) return ''
  const h = Math.floor(ms / 3600000)
  const m = Math.round((ms % 3600000) / 60000)
  return ' - resets in ' + (h > 0 ? h + 'h ' : '') + m + 'm'
}

type Reading = { context: SessionContextUsage; rateLimits: SessionRateLimit[]; cost?: SessionCost }

async function save($: EngineInterface, u: Reading) {
  const next: Meter = {
    tokens: u.context.tokens,
    window: u.context.window,
    percent: u.context.percent,
    limits: u.rateLimits.map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt })),
    usd: u.cost?.usd,
    at: await $.clock.now(),
  }
  await update($, meter, () => next)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'meter', description: 'Open the session meter pane (context fill, usage limits, cost)' })
    const ran = await next(e)
    try { await save($, await $.session.usage()) } catch {}
    void $.ui.open({ id: PANE, title: 'Session meter' })
    return ran
  })

  on('command.run', { command: 'meter' }, async $ => {
    try { await save($, await $.session.usage()) } catch {}
    await $.ui.open({ id: PANE, title: 'Session meter' })
    return { text: 'Session meter opened.' }
  })

  on('session.measure', async ($, e, next) => {
    await save($, e)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const m = await read($, meter)
    if (!m) return <Text dimColor>Waiting for the first reading (after the next reply).</Text>
    const pct = m.percent ?? (m.tokens !== undefined && m.window ? Math.round((m.tokens / m.window) * 100) : undefined)
    const now = await $.clock.now()
    return (
      <Box flexDirection="column">
        <Text bold>THIS CHAT - context used</Text>
        {pct === undefined
          ? <Text dimColor>No reading yet.</Text>
          : <Text>{bar(pct)} {pct}% - {word(pct)}</Text>}
        <Text dimColor>{k(m.tokens)} of {k(m.window)} tokens; {m.tokens !== undefined ? k(Math.max(0, m.window - m.tokens)) : '?'} left</Text>
        <Text> </Text>
        <Text bold>ACCOUNT - usage limits</Text>
        {m.limits.length === 0 && <Text dimColor>No limit reading reported.</Text>}
        {m.limits.map(l => (
          <Text>{(LABEL[l.kind] ?? l.kind)}: {bar(l.percentUsed)} {l.percentUsed}% used, {Math.max(0, Math.round((100 - l.percentUsed) * 10) / 10)}% left{resetIn(l.resetsAt, now)}</Text>
        ))}
        <Text> </Text>
        {m.usd !== undefined && <Text>Cost this session: ${m.usd.toFixed(2)}</Text>}
        <Text dimColor>Updated after each reply.</Text>
      </Box>
    )
  })
}
