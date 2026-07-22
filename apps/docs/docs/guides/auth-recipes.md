---
title: Auth recipes
---

# Auth recipes

AgentFace deliberately ships no auth adapters: principals are plain props,
and the model endpoint takes an `authorize` callback. Wiring your auth
provider is two touch-points, shown here for the common stacks.

Both touch-points matter:

1. **Principals** — who policy decisions run as. Every discovery, read,
   preparation, and execution carries them; changing the `user` prop
   applies immediately and invalidates outstanding preparations.
2. **`authorize` on the route** — the model endpoint is a proxy to your
   provider account; production deployments must authenticate it.

## Clerk

```tsx title="components/agentface-setup.tsx"
"use client";
import { useUser } from "@clerk/nextjs";

export function AgentFaceSetup({ children }: { children: ReactNode }) {
  const { user } = useUser();
  return (
    <AgentFaceApp
      manifest={applicationManifest}
      policy={standardUserPolicy()}
      {...(user
        ? {
            user: {
              type: "user",
              id: user.id,
              displayName: user.fullName ?? undefined,
              roles: (user.publicMetadata.roles as string[]) ?? [],
            },
          }
        : {})}
    >
      {children}
    </AgentFaceApp>
  );
}
```

```ts title="app/api/agentface/route.ts"
import { auth } from "@clerk/nextjs/server";

export const { POST } = createAgentFaceRouteHandler({
  adapter,
  authorize: async () =>
    (await auth()).userId ? null : new Response(null, { status: 401 }),
});
```

## Auth.js (NextAuth)

```tsx
const { data: session } = useSession();
// user: session?.user && { type: "user", id: session.user.id, ... }
```

```ts title="app/api/agentface/route.ts"
import { auth } from "@/auth";

export const { POST } = createAgentFaceRouteHandler({
  adapter,
  authorize: async () =>
    (await auth()) ? null : new Response(null, { status: 401 }),
});
```

## Supabase Auth

```tsx
const [user, setUser] = useState<UserPrincipal>();
useEffect(() => {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    setUser(
      session
        ? { type: "user", id: session.user.id, displayName: session.user.email }
        : undefined,
    );
  });
  return () => data.subscription.unsubscribe();
}, []);
```

```ts title="app/api/agentface/route.ts"
export const { POST } = createAgentFaceRouteHandler({
  adapter,
  authorize: async (request) => {
    const supabase = await createServerClient(request);
    const { data } = await supabase.auth.getUser();
    return data.user ? null : new Response(null, { status: 401 });
  },
});
```

## Agents acting under delegation

When a distinct agent identity operates on a user's behalf (service
integrations, background assistants), pass both principals and the
delegation; `standardUserPolicy` verifies the delegation names that agent
and has not expired:

```tsx
<AgentFaceApp
  user={user}
  agent={{ type: "agent", id: "assistant_1", model: "claude-opus-4-8" }}
  …
/>
```

Roles for `requireRole()` default to `user.roles` — map your provider's
claims into that field, as the Clerk example does.
