# claude-mods (David McMath, private)

## session-meter
A side pane beside the Claude chat that shows, in words and a text bar (no color coding):
- THIS CHAT: how full the context window is (% used, tokens used and left; HIGH at 75%, FULL at 90%).
- ACCOUNT: the 5-hour / 7-day usage-limit windows (% used, % left, time to reset) when reported.
- Cost of the session in dollars where tracked.
Updates after each reply. `/meter` reopens it.

Install once: `/plugin install session-meter --marketplace davidmcmath/claude-mods`
