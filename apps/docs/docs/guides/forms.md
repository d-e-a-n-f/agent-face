---
title: Forms (useAgentForm)
---

# Forms — `useAgentForm`

The **agent-as-helper** pattern: your form stays the primary interface, owned
by the human; the agent fills it *through the same form state*, so fields
visibly populate, the human edits anything, and submission stays theirs.

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAgentForm } from "@agentface/react/hook-form";

const form = useForm<OnboardingValues>({
  resolver: zodResolver(onboardingSchema),
  mode: "onChange",
});

useAgentForm({
  form,
  name: "Onboarding form",
  description: "company, registered address, and primary contact details",
  isEnabled: () => !submitted,
});
```

One call derives:

- a **`form-state` resource** — current values plus outstanding validation
  issues;
- a **`fill-form` action** — accepts any subset of the form's fields (nested
  partials supported), writes each through `form.setValue` with validation,
  and returns what was applied, what was ignored, and what still blocks
  submission.

## Why the resolver stays in charge

`useAgentForm` doesn't duplicate your schema. Fills run through the form's own
resolver, and remaining issues return to the agent — so it knows exactly what
to fix next, and your validation rules exist in exactly one place.

## Safety at the boundary

Untrusted fill input is pruned to the form's shape: unknown fields are
dropped before they touch the form, and primitive type mismatches are
rejected as `INVALID_INPUT` at prepare time. A structural JSON Schema is
derived from the form's default values for the model's tool definition
(override with `inputSchema` if you want richer descriptions).

## What stays yours

Submission. Register your own `save-draft`/`submit` actions (typically
`confirmation: "always"` on submit, with a `form.trigger()` precondition) —
apps differ too much here for the hook to guess. The Portal's onboarding form
is the worked example.
