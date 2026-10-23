export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Meter = { contextPct?: number; window: number; limits: Limit[]; costUsd?: number; at: number }
export type Svc = { name: string; status: string; ageS: number; maxS: number; note: string }
export type Agent = { name: string; health?: string | null; mode?: string | null; open?: number | null; held?: string | null; lastPass?: string | null; lastPoll?: string | null }
export type Snap = { services: Svc[]; agents: Agent[]; runner: string | null; errors: string[]; at: number; error?: string }

declare module 'claude-code' {
  interface PluginState {
    'tr-meter': { meter: Shaped<Meter | null>; snap: Shaped<Snap | null> }
  }
}
