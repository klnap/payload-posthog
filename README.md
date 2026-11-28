# @klnap/payload-posthog

Native PostHog integration for Payload CMS.

The plugin integrates PostHog into Payload Admin so you do not need to assemble the provider, identity synchronization, error hooks, or Conversations identity endpoint yourself.

```ts
// payload.config.ts
import { buildConfig } from 'payload'
import { postHog } from '@klnap/payload-posthog'

export default buildConfig({
  plugins: [
    postHog({
      apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY!,
      clientOptions: {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      },
    }),
  ],
})
```

## Why?

Payload knows which user is signed in; PostHog can connect that identity with analytics, Error Tracking, Session Replay, Feature Flags, and Conversations. This helps teams investigate an error in the context of the affected user's session without replacing Payload authentication or adding a separate Admin provider.

PostHog products still depend on your project settings, consent policy, and native SDK configuration. This package does not replace every observability or support tool.

## Install

```sh
bun add @klnap/payload-posthog
```

```sh
npm install @klnap/payload-posthog
```

Required peers: `payload`, `@payloadcms/ui`, `next`, `react`, `react-dom`, `@posthog/next`, `posthog-js`, and `posthog-node`. `@posthog/nextjs-config` is optional and only needed for source-map upload. Supported versions are listed in [`package.json`](./package.json).

No manual provider, Payload layout edit, stylesheet import, or `transpilePackages` entry is required.

## Identify Payload users

Signed-in Admin users are identified with a namespaced ID such as `users:123`. Email maps by default. Add only the person properties your team needs:

```ts
postHog({
  apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY!,
  payload: {
    identify: {
      properties: {
        name: 'profile.fullName',
        organization_id: 'organization.id',
        roles: 'roles[].name',
      },
    },
  },
})
```

Mappings support scalar values, primitive arrays, dotted paths, and `[]` array projection over populated relationships. Missing or unsupported values are omitted. Logout and account switching reset stale Payload identity before the next identity is applied. See [Configuration and identification](docs/configuration-and-identification.md).

## Error Tracking and Session Replay

The native browser SDK captures exceptions. The plugin also captures unexpected Payload REST errors on the server and filters expected 4xx responses. Next.js request-error capture and source maps use separate native integrations; they are not enabled by the Payload plugin.

Replay uses native PostHog configuration. Password inputs are masked; ordinary input values and text are visible unless you enable additional masking. The plugin redacts captured URLs before outbound telemetry, but does not sanitize arbitrary event properties or Replay content. See [Error Tracking](docs/error-tracking.md) and [Session Replay and privacy](docs/session-replay-and-privacy.md).

## Conversations

Enable authenticated Conversations with a server-only signing secret:

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

`visible` renders PostHog's launcher for verified signed-in users. `hidden` lets your UI control the launcher. The public `usePostHogConversations()` hook provides `status`, `canOpen`, `isAvailable`, `open()`, `close()`, `show()`, and `hide()`. See [Conversations](docs/conversations.md).

## Feature flags and native SDKs

Use the native hooks from `@posthog/next`, such as `useFeatureFlag()`. Client-side evaluation needs no plugin option. Set `bootstrapFlags` only when you want server-side flag bootstrap; it can make Admin routes render at request time.

The plugin accepts serializable `posthog-js` and `posthog-node` options through `clientOptions` and `serverOptions`. Native options override plugin defaults, but password masking remains enforced and Conversations stays disabled unless `payload.conversations` is configured. See [Configuration and identification](docs/configuration-and-identification.md).

## Debug

`debug: true` logs server-side identity resolution and configuration. It does not confirm consent or telemetry delivery. Explicitly mapped values, including the default email mapping, may appear in logs.

```ts
postHog({
  apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  debug: true,
  payload: {
    identify: {
      properties: {
        name: 'profile.fullName',
        roles: 'roles[].name',
        organization_id: 'organization.id',
      },
    },
  },
})
```

```text
[payload-posthog] mode: PostHog enabled. Plugin diagnostics only; native SDK debug is `clientOptions.debug`.
[payload-posthog] configured identity property mappings:
┌─────────┬─────────────────┬───────────────────────┐
│         │ property        │ path                  │
├─────────┼─────────────────┼───────────────────────┤
│ 0       │ email           │ email                 │
│ 1       │ name            │ profile.fullName      │
│ 2       │ roles           │ roles[].name          │
│ 3       │ organization_id │ organization.id       │
└─────────┴─────────────────┴───────────────────────┘
[payload-posthog] identity: resolved distinct ID users:123. Identified in the browser when consent allows.
┌─────────┬─────────────────┬───────────────────────┬────────────────────┬───────────────────────────────┐
│         │ property        │ path                  │ value              │ status                        │
├─────────┼─────────────────┼───────────────────────┼────────────────────┼───────────────────────────────┤
│ 0       │ email           │ email                 │ editor@example.com │ resolved                      │
│ 1       │ name            │ profile.fullName      │ Riley Chen         │ resolved                      │
│ 2       │ roles           │ roles[].name          │ ['admin', 'editor']│ resolved                      │
│ 3       │ organization_id │ organization.id       │ undefined          │ omitted (missing or unsupported)│
└─────────┴─────────────────┴───────────────────────┴────────────────────┴───────────────────────────────┘
```

Without `apiKey`, `debug: true` enables keyless identity diagnostics only. No SDK, provider, telemetry, or remote SDK assets are initialized; the log states `Not transmitted: keyless mode.` Keep diagnostic output out of shared logs. See [Debugging](docs/debugging.md).

## Documentation

- [Configuration and identification](docs/configuration-and-identification.md)
- [Error Tracking and Next.js instrumentation](docs/error-tracking.md)
- [Session Replay and privacy](docs/session-replay-and-privacy.md)
- [Conversations](docs/conversations.md)
- [Debugging and troubleshooting](docs/debugging.md)
- [Migration from 0.1.1](docs/migration.md)
- [Technical specification](docs/specification.md)

## Compatibility

Requires Node.js `^24.22.3 || >=26.13.1`, Payload `>=3.94.1 <4`, Next.js `>=16.4.5 <17`, and React `^19.3.1`. Check the peer dependency ranges in [`package.json`](./package.json).

## License

MIT
