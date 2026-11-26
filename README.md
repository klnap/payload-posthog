# @klnap/payload-posthog

Native PostHog for Payload Admin. It identifies signed-in editors, tracks safe authentication flows, and supports authenticated PostHog Conversations.

A standard PostHog install does not know Payload. Admin is its own React tree with its own sign-in, so user identity, auth events and Support need wiring. This plugin provides that wiring. It mounts the official `PostHogProvider` from `@posthog/next` in Payload's Admin providers and passes your native `posthog-js` and `posthog-node` options straight through. It is not an analytics SDK of its own.

## Features

| Capability                           | Provided by                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| Product analytics and autocapture    | Native `posthog-js`; autocapture runs only on classified safe Admin routes   |
| Pageviews                            | Privacy-aware route tracker (see [Pageviews](#pageviews))                    |
| Admin resource reads                 | Plugin; lists, documents, globals, and version views                         |
| Automatic user identification        | Plugin                                                                       |
| Authentication lifecycle events      | Plugin                                                                       |
| Guest tracking on public auth routes | Plugin (`payload.guestTracking`)                                             |
| Session Replay                       | Native, with guest rules from the plugin                                     |
| Browser error tracking               | Native `posthog-js` (`capture_exceptions`)                                   |
| Next.js request errors               | Opt-in instrumentation helpers from `@klnap/payload-posthog/instrumentation` |
| Payload routed errors                | Plugin root `afterError` hook; unexpected errors only                        |
| Feature flags                        | Native `@posthog/next` hooks and `bootstrapFlags`                            |
| Authenticated Support                | Plugin identity endpoint and native Conversations                            |
| Source-map upload                    | Native `@posthog/nextjs-config`, re-exported                                 |

Products such as Replay, Error Tracking, Surveys or Feature Flags depend on your SDK options and your PostHog project settings. The plugin does not turn any of them on by itself.

## Install

```bash
bun add @klnap/payload-posthog
```

or

```bash
npm install @klnap/payload-posthog
```

Peer dependencies, from the package manifest:

- `payload` and `@payloadcms/ui` `>=3.94.1 <4`
- `next` `>=16.4.5 <17`
- `react` and `react-dom` `^19.3.1`
- `@posthog/next` `>=0.11.0 <1`. It is a 0.x release, so minor versions may change the API.
- `posthog-js` `>=1.444.0 <2` and `posthog-node` `>=5.61.2 <6`
- `@posthog/nextjs-config` `>=1.12.2 <2`, optional, only for source maps

Node `^24.22.3 || >=26.13.1`.

## Quick start

```ts
// payload.config.ts
import { PostHog } from '@klnap/payload-posthog'
import { buildConfig } from 'payload'

export default buildConfig({
  plugins: [
    PostHog({
      apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY!,
      clientOptions: {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        ui_host: 'https://eu.posthog.com',
      },
    }),
  ],
})
```

Set these environment variables:

- `NEXT_PUBLIC_POSTHOG_KEY`: your project API key (`phc_…`).
- `NEXT_PUBLIC_POSTHOG_HOST`: your PostHog ingestion host, for example `https://eu.i.posthog.com`.

Then regenerate Payload's import map so it can resolve the plugin's Admin provider:

```bash
bunx payload generate:importmap
```

## Configuration

`PostHog(options)` takes these top-level options:

| Option           | Forwarded to                       | Notes                                                                                             |
| ---------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| `apiKey`         | `PostHogProvider`                  | Required.                                                                                         |
| `clientOptions`  | `PostHogProvider` → `posthog-js`   | Native options. Function values are rejected.                                                     |
| `serverOptions`  | `PostHogProvider` → `posthog-node` | Native options, for example `host` for server-side flag evaluation. Function values are rejected. |
| `bootstrapFlags` | `PostHogProvider`                  | Native option. The plugin defaults it to `true`. See [Feature flags](#native-posthog-apis).       |
| `enabled`        | —                                  | `false` registers nothing. Defaults to `true`.                                                    |
| `payload`        | —                                  | Payload-specific options: `identify`, `guestTracking`, `support`, `capture`, `errorTracking`.     |

`payload.capture` configures Admin list, document, global, and version-view events: `collection_read`, `document_read`, `global_read`, `document_versions_read`, `document_version_read`, `global_versions_read`, and `global_version_read`. It does not capture mutations or general Admin activity.

Read events use route placeholders in `$current_url`. Numeric document and version IDs appear in separate properties; opaque IDs stay omitted.

```ts
PostHog({
  apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY!,
  payload: {
    capture: {
      collections: { defaults: { operations: ['listRead', 'read'] } },
      globals: { defaults: false },
    },
  },
})
```

Read events require a signed-in Admin identity and a classified resource route. Version events include only the resource slug and sanitized route template, never document or version IDs. Defaults enable eligible reads; use `defaults: false` to opt out by resource category. Event settings support custom names, properties, and deterministic `sampleRate` values.

Option names, types and defaults follow the installed upstream types. See [PostHogConfig](https://posthog.com/docs/references/posthog-js/types/PostHogConfig), [PostHogOptions](https://posthog.com/docs/references/posthog-node/types/PostHogOptions) and the [`@posthog/next` reference](https://posthog.com/docs/libraries/next-js/posthog-next) for the full list.

A typical configuration sets only what you need:

```ts
PostHog({
  apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY!,
  clientOptions: {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    ui_host: 'https://eu.posthog.com',
    capture_pageleave: true,
  },
  payload: {
    identify: { properties: { name: 'fullName' } },
    guestTracking: { paths: ['/accept-invitation', '/activate-account'] },
  },
})
```

### Function values are not supported

Client options cross Payload's server-to-client boundary, so functions cannot pass through. The plugin throws at startup if it finds one, for example `clientOptions.before_send must be serializable`. This affects native callbacks such as `before_send`, `loaded`, and Session Replay masking functions. There is no supported callback-module or import-map contract yet.

## User identification

Signed-in users are identified with the distinct ID `<collection>:<id>`, for example `users:12`. This keeps IDs from different auth collections apart.

- **Email** is mapped to the `email` person property by default.
- **Custom properties** come from `payload.identify.properties`. The key is the PostHog property name and the value is the Payload user field, such as `{ name: 'fullName' }`. Only string, number and boolean values are sent.
- **When it runs:** after the Admin loads the signed-in user, on the dashboard and collection or global views. Other Admin views do not identify, and neither do routes that carry sensitive query parameters or tokens.
- **Logout** calls `posthog.reset()`. A new anonymous ID starts for the next visit.
- **Switching accounts** resets the SDK, then identifies the new user.
- **Anonymous activity** before sign-in keeps its anonymous ID. PostHog associates it with the user when `identify` runs, according to its native identity behavior.

Disable identification with `payload: { identify: { enabled: false } }`.

The plugin does not synchronize identity from the server. Server events use whatever distinct ID your code passes to `posthog-node`.

## Guest tracking

Guest routes are Payload's public authentication routes, read from your Admin config: `createFirstUser`, `forgot`, `inactivity`, `login`, `logout`, `reset` and `unauthorized`. Add custom public routes with `paths`, relative to the Admin route:

```ts
payload: {
  guestTracking: { paths: ['/accept-invitation', '/activate-account'] },
}
```

`payload.guestTracking` controls two things on guest routes:

    - **Authentication lifecycle events:** `auth_flow_started` on form submit, `auth_login_succeeded` after a recent login and identity transition, `auth_logout_started`, `auth_logout_completed`, `auth_account_switched`, and `auth_session_expired` after an observed expiry transition. Each event carries a `route_template`, not the URL.
- **Session Replay** for guests on those routes.

Set `enabled: false` to turn both off for guests. Signed-in users are always tracked.

Guest tracking does not control pageviews or browser exception capture. The default pageview tracker suppresses authentication, custom, sensitive, and unsupported-query routes. Autocapture runs only on routes the tracker classifies as safe. See [Privacy and security](#privacy-and-security).

## Native PostHog APIs

Admin components run inside the plugin's `PostHogProvider`, so the official hooks and components work there. Import them from `@posthog/next`:

```tsx
'use client'

import { PostHogFeature, useFeatureFlag, usePostHog } from '@posthog/next'

export function PublishButton() {
  const posthog = usePostHog()
  const editor = useFeatureFlag('new-editor')

  return (
    <button onClick={() => posthog?.capture('publish_clicked', { collection: 'pages' })}>
      {editor?.enabled ? 'Publish (new editor)' : 'Publish'}
    </button>
  )
}

export function Beta({ children }: { children: React.ReactNode }) {
  return (
    <PostHogFeature flag='new-editor' match>
      {children}
    </PostHogFeature>
  )
}
```

`useFeatureFlag` returns a `FeatureFlagResult` or `undefined` until flags load. Check `.enabled` and `.variant`.

**`bootstrapFlags`** is a native option. When it is `true`, the server evaluates flags for the signed-in user and passes them to the browser, so the first render already has flag values. The plugin uses the identify properties as person properties for that evaluation. Bootstrapping only runs when the browser has a PostHog cookie. It also makes the Admin layout dynamic, because the server reads cookies.

## Pageviews

Pageview ownership follows `clientOptions.capture_pageview`:

| Value              | Who captures pageviews                                                        |
| ------------------ | ----------------------------------------------------------------------------- |
| omitted (default)  | Plugin tracker emits `$pageview` on safe, classified routes                   |
| `false`            | Nothing automatic. Capture with `posthog.capture('$pageview')`                |
| `true`             | The SDK, for the initial page load only. Admin route changes are not captured |
| `'history_change'` | The SDK, for the initial load and history changes                             |
| object form        | The SDK, using the object form of `capture_pageview` from `posthog-js`        |

The default tracker strips query strings, hashes, and document IDs from pageview properties. It suppresses custom, authentication, sensitive, and queried routes. Numeric `depth` and `limit` parameters are allowed for safe Admin views but removed from pageview URLs; other query parameters suppress tracking. It enables autocapture only on classified safe routes. Explicitly setting `capture_pageview` opts out of these protections and returns pageview ownership to the native SDK.

The plugin deduplicates repeated renders of the same route. A packed Next.js consumer emitted `$pageview` and `collection_read` to a local sink; read URLs omitted `depth` and `limit`, and referrers omitted a previous credential-query URL.

## Session Replay and Error Tracking

Use Session Replay and Error Tracking to reproduce reported problems, see what editors did before an error, and connect exceptions to the user who hit them. Error stack traces are readable when you upload source maps (see [Source maps](#source-maps)).

**Session Replay:**

- Recording starts only after the Admin user and route pass the plugin's privacy checks. Routes with unsupported query parameters, sensitive routes, and unclassified routes stay unrecorded.
- Guest recordings follow `payload.guestTracking` and run only on configured guest routes.
- The plugin configures all inputs to be masked by default, and password inputs stay masked even if other masking options change. Live Replay payload masking has not been verified.
- Set `disable_session_recording: true` to keep Replay off.

**Browser Error Tracking:** native `capture_exceptions` behavior follows `posthog-js` options. With `capture_exceptions: true`, a synthetic exception message reached the local sink unchanged; this plugin cannot pass a browser `before_send` callback. Enable it only when host errors cannot contain secrets.

**Payload routed errors:** unexpected errors handled by Payload's root `afterError` hook are captured by default. HTTP 4xx errors are suppressed. Disable this integration with `payload.errorTracking.enabled: false`, or add a server-side filter:

```ts
PostHog({
  apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY!,
  payload: {
    errorTracking: {
      shouldCapture: ({ error, collection, status }) =>
        status === 500 && collection !== 'privateRecords',
    },
  },
})
```

The filter cannot enable HTTP 4xx capture. Error messages, exception values, request URLs, and full file paths are removed before delivery. Stack frames retain only safe function names, line numbers, and file basenames. This hook covers errors that reach Payload's routed REST error handler; it does not prove coverage for GraphQL or caught errors.

Payload awaits one immediate send attempt to reduce event loss in short-lived serverless processes. The default request timeout is 2 seconds with no retries; `serverOptions.requestTimeout` and `serverOptions.fetchRetryCount` override these limits. SDK failures never replace the Payload response.

**Next.js request errors:** opt in from the host's single `instrumentation.ts` file:

```ts
// instrumentation.ts
import { capturePostHogError, registerPostHog } from '@klnap/payload-posthog/instrumentation'

export async function register() {
  await registerPostHog()
}

export const onRequestError = capturePostHogError
```

The helper reads `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST`. It uses `@posthog/next`'s separate cached Node client, not the client created from Payload's `serverOptions`. Exception details and request URLs are sanitized before capture. Next's request hook does not cover Proxy failures, build errors, or every caught exception.

Session Replay can record visible Admin content. The default input mask reduces exposure but does not hide all text, images, or personal data.

## Authenticated Support

PostHog Support gives signed-in editors a conversation with your team from the Admin. The plugin verifies identity on the server, so no one can open a conversation as another user.

```ts
PostHog({
  apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY!,
  payload: {
    support: {
      identitySecret: process.env.POSTHOG_SUPPORT_IDENTITY_SECRET!,
      launcher: 'hidden',
    },
  },
})
```

- **Identity endpoint:** `GET <Payload API route>/posthog/support/identity` returns the signed distinct ID for the signed-in user. It requires an authenticated Payload collection. Anonymous Support is not supported.
- **Secret:** `identitySecret` is the PostHog Support identity verification secret. Keep it in server-only environment variables. It never reaches the browser.
- **Launcher:** `'visible'` (default) shows PostHog's own widget button. `'hidden'` leaves the button to you.
- **Conversations:** Support enables Conversations. Setting `disable_conversations: true` in `clientOptions` turns it off.

Configuring Support does not render a button. Add your own with `usePostHogSupport`:

```tsx
'use client'

import { usePostHogSupport } from '@klnap/payload-posthog/client'

export function ContactSupport() {
  const { canOpen, open } = usePostHogSupport()

  return (
    <button disabled={!canOpen} onClick={() => void open()}>
      Contact support
    </button>
  )
}
```

The hook reads your Admin route from the Payload config. It returns `status`, `isAvailable`, `canOpen`, `open` and `close`.

## Source maps

Source maps give readable stack traces in PostHog Error Tracking. Upload is a build-time step, separate from the runtime plugin. Wrap your Next.js config with PostHog's integration:

```ts
// next.config.ts
import { withPostHogConfig } from '@klnap/payload-posthog/next-config'

export default withPostHogConfig(nextConfig, {
  personalApiKey: process.env.POSTHOG_API_KEY!,
  projectId: process.env.POSTHOG_PROJECT_ID!,
  host: process.env.POSTHOG_HOST,
  sourcemaps: {
    releaseName: 'studio',
    releaseVersion: process.env.VERCEL_GIT_COMMIT_SHA,
    deleteAfterUpload: true,
  },
})
```

- `personalApiKey` is a personal API key with permission to upload source maps. It is not the project key, and it must stay on the server.
- `sourcemaps.enabled` defaults to `true`. `failOnError` defaults to `true`, so an upload failure fails the build. Set it to `false` to continue instead.
- `deleteAfterUpload: true` removes the maps from the build output once they are uploaded.
- Install `@posthog/nextjs-config` to use this export.

## Privacy and security

The plugin applies privacy guards before its own Admin pageview and autocapture events. It also sets these native defaults:

- `disable_capture_url_hashes: true` removes `#fragments` from captured URLs.
- `save_referrer: false` prevents a previous URL from leaking sensitive query values.
- `session_recording.maskInputOptions.password: true` masks password inputs.
- `session_recording.maskAllInputs: true` masks all input values by default.
- `session_recording.maskTextSelector` always includes `[contenteditable]` while preserving host selectors.
- `disable_conversations` follows whether Support is configured.

The native `save_campaign_params` default is unchanged.

> **Warning:** Native capture paths can still include sensitive data. Setting `clientOptions.capture_pageview` explicitly opts out of the plugin's safe pageview tracker. Native autocapture behavior is gated by route classification, but exception messages and Replay content need application-level review.

Replay masks form controls, editable content, and native marked regions. Ordinary unmarked text remains visible; do not render credentials as unmarked text.

The plugin's switches cannot prevent this on their own:

- `capture_pageview: false` stops automatic pageviews, but you lose navigation analytics on every page.
- `disable_session_recording: true` stops Session Replay everywhere.
- `autocapture: false` stops autocapture everywhere.
- `payload.guestTracking: { enabled: false }` stops authentication events and guest replay, but not pageviews, autocapture or exception capture.

The plugin cannot configure native callbacks through serialized client options. Review browser errors, referrals, custom Admin routes, and Replay content before enabling telemetry.

Keep these values on the server only: `payload.support.identitySecret`, `POSTHOG_API_KEY` (personal API key) and any server credentials.

## Documentation

- [PostHog and `posthog-js` reference](https://posthog.com/docs/references/posthog-js/types/PostHogConfig)
- [`posthog-node` reference](https://posthog.com/docs/references/posthog-node/types/PostHogOptions)
- [`@posthog/next`](https://posthog.com/docs/libraries/next-js/posthog-next)
- [Payload custom components and import map](https://payloadcms.com/docs/custom-components/overview)
- [Contributing](./CONTRIBUTING.md), [Security](./SECURITY.md) and [Changelog](./CHANGELOG.md)

## License

[MIT](./LICENSE)
