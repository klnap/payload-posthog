# Session Replay and privacy

The plugin configures native PostHog SDK options. It does not decide whether your application should record a session. The host owns consent, project settings, and the content rendered by the application.

## Replay defaults

- Password inputs are masked.
- Other input values and page text are visible by default: `maskAllInputs` defaults to `false`.
- Native PostHog Replay controls recording, sampling, and other masking behavior.
- Captured URLs are redacted by the plugin before outbound telemetry.

Use native PostHog options for stricter masking:

```ts
postHog({
  apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY!,
  clientOptions: {
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '.sensitive, [data-sensitive]',
    },
  },
})
```

The plugin always sets `maskInputOptions.password: true`, even when host-provided input-masking options specify another policy. Other host options take precedence over plugin defaults. Use native selectors such as `maskTextSelector` and elements marked with PostHog's `ph-no-capture` class to limit recorded content.

See PostHog's [Session Replay privacy guide](https://posthog.com/docs/session-replay/privacy) and [data collection privacy controls](https://posthog.com/docs/privacy/data-collection).

## URL redaction

Before the browser SDK sends events, the plugin redacts URL values in PostHog's URL-valued event properties, Replay page/navigation URLs, and URL-bearing element attributes:

- Every query value is replaced with `[REDACTED]`; parameter names remain.
- URL fragments are removed.
- Tokens in Payload's native reset and verification path segments are redacted. The plugin accounts for configured Payload Admin/API routes and reset route.

For example:

```text
/admin/reset/c0ffee-token?token=abc123#access_token=xyz
=> /admin/reset/[REDACTED]?token=[REDACTED]
```

This redaction does not sanitize arbitrary `posthog.capture()` properties, person properties, exception messages, request bodies, rendered DOM text, or other application-defined values. Do not send secrets in those fields. Parameter names remain visible.

PostHog's native `mask_personal_data_properties` defaults to `true`. The plugin merges its credential-like parameter names with `clientOptions.custom_personal_data_properties`; native matching is exact and case-sensitive. This native masking applies to the SDK's persisted attribution values, not to every event property.

**Accepted SDK limitation:** PostHog may persist raw URL values in browser storage before outbound redaction. The plugin does not rewrite SDK storage or add an SDK workaround. See [posthog-js issue #5362](https://github.com/PostHog/posthog-js/issues/5362).

## Initialization order and host overrides

The plugin installs URL redaction during Admin provider rendering before its own pageview component and descendants can capture events. A host-owned `capture_pageview: true` hands pageview ownership to the native SDK; an early SDK pageview may occur before the plugin callback is installed. Replay already started before initialization may also miss the callback.

The plugin disables referrer and campaign-parameter persistence by default because those values can contain URLs. Explicit host `save_referrer` or `save_campaign_params` values override those defaults; campaign data is not rewritten by the plugin. A host-owned `before_send` callback is not supported in `clientOptions`, because callbacks cannot cross the Payload server-to-client boundary. Do not replace the installed native callback through another SDK initialization.

## Data categories and ownership

| Data | Handling |
| --- | --- |
| Browser-local SDK persistence | Native PostHog storage may retain raw URL values before outbound redaction. |
| Outbound URL telemetry | The plugin redacts supported URL-valued properties before they leave the browser. |
| Replay content | Native Replay masking applies. Passwords are masked; other text and inputs are visible by default. |
| Application-defined properties | Not universally sanitized. Keep secrets out of custom events, person properties, and exception text. |
| Diagnostics | Server logs can contain explicitly mapped properties, including email. Do not send debug output to shared logs without appropriate controls. |
| Consent and retention | The host and PostHog project settings determine consent, access, recording policy, and retention. |

This is a bounded URL and Replay policy, not complete sanitization or a guarantee that secrets cannot be recorded.
