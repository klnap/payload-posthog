# Debugging and troubleshooting

Set `debug: true` to print plugin diagnostics in the Payload server terminal:

```ts
postHog({
  apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  debug: true,
})
```

With a key, output includes initialization mode, configured mappings, resolved identity and property values, and Conversations configuration/status. Without a key, the plugin runs keyless identity diagnostics only. Keyless mode registers no provider, error capture, Conversations endpoint, PostHog SDK, or remote SDK assets.

Diagnostics append to existing Payload `afterMe` hooks and do not replace the authentication response. Repeated output is suppressed across server chunks, but process restarts or cache eviction can cause it to appear again. Logging errors are swallowed so they do not break authentication or Conversations responses.

## Read the output correctly

- A resolved ID such as `users:123` shows the identity that would be used.
- Mapped values are read from the `/me` response under Payload's access rules.
- `omitted (missing or unsupported)` means the path did not resolve to a supported primitive value.
- `Identified in the browser when consent allows.` does not prove consent, network transmission, PostHog acceptance, or delivery.
- `Not transmitted: keyless mode.` means no telemetry SDK is initialized.
- Conversations diagnostics never print the signing secret or HMAC signature.

Mapped properties may include personal data, especially `email`. Avoid shared or long-retention logs, and disable `debug` after troubleshooting. This plugin diagnostic option is distinct from native browser SDK `clientOptions.debug`.

## Common checks

| Symptom | Check |
| --- | --- |
| No Admin telemetry | Confirm `enabled` is not `false`, `apiKey` is set, and the provider is included in the Payload build. |
| Identity remains anonymous | Confirm the collection is authenticated, the Admin user collection is configured as expected, `/me` returns the user, and consent permits capture. |
| A mapped property is absent | Check the dotted path and that the value is a string, boolean, finite number, or supported primitive array. For `[]`, confirm relationships are already populated. |
| Feature flag is unavailable on first render | Client-side evaluation is the default. Add `bootstrapFlags` only if server bootstrap and request-time rendering are acceptable. |
| Conversations stays unavailable | Check the server secret, authenticated collection, `payload.identify`, endpoint path, consent, and native SDK availability. |
| Error events are missing | Separate browser exceptions, Payload REST `afterError`, and Next.js `onRequestError`; each has its own configuration and coverage. |
| Replay contains visible text | Password inputs are masked by default; enable `maskAllInputs`, `maskTextSelector`, or `ph-no-capture` for other content. |

For privacy boundaries, see [Session Replay and privacy](session-replay-and-privacy.md). For integrations, see [Error Tracking](error-tracking.md) and [Conversations](conversations.md).
