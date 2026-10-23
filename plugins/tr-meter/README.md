# tr-meter

David's in-chat dashboard for TradeRight work, drawn as a side pane plus a status line, in words (no colour coding):

- PLAN LIMITS: Weekly and 5-hour usage, % used, reset time in Central Time.
- THIS CHAT: how full the context window is, with "fine / wrap up soon / START A NEW CHAT", and cost so far.
- SERVICES / AGENTS: every heartbeat in D:\TradeRight\Repository\_service_heartbeats.csv labelled OK / LATE / DOWN, refreshed every 60 seconds through the Claude desktop device link (shows "computer not reachable" when the link is down).

`/meter` reopens the pane. Install once: `/plugin install tr-meter --marketplace davidmcmath/claude-mods`
