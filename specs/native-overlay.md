# Native PostHog overlay

Status: implemented. Owner: `@klnap/payload-posthog`.

## Goal

Use PostHog as Next.js ships it. The plugin is a thin layer that makes `@posthog/next` work inside Payload Admin. It adds Payload wiring only: user identity, authentication lifecycle events, guest routes, and authenticated Support. It does not wrap, replace, or re-implement PostHog SDK behavior.

## Public API

```ts
postHog({
  apiKey: string,                          // required, project API key
  enabled?: boolean,                       // false registers nothing; default true
  clientOptions?: Partial<PostHogConfig>,  // native posthog-js options; no function values
  serverOptions?: Partial<PostHogOptions>, // native posthog-node options; no function values
  bootstrapFlags?: boolean | BootstrapFlagsConfig, // native; plugin default true
  payload?: {
    identify?: { enabled?: boolean; properties?: Record<string, string> },
    guestTracking?: { enabled?: boolean; paths?: string[] },
    support?: { launcher?: 'visible' | 'hidden'; identitySecret: string },
  },
})
```

- Option types come from the installed upstream types. Names and value sets are not redefined.
- Function-valued options fail at config time (`... must be serializable`). They cannot cross the Payload server-to-client boundary. This includes `before_send`, `loaded`, and session-recording callbacks.
- `payload` holds only Payload-specific wiring. There are no feature switches, sanitizer options, or pageview modes in the plugin.

## Provider

- The plugin mounts `PostHogProvider` from `@posthog/next` in Payload's Admin providers.
- `normalizeClientOptions` sets only the defaults listed under Privacy. Every other option passes through.
- `bootstrapFlags` defaults to `true`, so flags are evaluated on the server for the signed-in user when a PostHog cookie exists.

## Pageviews

Owner follows `clientOptions.capture_pageview`:

| Value                                   | Owner                                    |
| --------------------------------------- | ---------------------------------------- |
| omitted                                 | `PostHogPageView`, mounted by the plugin |
| `false`                                 | none                                     |
| `true`, `'history_change'`, object form | SDK; the plugin mounts nothing           |

The plugin's default of `capture_pageview: false` prevents the SDK from adding its own pageviews when `PostHogPageView` is mounted. Duplicate-pageview behavior is not verified in a live browser.

## Identity

- Signed-in users are identified as `<collection>:<id>`, with `email` mapped by default and `payload.identify.properties` adding mappings.
- Identification runs on the dashboard and collection or global views. Other Admin views and routes with sensitive query parameters do not identify.
- Logout and account switches call `posthog.reset()`. Anonymous activity is associated by PostHog's native `identify` behavior.

## Guest tracking

- Guest routes are Payload's public auth routes, read from `admin.routes`: `createFirstUser`, `forgot`, `inactivity`, `login`, `logout`, `reset`, `unauthorized`, plus `payload.guestTracking.paths`.
- `payload.guestTracking` controls two things on guest routes: authentication lifecycle events (`auth_flow_started`, `auth_login_succeeded`, `auth_logout_started`, `auth_logout_completed`, `auth_account_switched`, `auth_session_expired`) and Session Replay.
- `enabled: false` disables both for guests. Authenticated users are always tracked.
- It does not control pageviews, autocapture, or exception capture. Those follow native configuration on every Admin page.
- Auth events carry a `route_template` (sanitized route name), not the URL.

## Session Replay and Error Tracking

- Recording follows the native `disable_session_recording` default. The plugin starts and stops it per the guest rules above.
- Password inputs are masked (`maskInputOptions.password: true`).
- `maskAllInputs` defaults to `true`; passwords stay masked even if the host weakens this option.
- `[contenteditable]` is always included in `maskTextSelector`; host selectors are preserved.
- `capture_exceptions` is native (on by default in the Next.js provider).

## Privacy

Plugin-set defaults:

- `disable_capture_url_hashes: true`.
- `save_referrer: false` prevents previous URLs from carrying sensitive query values.
- `session_recording.maskInputOptions.password: true`.
- `session_recording.maskAllInputs: true`.
- `session_recording.maskTextSelector` includes `[contenteditable]`.
- `disable_conversations` follows whether Support is configured.

Native and not changed: `save_campaign_params`, autocapture, exception capture, consent, persistence, feature flags.

Not provided:

- No universal URL sanitizer. The default Admin pageview tracker suppresses queried routes and removes query strings; explicitly setting native `capture_pageview` opts out.
- Native referrer capture is disabled because a previous route can contain sensitive query values.
- No `before_send` through the plugin, because callbacks are rejected. Hosts cannot scrub events through the plugin.
- No runtime SDK mutations, monkeypatches, or custom persistence cleanup.

Mitigations available: `capture_pageview: false`, `disable_session_recording: true`, `autocapture: false`, `payload.guestTracking.enabled: false` (events and guest replay only).

## Support

- `payload.support` enables the identity endpoint `GET <Payload API route>/posthog/support/identity`. It requires an authenticated Payload collection. Anonymous Support is not supported.
- `identitySecret` is server-only and never reaches the browser.
- `launcher` defaults to `'visible'`. `'hidden'` leaves the button to the host.
- Configuring Support does not render a button. Hosts call `usePostHogSupport()` from `@klnap/payload-posthog/client`. The hook reads the Admin route from the live Payload config.

## Source maps

Build-time only, through `withPostHogConfig` re-exported from `@klnap/payload-posthog/next-config`. Requires `@posthog/nextjs-config`. Source-map credentials are not part of `postHog()`.

## Non-goals

- No analytics framework, event registry, or feature toggles.
- No second provider, second PostHog client, or plugin-owned flag bootstrap.
- No Next.js rewrites, ingestion endpoints, or redirect proxies.

## Verification

- Done: typecheck, Biome, oxlint, unit tests (75), knip, `check:exports`, build, `check:package`, `check:release`, README examples typecheck against the package.
- Not done: browser verification of pageview duplication, identity transitions, guest gating, replay masking, Support, and the reverse proxy. Each needs a live Admin session.
