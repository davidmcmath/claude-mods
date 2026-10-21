import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'session-meter',
  component: 'Pane',
  requestId: 'session-meter',
  props: { title: 'Session meter', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

test('pane shows context fill and limits in words', async ($, on) => {
  on('command.register', () => ({ value: { command: 'meter' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 150000, window: 200000, percent: 75 }, rateLimits: [{ kind: 'five_hour', percentUsed: 40 }], cost: { usd: 3.5 } } }))

  on('clock.now', () => ({ value: 1000 }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure({ context: { tokens: 150000, window: 200000, percent: 75 }, rateLimits: [{ kind: 'five_hour', percentUsed: 40 }], cost: { usd: 3.5 }, changed: ['context'] })
  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /75%/ }))?.text).toContain('HIGH')
    expect((await ui.find({ type: 'Text', text: /left/ }))?.text).toContain('50k left')
    expect((await ui.find({ type: 'Text', text: /5-hour/ }))?.text).toContain('60% left')
    await ui.unmount()
  }
})
