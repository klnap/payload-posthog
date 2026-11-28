# Error Tracking and Next.js instrumentation

The plugin uses native PostHog integrations. Payload Admin browser exception capture, Payload REST error capture, Next.js request-error capture, and source-map upload are separate paths.

## Browser and Payload errors

The native `posthog-js` exception capture setting is not overridden by the plugin. Its behavior follows your `clientOptions` and PostHog project configuration.

On the server, the plugin appends a Payload `afterError` hook. It captures unexpected Payload REST errors with `posthog-node`, adds the authenticated Payload user's namespaced distinct ID when available, and labels the source as `payload`. Expected HTTP 4xx errors are excluded before `payload.errorTracking.shouldCapture` runs. Telemetry failures do not change the original Payload response.

This hook does not cover Local API calls, GraphQL-only paths, background jobs, or exceptions your code catches before Payload's hook runs. Report those through an appropriate native PostHog API when needed.

Disable Payload server capture with `payload.errorTracking.enabled: false`. `shouldCapture({ error, collection, status })` adds a server-side filter. Do not put secrets in exception messages; server sanitization is not universal secret detection.

## Next.js request errors

Next.js instrumentation is separate from the Payload plugin. Add `registerPostHog()` to the existing `instrumentation.ts` and compose `capturePostHogError` with any host handler:

```ts
// instrumentation.ts
import {
  capturePostHogError,
  registerPostHog,
} from '@klnap/payload-posthog/instrumentation'

export async function register() {
  await registerPostHog()
  // Keep any existing host registration here.
}

async function captureWithHostProvider(
  ...args: Parameters<typeof capturePostHogError>
) {
  // Call your existing error provider with these same arguments.
}

export async function onRequestError(...args: Parameters<typeof capturePostHogError>) {
  await capturePostHogError(...args)
  await captureWithHostProvider(...args)
}
```

The helper reads `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST`. The Payload plugin's options are not shared with Next.js instrumentation. Preserve your host handler and pass it the same arguments.

Next.js documents the [instrumentation hook](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation) and [`onRequestError`](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation#onrequesterror-optional).

## Source maps

Source-map upload runs at build time and needs the optional `@posthog/nextjs-config` peer. Use the package's `next-config` export, preserve your existing Next config, and keep the personal API key in the build environment:

```ts
// next.config.ts
import { withPostHogConfig } from '@klnap/payload-posthog/next-config'

const nextConfig = {
  // Your existing Next.js configuration.
}

export default withPostHogConfig(nextConfig, {
  personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY!,
  projectId: process.env.POSTHOG_PROJECT_ID!,
  sourcemaps: { releaseName: 'cms' },
})
```

Use PostHog's [Next.js source-map guide](https://posthog.com/docs/error-tracking/upload-source-maps/nextjs) for project-specific setup and build requirements. This package re-exports the upstream helper; it does not upload maps at runtime.
