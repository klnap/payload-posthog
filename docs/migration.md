# Migration from 0.1.1

Version `0.2.0` replaces the original API with a native-first Payload Admin integration. This is a breaking pre-1.0 release. The new package focuses on identity, native PostHog telemetry, Error Tracking, Session Replay privacy, and authenticated Conversations.

## Factory and options

```diff
- import { PostHog } from '@klnap/payload-posthog'
+ import { postHog } from '@klnap/payload-posthog'

- plugins: [PostHog({ apiKey, payload: { support: { identitySecret } } })]
+ plugins: [postHog({
+   apiKey,
+   payload: { conversations: { secret: identitySecret } },
+ })]
```

The factory is now `postHog()`. `payload.support.identitySecret` is now `payload.conversations.secret`; `support` options and support-specific types are removed. Store the Conversations secret in a server-only environment variable.

## Client API and exports

| 0.1.1 | 0.2.0 |
| --- | --- |
| `usePostHogSupport()` from `@klnap/payload-posthog/client` | `usePostHogConversations()` from the same subpath |
| `PostHogSupportStatus`, `PostHogSupportOpenResult`, `PostHogSupportUnavailableReason` | `PostHogConversationsStatus` and `PostHogConversationsControls`; the old result and reason types have no direct replacements |
| `@klnap/payload-posthog/support` | Removed; use native `@posthog/next` Conversations APIs and the client hook |
| `@klnap/payload-posthog/support/server` | Removed; the plugin owns its authenticated identity endpoint |
| `@klnap/payload-posthog/admin` | Retained |
| `@klnap/payload-posthog/client` | Retained with renamed Conversations exports |
| `@klnap/payload-posthog/next-config` | Retained |

The root export continues to provide `postHog`, `payloadDistinctId`, and `PayloadPostHogOptions`. The new `./instrumentation` subpath adds `registerPostHog` and `capturePostHogError`.

## Behavior changes

- Identity uses `<auth-collection>:<id>`, maps `email` by default, supports dotted and `[]` relationship paths, and resets on logout/account switch.
- Browser SDK behavior is native. Pageviews, autocapture, Replay, consent, and feature flags use PostHog configuration rather than package-specific event wrappers.
- Payload REST errors and Next.js request errors have distinct integrations. They are not the old package's single browser exception setting.
- Conversations verifies authenticated Payload identity server-side. Update `payload.support` configuration and replace `usePostHogSupport`.
- Keyless `debug: true` is diagnostics only; it does not initialize PostHog.
- Password inputs are masked in Replay by default. Other input values and text remain visible unless native masking is configured.
- The plugin redacts supported URLs before outbound telemetry; this does not sanitize arbitrary properties, exception messages, Replay DOM content, or values already persisted in browser SDK storage.

## Removed behavior

The old `guestTracking` option, authentication lifecycle events, guest-route tracking, Session Replay guest policy, Admin read tracking, custom Support event helpers, and support server APIs are not part of the new API. Do not recreate them as a migration step. Use native PostHog capture APIs for application events you own.

Review the [configuration guide](configuration-and-identification.md), [Conversations guide](conversations.md), and [privacy guide](session-replay-and-privacy.md) before enabling telemetry in production.
