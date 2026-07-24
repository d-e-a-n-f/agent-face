---
"@agentface/assistant": patch
---

The widget is now discoverable by automation and correct per WCAG
label-in-name: the launcher's accessible name is its visible text
("<title> ✦", aria-label removed), and every interactive element carries
a stable `agentface-assistant-*` data-testid (launcher, panel, input,
send, stop, close, clear, confirm, decline).
