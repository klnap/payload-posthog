# @klnap/payload-posthog

Native PostHog integration for Payload CMS.

Wire PostHog into Payload Admin and connect authenticated Payload users to their analytics and errors. The plugin uses PostHog’s native SDKs and needs no manual provider or Admin layout changes.

## Why?

When an editor reports a problem, developers can connect the user’s errors with their activity and available session recordings. Product Analytics adds context, while Conversations lets teams support users from Payload Admin.

## Features

- **Payload Admin integration** — Adds PostHog across the Admin, including custom and anonymous views.
- **User identification** — Syncs authenticated Payload users and resets identity on logout or account switching.
- **Person property mapping** — Supports nested fields, primitive arrays, and projections over populated relationships.
- **Browser Error Tracking** — Captures browser exceptions through PostHog’s native SDK.
- **Payload REST Error Tracking** — Captures unexpected REST errors with an optional server-side filter.
- **Next.js instrumentation** — Captures Next.js request errors through its instrumentation hook.
- **Source Maps** — Uploads production source maps so PostHog can resolve minified stack traces.
- **Session Replay** — Records Payload Admin sessions; password inputs are masked by default.
- **Product Analytics** — Supports native pageviews, autocapture, and custom events in Payload Admin.
- **Feature Flags** — Supports browser evaluation and optional server-side bootstrap.
- **Authenticated Conversations** — Provides native and custom launcher options for signed-in users.
- **Privacy controls** — Redacts supported URLs and masks password inputs.
- **Debugging** — Inspect resolved identities and person properties in your terminal, even without a PostHog project.
- **Native SDK access** — Retain access to PostHog’s native hooks, APIs, and configuration.

PostHog project settings and native SDK options control optional products such as browser exception capture, Replay, and Conversations.

## Installation

**Bun**

```sh
bun add @klnap/payload-posthog
```

**npm**

```sh
npm install @klnap/payload-posthog
```

The package requires Node.js `^24.22.3 || >=26.13.1`. Required peers include Payload, `@payloadcms/ui`, Next.js, React, `react-dom`, `@posthog/next`, `posthog-js`, and `posthog-node`. See [`package.json`](./package.json) for supported versions.

## Usage

Add the plugin to your existing Payload configuration:

```ts
// payload.config.ts
import { buildConfig } from 'payload'
import { postHog } from '@klnap/payload-posthog'

export default buildConfig({
  // Your existing Payload configuration
  plugins: [
    postHog({
      apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY,
      clientOptions: {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST, // https://eu.i.posthog.com
      },
      serverOptions: {
        host: process.env.NEXT_PUBLIC_POSTHOG_HOST, // https://eu.i.posthog.com
      },
    }),
  ],
})
```

Set `NEXT_PUBLIC_POSTHOG_KEY` to your public PostHog project key. Set `NEXT_PUBLIC_POSTHOG_HOST` to your PostHog ingestion host when using a non-default region or a self-hosted instance. The example applies it to both browser telemetry and server-side Payload error capture.

```dotenv
NEXT_PUBLIC_POSTHOG_KEY=phc_your_project_key
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
```

Ensure required environment variables are present and correctly typed in your application; these examples omit validation.

The plugin adds PostHog to the Payload Admin provider scope. It captures route-template pageviews and, when an authenticated user is available, synchronizes that user’s identity. Unexpected Payload REST errors are captured server-side. Browser exception capture, autocapture, and Replay follow native PostHog settings. No manual provider, layout modification, stylesheet import, or `transpilePackages` entry is required.

## User Identification

Authenticated users are identified using their Payload collection and ID, such as `users:123`. The browser identity comes from Payload Admin’s authenticated user context. For server-side errors, the plugin uses the request user’s collection when available and falls back to the Payload Admin user collection.

Email maps to the PostHog `email` person property by default. Add mappings for other properties:

```ts
postHog({
  apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  payload: {
    identify: {
      properties: {
        name: 'profile.fullName',
        roles: 'roles[].name',
      },
    },
  },
})
```

| Path               | Value                                           |
| ------------------ | ----------------------------------------------- |
| `name`             | Direct field                                    |
| `profile.fullName` | Nested field                                    |
| `roles`            | Array of primitive values                       |
| `roles[].name`     | `name` projected from each populated array item |

The plugin reads the user object returned by Payload; it does not fetch or populate relationships. Missing and unsupported values are omitted. Logout and account switching reset the previous identity before applying the next one.

For example, the mapping can produce the distinct ID `users:123` and person properties like:

```json
{
  "email": "joe.doe@example.com",
  "name": "Joe Doe",
  "roles": ["admin", "editor"]
}
```

Use `payloadDistinctId(collection, id)` from the package root when your own server-side events need the same namespaced ID. See [Configuration and identification](docs/configuration-and-identification.md) for mapping details.

## Error Tracking

The package integrates three separate error paths: browser exceptions, Payload REST errors, and Next.js request errors. Source-map upload is configured separately at build time.

### Browser Errors

Browser exception capture is native `posthog-js` behavior. The plugin does not force it on. Configure `clientOptions.capture_exceptions` and your PostHog project settings to control capture.

### Payload Errors

The plugin captures unexpected Payload REST errors with `posthog-node` and adds the authenticated user’s distinct ID when available. Expected HTTP 4xx errors are suppressed. Telemetry failures do not change the original Payload response.

Add an optional server-side filter:

```ts
payload: {
  errorTracking: {
    shouldCapture: ({ status }) => status === 500,
  },
}
```

This captures errors handled by Payload’s REST error hook, not arbitrary application exceptions. Server errors are associated with the user, not necessarily an exact browser session. See [Error Tracking and Next.js instrumentation](docs/error-tracking.md).

### Next.js Errors

Add the package helpers to your existing root `instrumentation.ts` or `src/instrumentation.ts`:

```ts
// instrumentation.ts
import type { Instrumentation } from 'next'
import { capturePostHogError, registerPostHog } from '@klnap/payload-posthog/instrumentation'

export async function register() {
  await registerPostHog()
}

export async function onRequestError(...args: Parameters<Instrumentation.onRequestError>) {
  await capturePostHogError(...args)
}
```

Next.js instrumentation is configured separately from the Payload plugin and reads `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` independently. Keep these exports in your instrumentation file and compose any other handlers there. See the [Next.js instrumentation reference](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation).

### Source Maps

Production source maps are strongly recommended for Error Tracking: they let PostHog resolve minified stack traces to readable source-code locations. The uploader is optional for the package, but required if you configure source-map uploads. Install it:

```sh
bun add --dev @posthog/nextjs-config
```

```sh
npm install --save-dev @posthog/nextjs-config
```

Wrap your existing Next.js configuration:

```ts
// next.config.ts
import type { NextConfig } from 'next'
import { withPostHogConfig } from '@klnap/payload-posthog/next-config'

const nextConfig: NextConfig = {
  // Your existing Next.js configuration
}

export default withPostHogConfig(nextConfig, {
  personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY,
  projectId: process.env.POSTHOG_PROJECT_ID,
  host: process.env.POSTHOG_HOST,
  sourcemaps: {
    enabled: process.env.POSTHOG_UPLOAD_SOURCEMAPS === 'true',
    releaseName: 'cms',
    deleteAfterUpload: true,
  },
})
```

`nextConfig` is your existing Next.js configuration. `POSTHOG_UPLOAD_SOURCEMAPS` is an explicit build-time opt-in: set it to `true` in the production deployment environment to enable uploads. When omitted or set to `false`, uploads remain disabled. Do not put this setting in a shared local environment file. When upload is disabled, the native helper does not require valid project or personal API key values. Keep `POSTHOG_PERSONAL_API_KEY` server-side.

For a non-US or self-hosted instance, set `POSTHOG_HOST` to its management API origin (for example, `https://eu.posthog.com`). This differs from the ingestion host in `NEXT_PUBLIC_POSTHOG_HOST` (for example, `https://eu.i.posthog.com`). See PostHog’s [Next.js source-map guide](https://posthog.com/docs/error-tracking/upload-source-maps/nextjs).

Production deployment build environment (example values):

```dotenv
POSTHOG_PERSONAL_API_KEY=phx_your_personal_api_key
POSTHOG_PROJECT_ID=12345
POSTHOG_HOST=https://eu.posthog.com
POSTHOG_UPLOAD_SOURCEMAPS=true
```

## Session Replay

Session Replay uses PostHog’s native recording. When enabled in your project and SDK settings, recordings help show what users experienced before and during an issue. Recording is scoped to Payload Admin.

Password inputs are masked by default. Other input values and page text are visible unless you configure additional masking. For example:

```ts
postHog({
  apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  clientOptions: {
    session_recording: {
      maskAllInputs: true,
    },
  },
})
```

Native `session_recording` options support additional masking. Password masking remains enabled. Set `clientOptions.disable_session_recording: true` to disable recording for this SDK. See PostHog’s [Session Replay privacy guide](https://posthog.com/docs/session-replay/privacy).

## Product Analytics

The plugin captures route-template pageviews in Payload Admin. Native PostHog autocapture follows your SDK options and project settings. Capture custom events from Admin components with the native client:

```tsx
'use client'

import { usePostHog } from '@posthog/next'

export function HelpButton() {
  const posthog = usePostHog()

  return (
    <button type='button' onClick={() => posthog.capture('help_clicked')}>
      Help
    </button>
  )
}
```

When Payload identity is available and consent permits capture, events use that identity. The package does not add a separate analytics API or restrict native PostHog events.

## Feature Flags

Browser-side flag evaluation works without server bootstrap:

```tsx
'use client'

import { useFeatureFlag } from '@posthog/next'

export function NewEditor() {
  const flag = useFeatureFlag('new-editor')
  return flag?.enabled ? <p>New editor is enabled.</p> : null
}
```

Use `bootstrapFlags` only when you want server-side evaluation:

```ts
postHog({
  apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  bootstrapFlags: true,
})
```

Bootstrap uses the PostHog identity cookie and opts Admin routes into request-time rendering. Browser evaluation does not require it. See [Configuration and identification](docs/configuration-and-identification.md).

## Conversations

Enable authenticated Conversations with a server-only signing secret:

```ts
postHog({
  apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  payload: {
    conversations: {
      secret: process.env.POSTHOG_CONVERSATIONS_SECRET,
      launcher: 'visible',
    },
  },
})
```

The plugin verifies the signed-in Payload user on the server and associates Conversations with the same PostHog distinct ID. `POSTHOG_CONVERSATIONS_SECRET` is used for identity verification and must remain server-side. Configure Conversations in your PostHog project as well.

```dotenv
POSTHOG_CONVERSATIONS_SECRET=your_identity_verification_secret
```

`launcher: 'visible'` shows the native PostHog launcher for verified users. Use `'hidden'` when your UI should control when it opens.

### Custom Launcher

Use `usePostHogConversations` to open Conversations from your own button:

```tsx
'use client'

import { usePostHogConversations } from '@klnap/payload-posthog/client'

export function ContactSupportButton() {
  const { status, canOpen, open } = usePostHogConversations()

  return (
    <button type='button' onClick={open} disabled={!canOpen}>
      {status === 'loading' ? 'Connecting…' : 'Contact support'}
    </button>
  )
}
```

The hook exposes `status`, `canOpen`, `isAvailable`, `open()`, `close()`, `show()`, and `hide()`. `canOpen` reflects verified identity and consent; `isAvailable` reflects native SDK availability. Use `usePostHog()` from `@posthog/next` for the native Conversations API.

See the [Conversations guide](docs/conversations.md) for details.

## Debugging

Set `debug: true` to print server-side identity diagnostics:

```ts
postHog({
  apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  debug: true,
  payload: {
    identify: {
      properties: {
        name: 'profile.fullName',
        roles: 'roles[].name',
      },
    },
  },
})
```

With an API key, PostHog runs normally alongside diagnostics. Without a key, `debug: true` resolves identity locally without initializing the PostHog SDK or sending telemetry. Without a key or debug mode, the integration is inactive.

```text
[payload-posthog] identity: resolved distinct ID users:123
┌─────────┬──────────┬───────────────────┬──────────────────────┬───────────────────────────────┐
│ (index) │ property │ path              │ value                │ status                        │
├─────────┼──────────┼───────────────────┼──────────────────────┼───────────────────────────────┤
│    0    │ email    │ email             │ joe.doe@example.com  │ resolved                      │
│    1    │ name     │ profile.fullName  │ Joe Doe              │ resolved                      │
│    2    │ roles    │ roles[].name      │ ['admin', 'editor']  │ resolved                      │
└─────────┴──────────┴───────────────────┴──────────────────────┴───────────────────────────────┘
```

Diagnostics show resolved identity and mapped values, not consent or successful delivery. Mapped values can contain personal data. See [Debugging and troubleshooting](docs/debugging.md).

## Configuration

`postHog()` accepts these options:

| Option                  | Default                | Description                                                                                                                 |
| ----------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `apiKey`                | Required for telemetry | Public PostHog project key. Without it, only keyless debugging can run.                                                     |
| `enabled`               | `true`                 | Set to `false` to register nothing.                                                                                         |
| `debug`                 | `false`                | Prints server-side diagnostics.                                                                                             |
| `clientOptions`         | Plugin defaults        | Serializable native `posthog-js` options.                                                                                   |
| `serverOptions`         | Native SDK defaults    | Serializable native `posthog-node` options. Payload error capture uses no retries and a 2-second timeout unless overridden. |
| `bootstrapFlags`        | Unset                  | Browser evaluation by default; set to `true` or native options for server bootstrap.                                        |
| `payload.identify`      | Enabled                | Identifies authenticated users; `properties` defaults to `{ email: 'email' }`.                                              |
| `payload.errorTracking` | Enabled                | Captures unexpected Payload REST errors; `shouldCapture` is optional.                                                       |
| `payload.conversations` | Disabled               | Enables authenticated Conversations; requires `secret`, and `launcher` defaults to `'visible'`.                             |

When `clientOptions.capture_pageview` is omitted, the plugin captures route-template pageviews. Set it to `true` to delegate pageviews to the native SDK, or `false` to disable them.

Client and server SDK options must be serializable; function-valued SDK options are rejected. The server-side `payload.errorTracking.shouldCapture` callback is supported. Explicit client options override plugin defaults, except password masking stays enabled. Conversations remains disabled unless configured.

The plugin also disables referrer and campaign-parameter persistence by default, removes URL fragments from captured URLs, and enables sensitive-parameter masking. See the [configuration guide](docs/configuration-and-identification.md), the [PostHog JavaScript SDK](https://posthog.com/docs/libraries/js), and the [PostHog Node.js SDK](https://posthog.com/docs/libraries/node) for native options.

## Privacy & Security

- **URL redaction:** Supported URL values are redacted before outbound telemetry. Query values become `[REDACTED]`, fragments are removed, and tokens in Payload’s native reset and verification paths are redacted. Parameter names remain visible.
- **Native masking:** PostHog’s sensitive-parameter masking is enabled by default. Password inputs remain masked in Replay.
- **Recorded content:** Other input values and page text are visible by default. Configure native masking before recording sensitive Admin content.
- **Browser storage:** Outbound redaction does not rewrite values PostHog may already have stored locally.
- **Application data:** URL redaction does not sanitize arbitrary event properties, person properties, exception messages, request bodies, or rendered content. It is not universal secret detection.
- **Credentials and consent:** The project key is public. Keep `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_CONVERSATIONS_SECRET` server-side. Your application owns consent and data handling.
- **Diagnostics:** Logs can contain mapped personal data, including email.

Setting `clientOptions.capture_pageview: true` hands pageviews to the native SDK, whose initial event may occur before URL redaction is installed. Replacing the redaction callback with a separate SDK initialization or `before_send` override can bypass it. See [Session Replay and privacy](docs/session-replay-and-privacy.md) for detailed behavior and limitations, and PostHog’s [data collection and consent documentation](https://posthog.com/docs/privacy/data-collection).

## Documentation

- [Configuration and identification](docs/configuration-and-identification.md)
- [Error Tracking and Next.js instrumentation](docs/error-tracking.md)
- [Session Replay and privacy](docs/session-replay-and-privacy.md)
- [Conversations](docs/conversations.md)
- [Debugging and troubleshooting](docs/debugging.md)
- [Migration from 0.1.1](docs/migration.md)
- [Technical specification](docs/specification.md)

## License

MIT
