export type Meter = {
  tokens?: number
  window: number
  percent?: number
  limits: { kind: string; percentUsed: number; resetsAt?: string }[]
  usd?: number
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    'session-meter': { meter: Meter | null }
  }
}
