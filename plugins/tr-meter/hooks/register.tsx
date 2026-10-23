// ===== TRADERIGHT.AI ==========================================================
// Product : TradeRight / MCM tooling
// Script  : tr-meter (Claude session mod)
// Tab     : side pane "TR Meter" + status line
// Port    : n/a
// TIP     : /meter reopens the pane
// Purpose : David's in-chat dashboard - weekly + 5-hour plan limit, session
//           fullness/cost, and live service/agent heartbeats from
//           D:\TradeRight\Repository\_service_heartbeats.csv (via the device link).
// Author  : Claude (Cowork)   Created: 2026-10-23
// Change Log:
//   0.1.1 2026-10-23 /meter also prints the dashboard as text in the chat and says whether the side panel was placed.
//   0.1.0 2026-10-23 first version. Words, not colours (David is red/green colourblind).
// =============================================================================
import { atom, read, update } from 'claude-code'
import type { Register, EngineInterface } from 'claude-code'
import type { Meter, Agents, Svc } from '../types'

const PANE = 'tr-meter'
const meter = atom({ plugin: 'tr-meter', key: 'meter' } as const, null as Meter | null, { shape: 'meter-1' })
const agents = atom({ plugin: 'tr-meter', key: 'agents' } as const, null as Agents | null, { shape: 'agents-1' })
const CSV = '$HOME/mnt/TradeRight/Repository/_service_heartbeats.csv'

const label = (k: string) => (k === 'seven_day' ? 'Weekly' : k === 'five_hour' ? '5-hour' : k === 'spend_limit' ? 'Spend' : k)
const bar = (p: number) => { const n = Math.max(0, Math.min(10, Math.round(p / 10))); return '#'.repeat(n) + '.'.repeat(10 - n) }
const advice = (p?: number) => (p === undefined ? '' : p >= 80 ? 'START A NEW CHAT' : p >= 60 ? 'wrap up soon' : 'fine')
const ago = (s: number) => (s < 120 ? `${s}s` : s < 7200 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`)
const when = (iso?: string) => { if (!iso) return ''; const d = new Date(iso); return isNaN(+d) ? '' : `resets ${d.toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: '2-digit' })} CT` }

export function parseBeats(csv: string, nowS: number): Svc[] {
  const lines = csv.trim().split(/\r?\n/)
  const head = (lines.shift() ?? '').split(',')
  const ix = (n: string) => head.indexOf(n)
  const last = new Map<string, Svc>()
  for (const line of lines) {
    const c = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map(x => x.replace(/,$/, '').replace(/^"|"$/g, '')) ?? []
    const name = c[ix('service')]; if (!name) continue
    const ageS = Math.max(0, nowS - Number(c[ix('last_beat_epoch')] || 0))
    const maxS = Number(c[ix('expected_max_age_s')] || 300)
    const ok = (c[ix('status')] || '').toUpperCase() === 'OK'
    const state: Svc['state'] = !ok || ageS > maxS * 3 ? 'DOWN' : ageS > maxS ? 'LATE' : 'OK'
    last.set(name, { name, state, ageS, maxS, note: c[ix('note')] ?? '' })
  }
  const order = { DOWN: 0, LATE: 1, OK: 2 }
  return [...last.values()].sort((a, b) => order[a.state] - order[b.state] || a.name.localeCompare(b.name))
}

async function measure($: EngineInterface) {
    const u = await $.session.usage()
    const m: Meter = { contextPct: u.context.percent, contextTokens: u.context.tokens, window: u.context.window, limits: u.rateLimits ?? [], costUsd: u.cost?.usd, startedAt: u.startedAt, at: await $.clock.now() }
    await update($, meter, () => m)
    const wk = m.limits.find(l => l.kind === 'seven_day')
    $.ui.status(`Week ${wk ? wk.percentUsed + '%' : 'n/a'} · Chat ${m.contextPct ?? '?'}% ${advice(m.contextPct)}`)
}
async function poll($: EngineInterface) {
    const at = await $.clock.now()
    try {
      const r = await $.mcp.call('remote-devices', 'device_bash', { command: `cat ${CSV}` })
      const text = (r.content ?? []).map((b: any) => b.text ?? '').join('')
      if (r.isError || !text.includes('service,')) throw new Error(text.slice(0, 120) || 'no data')
      await update($, agents, () => ({ rows: parseBeats(text, Math.floor(at / 1000)), at }))
    } catch (err: any) {
      await update($, agents, prev => ({ rows: prev?.rows ?? [], at: prev?.at ?? at, error: 'computer not reachable: ' + String(err?.message ?? err).slice(0, 80) }))
    }
}

async function asText($: EngineInterface): Promise<string> {
  const m = await read($, meter)
  const a = await read($, agents)
  const out: string[] = ['TR METER']
  if (!m || m.limits.length === 0) out.push('Plan limits: no reading yet')
  for (const l of m?.limits ?? []) out.push(`${label(l.kind)}: ${l.percentUsed}% used ${when(l.resetsAt)}`)
  out.push(`This chat: ${m?.contextPct ?? '?'}% full - ${advice(m?.contextPct) || 'measuring'}${m?.costUsd !== undefined ? ` - cost $${m.costUsd.toFixed(2)}` : ''}`)
  const rows = a?.rows ?? []
  const bad = rows.filter(r => r.state !== 'OK')
  out.push(`Services/agents: ${rows.length} checked - ${bad.length === 0 && rows.length ? 'ALL OK' : `${bad.length} need a look`}${a?.error ? ' - ' + a.error : ''}`)
  for (const r of bad) out.push(`  ${r.state} ${r.name} (last beat ${ago(r.ageS)} ago)`)
  return out.join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'meter', description: 'Open the TradeRight meter pane (plan limits, chat fullness, agents)' })
    void $.ui.open({ id: PANE, title: 'TR Meter' })
    void measure($); void poll($)
    $.clock.every(60_000, () => { void poll($) })
    return next(e)
  })
  on('command.run', { command: 'meter' }, async $ => {
    const placed = await $.ui.open({ id: PANE, title: 'TR Meter' })
    await measure($); await poll($)
    return { text: await asText($) + `\n(side panel shown by your app: ${placed?.isPlaced ? 'yes' : 'no'})` }
  })
  on('session.measure', async ($, e, next) => { await measure($); return next(e) })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const m = await read($, meter)
    const a = await read($, agents)
    const rows = a?.rows ?? []
    const down = rows.filter(r => r.state !== 'OK')
    return (
      <Box flexDirection="column">
        <Text bold>PLAN LIMITS</Text>
        {(!m || m.limits.length === 0) && <Text dimColor>No reading yet (fills after the next reply).</Text>}
        {(m?.limits ?? []).map(l => <Text>{label(l.kind).padEnd(7)} [{bar(l.percentUsed)}] {l.percentUsed}% used  {when(l.resetsAt)}</Text>)}
        <Text> </Text>
        <Text bold>THIS CHAT</Text>
        <Text>Full    [{bar(m?.contextPct ?? 0)}] {m?.contextPct ?? '?'}% of {m ? Math.round(m.window / 1000) + 'k' : '?'} tokens - {advice(m?.contextPct) || 'measuring'}</Text>
        {m?.costUsd !== undefined && <Text dimColor>Cost so far ${m.costUsd.toFixed(2)}</Text>}
        <Text> </Text>
        <Text bold>SERVICES / AGENTS ({rows.length}) - {down.length === 0 && rows.length ? 'ALL OK' : `${down.length} NEED A LOOK`}</Text>
        {a?.error && <Text>! {a.error}</Text>}
        {rows.map(r => <Text dimColor={r.state === 'OK'}>{r.state.padEnd(4)} {r.name.padEnd(22)} last beat {ago(r.ageS)} ago</Text>)}
        {a && <Text dimColor>checked {new Date(a.at).toLocaleTimeString('en-US', { timeZone: 'America/Chicago' })} CT, every 60s</Text>}
      </Box>
    )
  })
}
