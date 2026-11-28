# PostHog Conversations

Conversations is opt-in. It requires an authenticated Payload collection and identity synchronization so the signed user matches the analytics distinct ID.

```ts
postHog({
  apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY!,
  payload: {
    conversations: {
      secret: process.env.POSTHOG_CONVERSATIONS_SECRET!,
      launcher: 'visible',
    },
  },
})
```

`secret` is the PostHog Conversations identity verification secret. Store it in a server-only environment variable. It is used to sign the namespaced Payload distinct ID with HMAC-SHA256 and is never sent to the browser. The plugin registers `GET /api/posthog/conversations/identity` under Payload's configured API route. The endpoint returns the signed-in identity and signature only to an authenticated same-origin request; anonymous, service, and API-key requests do not receive a signature.

`launcher: 'visible'` (default) allows the native launcher for verified users. `launcher: 'hidden'` leaves launcher controls to your UI. PostHog consent and SDK availability still apply. The launcher cannot open until both Payload identity verification and native SDK availability permit it.

## Custom launcher

```tsx
'use client'

import { usePostHogConversations } from '@klnap/payload-posthog/client'

export function ContactSupportButton() {
  const { status, canOpen, open } = usePostHogConversations()

  return (
    <button type="button" onClick={open} disabled={!canOpen}>
      {status === 'loading' ? 'Connecting…' : 'Contact support'}
    </button>
  )
}
```

The hook returns:

- `status`: `disabled`, `loading`, `ready`, or `unavailable`.
- `canOpen`: Payload identity is verified and policy allows opening. The SDK may still be loading.
- `isAvailable`: the native SDK reports Conversations available; this does not verify Payload identity.
- `open()`, `close()`, `show()`, and `hide()`: native panel/widget controls. `open()` queues until SDK readiness. `hide()` cancels a queued open.

Use `usePostHog().conversations` from `@posthog/next` for native tickets, messages, and themes. This package hook only manages Payload identity and launcher policy.

## Logout and identity lifecycle

On logout or account switch, the plugin resets the previous Payload identity and clears Conversations authorization state. A late verification response cannot restore a signed-out identity. The public hook then blocks `open()` and `show()` until the next signed-in user is verified.

Keep the plugin's identity endpoint path available and avoid registering a conflicting `GET` Payload endpoint. Do not disable `payload.identify` while Conversations is enabled.

See PostHog's [Support JavaScript API](https://posthog.com/docs/support/javascript-api) for the native widget methods.
