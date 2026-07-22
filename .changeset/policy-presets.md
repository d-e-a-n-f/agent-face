---
"@agentface/policy": minor
---

Policy presets and a composable rule library, so adopters get a sound
policy without designing an engine:

- Presets: `developmentPolicy()` (allow + confirm confidential),
  `standardUserPolicy()` (require user, delegation-checked agents,
  restricted denied, confidential confirmed, composable extra rules),
  `readOnlyPolicy()`.
- Rules: `requireUser()`, `requireRole()` (defaults to the user
  principal's roles), `requireSameTenant()`, `requireDelegation()`,
  `limitActionRate()`, `limitMonetaryValue()` (deny above max, confirm
  above threshold, caller-supplied `amountOf`),
  `denyOutsideBusinessHours()` — all deterministic with injectable
  clocks/extractors.
