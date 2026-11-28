# Configuration and identification

Configure the plugin in the existing Payload `buildConfig()`:

```ts
import { postHog } from '@klnap/payload-posthog'

postHog({
  apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY!,
  clientOptions: {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  },
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

`apiKey` is the public PostHog project key, usually `NEXT_PUBLIC_POSTHOG_KEY`. Set `NEXT_PUBLIC_POSTHOG_HOST` when using a non-default PostHog host. These values configure the browser SDK; they are not server credentials. Without `apiKey`, the plugin registers nothing unless `debug: true`, which enables keyless diagnostics only.

## Options

| Option | Default | Behavior |
| --- | --- | --- |
| `apiKey` | Required for telemetry | Public PostHog project API key. |
| `enabled` | `true` | `false` registers nothing. |
| `debug` | `false` | Logs server-side diagnostics; mapped values may contain personal data. |
| `clientOptions` | Plugin defaults | Serializable native `posthog-js` options. Host values override defaults except password masking remains enforced; Conversations stays disabled unless `payload.conversations` is configured. |
| `serverOptions` | Plugin defaults | Serializable native `posthog-node` options. |
| `bootstrapFlags` | Unset | Native server-side feature-flag bootstrap. Unset keeps evaluation in the browser. |
| `payload.identify.enabled` | `true` | Enables authenticated Payload identity synchronization. |
| `payload.identify.properties` | `{ email: 'email' }` | Maps PostHog person property names to Payload user paths. |
| `payload.errorTracking.enabled` | `true` | Captures unexpected Payload REST errors on the server. |
| `payload.errorTracking.shouldCapture` | Unset | Additional server-side filter, after expected 4xx errors are excluded. |
| `payload.conversations` | Unset | Enables authenticated Conversations. Requires `secret`; `launcher` defaults to `visible`. |

Function-valued options in `clientOptions` and `serverOptions` are rejected because these options cross Payload's server-to-client boundary. The server-only `shouldCapture` callback is separate and supported.

See upstream references for the full native option sets: [`posthog-js`](https://posthog.com/docs/libraries/js), [`posthog-node`](https://posthog.com/docs/libraries/node), and [`@posthog/next`](https://posthog.com/docs/libraries/next-js).

## Pageviews

By default, the plugin mounts native `PostHogPageView` from `@posthog/next` and captures route-template pageviews. Set `clientOptions.capture_pageview: true` to leave pageview ownership to the native SDK, or `false` to send no automatic pageviews. Do not add another Admin pageview owner.

## Identity and property mappings

The user collection comes from `config.admin.user`, or the first authenticated collection when unset. A user's distinct ID is namespaced as `<collection>:<id>`, for example `users:123`. Use `payloadDistinctId(collection, id)` from the package root to create the same ID for server-side events.

Email maps to `email` by default. Custom mappings merge over that default. Values are read from the user returned by Payload, not by querying or populating relationships.

```ts
payload: {
  identify: {
    properties: {
      name: 'profile.fullName',  // nested scalar
      roles: 'roles',            // primitive array
      role_names: 'roles[].name', // populated relationship projection
    },
  },
}
```

Supported values are strings, booleans, finite numbers, and arrays of those primitive values. Dotted paths traverse own properties. `[]` projects the remaining path over each array item, as with `roles[].name`. Unsupported or missing values are omitted. Empty source arrays remain empty; a nonempty array that resolves to no supported values is omitted. Partly populated arrays keep resolvable entries.

Credential-like path segments, including `password`, `token`, `secret`, `hash`, `apiKey`, `session`, `reset`, and `verification`, are rejected during plugin setup. Mapping only controls what the plugin reads; omitting a property does not erase a value PostHog already stores.

PostHog's native `identify()` and `reset()` behavior applies. The plugin resets a prior Payload identity on logout or account switch before applying the next identity. PostHog's own identity-merging and consent behavior remains controlled by its SDK and project configuration; identification logs do not prove that a request was transmitted or accepted.

## Feature flags

Use native `@posthog/next` hooks in Admin components:

```tsx
'use client'

import { useFeatureFlag } from '@posthog/next'

export function NewEditorNotice() {
  const enabled = useFeatureFlag('new-editor')
  return enabled ? <p>New editor enabled</p> : null
}
```

Client-side evaluation requires no `bootstrapFlags` option. To opt into native server-side bootstrap, pass `bootstrapFlags: true` or a `BootstrapFlagsConfig` value accepted by `@posthog/next`. Bootstrap can make Admin routes request-time rendered.

Do not add another `PostHogProvider` around the Admin tree. The plugin provider owns this Admin SDK instance. See the [`@posthog/next` documentation](https://posthog.com/docs/libraries/next-js).
