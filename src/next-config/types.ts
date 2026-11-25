import type { withPostHogConfig } from '@posthog/nextjs-config'

/** Native options accepted by PostHog's Next.js build-time integration. */
export type PostHogNextConfigOptions = Parameters<typeof withPostHogConfig>[1]
