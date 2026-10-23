// ===== TRADERIGHT.AI ==========================================================
// Product : TradeRight / MCM tooling
// Script  : tr-meter (Claude session mod)   VERSION 0.2.0
// Tab     : /meter (full board in chat) + band above the prompt + status line (+ side pane where the app supports it)
// Port    : n/a
// TIP     : /meter prints the whole board
// Purpose : David's board: Claude plan tokens, this chat's capacity, ChatGPT/Codex usage (agent_runner),
//           every agent's state and hold reason, service heartbeats. Reads D:\TradeRight\_tools\tr_meter_status.py via the device link.
// Author  : Claude (Cowork)   Created: 2026-10-23
// Change Log:
//   0.2.0 2026-10-23 David's layout (tokens -> session -> ChatGPT -> agents); agents from agent_runner state + rollcall check-ins;
//                    band above the prompt (the app does not place side panes for this chat); real status words (ERROR/WARN) not guessed.
//   0.1.1 2026-10-23 /meter prints the board as text and says whether the side pane was placed.
//   0.1.0 2026-10-23 first version. Words, not colours (David is red/green colourblind).
// =============================================================================
import { atom, read, update } from 'claude-code'
import type { Register, EngineInterface } from 'claude-code'
import type { Meter, Snap } from '../types'

const PANE = 'tr-meter'
const meter = atom({ plugin: 'tr-meter', key: 'meter' } as const, null as Meter | null, { shape: 'meter-2' })
const snap = atom({ plugin: 'tr-meter', key: 'snap' } as const, null as Snap | null, { shape: 'snap-1' })
const CMD = 'python3 "$(ls -d $HOME/mnt/*TradeRight 2>/dev/null | head -1)/_tools/tr_meter_status.py"'
const LINE = '*------------------------------------------*'

const advice = (p?: number) => (p === undefined ? 'measuring' : p >= 80 ? 'START A NEW CHAT' : p >= 60 ? 'wrap up soon' : 'ok')
const when = (iso?: string) => { if (!iso) return ''; const d = new Date(iso); return isNaN(+d) ? '' : d.toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT' }
const hm = (s?: string | null) => (s ? (s.match(/(\d{2}):(\d{2})/) ?? [])[0] ?? '' : '')
function svcState(status: string, ageS: number, maxS: number): string {
  if (status === 'ERROR' || status === 'DOWN') return 'DOWN'
  if (ageS > maxS * 3) return 'DOWN (silent)'
  if (status === 'WARN' || ageS > maxS) return 'WARN'
  return 'OK'
}

async function measure($: EngineInterface) {
  const u = await $.session.usage()
  const m: Meter = { contextPct: u.context.percent, window: u.context.window, limits: u.rateLimits ?? [], costUsd: u.cost?.usd, at: await $.clock.now() }
  await update($, meter, () => m)
  const wk = m.limits.find(l => l.kind === 'seven_day')
  const s = await read($, snap)
  const held = (s?.agents ?? []).filter(a => a.held).length
  $.ui.status(`Claude ${wk ? wk.percentUsed + '%' : '?'} · Chat ${m.contextPct ?? '?'}% ${advice(m.contextPct)} · Agents held ${held}/${s?.agents.length ?? '?'}`)
}
async function poll($: EngineInterface) {
  const at = await $.clock.now()
  try {
    const r = await $.mcp.call('remote-devices', 'device_bash', { command: CMD })
    const text = (r.content ?? []).map((b: any) => b.text ?? '').join('')
    const j = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
    if (r.isError || !j) throw new Error(text.slice(0, 100) || 'no data')
    const d = JSON.parse(j)
    await update($, snap, () => ({ services: d.services ?? [], agents: d.agents ?? [], runner: d.runner ?? null, errors: d.errors ?? [], at }))
  } catch (err: any) {
    await update($, snap, prev => ({ services: prev?.services ?? [], agents: prev?.agents ?? [], runner: prev?.runner ?? null, errors: prev?.errors ?? [], at: prev?.at ?? at, error: 'computer not reachable: ' + String(err?.message ?? err).slice(0, 80) }))
  }
}
function board(m: Meter | null, s: Snap | null, full: boolean): string[] {
  const out: string[] = [LINE]
  const wk = m?.limits.find(l => l.kind === 'seven_day'), fh = m?.limits.find(l => l.kind === 'five_hour')
  out.push(`| Claude tokens: ${wk ? wk.percentUsed + '% used (week)' : 'no reading yet'}${fh ? ` · 5-hour ${fh.percentUsed}%` : ''}`)
  if (wk) out.push(`| Renews: ${when(wk.resetsAt)} (${wk.percentUsed >= 90 ? 'LOW' : 'ok'})`)
  out.push(`| This session: ${m?.contextPct ?? '?'}% full (${advice(m?.contextPct)})${full && m?.costUsd !== undefined ? ` · cost $${m.costUsd.toFixed(2)}` : ''}`)
  out.push(LINE)
  const rn = s?.runner ?? ''
  const spend = rn.match(/today \$([\d.]+)/)?.[1], ctok = rn.match(/codex tokens (\d+)/)?.[1]
  out.push(`| ChatGPT/Codex: ${ctok ? Number(ctok).toLocaleString('en-US') + ' tokens today' : 'no reading'}${spend ? ` · agent spend $${Number(spend).toFixed(2)} today` : ''}`)
  out.push('| (OpenAI shows no plan % to outside tools)')
  out.push(LINE)
  for (const a of s?.agents ?? []) {
    const st = a.held ? `HELD - ${a.held}` : a.mode === 'POLL ONLY' ? 'polling bus' : (a.health ?? '?')
    out.push(`| ${a.name}: ${st}${a.open != null ? ` · ${a.open} open` : ''}${full && (a.lastPoll || a.lastPass) ? ` · last ${hm(a.lastPoll ?? a.lastPass)} ET` : ''}`)
  }
  if (!(s?.agents.length)) out.push('| Agents: no reading (D:\\MCM not connected?)')
  out.push(LINE)
  const svcs = (s?.services ?? []).map(v => ({ ...v, st: svcState(v.status, v.ageS, v.maxS) }))
  const bad = svcs.filter(v => v.st !== 'OK')
  out.push(`| Services: ${svcs.length - bad.length} OK${bad.length ? ` · ${bad.length} need a look` : ''}`)
  for (const v of bad) out.push(`|   ${v.st} ${v.name}${v.note ? ' - ' + v.note : ''}`)
  if (s?.error) out.push(`| ! ${s.error}`)
  out.push(LINE)
  return out
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'meter', description: 'TR Meter: Claude tokens, this chat, ChatGPT/Codex, agents, services' })
    void $.ui.open({ id: PANE, title: 'TR Meter' })
    void poll($).then(() => measure($))
    $.clock.every(60_000, () => { void poll($) })
    return next(e)
  })
  on('command.run', { command: 'meter' }, async $ => {
    const placed = await $.ui.open({ id: PANE, title: 'TR Meter' })
    await poll($); await measure($)
    return { text: board(await read($, meter), await read($, snap), true).join('\n') + (placed?.isPlaced ? '' : '\n(your app shows no side panel here; this board, the band above the prompt and the status line are the views)') }
  })
  on('session.measure', async ($, e, next) => { await measure($); return next(e) })
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const m = await read($, meter), s = await read($, snap)
    if (!m && !s) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const wk = m?.limits.find(l => l.kind === 'seven_day')
    const held = (s?.agents ?? []).filter(a => a.held).length
    const bad = (s?.services ?? []).filter(v => svcState(v.status, v.ageS, v.maxS) !== 'OK').length
    return (
      <Box>
        <Text>Claude {wk ? wk.percentUsed + '%' : '?'} week · Chat {m?.contextPct ?? '?'}% ({advice(m?.contextPct)}) · Agents held {held}/{s?.agents.length ?? '?'} · Services needing a look {bad} · /meter for all</Text>
      </Box>
    )
  })
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const lines = board(await read($, meter), await read($, snap), true)
    return <Box flexDirection="column">{lines.map(l => <Text>{l}</Text>)}</Box>
  })
}
