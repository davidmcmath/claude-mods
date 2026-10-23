export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Meter = { contextPct?: number; contextTokens?: number; window: number; limits: Limit[]; costUsd?: number; startedAt: number; at: number }
export type Svc = { name: string; state: 'OK' | 'LATE' | 'DOWN'; ageS: number; maxS: number; note: string }
export type Agents = { rows: Svc[]; at: number; error?: string }

declare module 'claude-code' {
  interface PluginState {
    'tr-meter': { meter: Shaped<Meter | null>; agents: Shaped<Agents | null> }
  }
}
