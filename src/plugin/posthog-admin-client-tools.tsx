'use client'

import { lazy, Suspense } from 'react'
import { usePayloadRoutes } from './payload-routes'
import { PostHogGuestTracking } from './posthog-guest-tracking'
import { PostHogIdentify } from './posthog-identify'

const PostHogSupport = lazy(() =>
  import('./posthog-support').then(({ PostHogSupport }) => ({ default: PostHogSupport }))
)

type Props = {
  identify: { properties: Record<string, string> } | null
  identityCollection?: string
  guestTracking: { enabled: boolean; paths: string[] }
  sessionReplay: boolean
  support: { launcher: 'visible' | 'hidden'; endpoint: string } | null
}

export function PostHogAdminClientTools({
  identify,
  identityCollection,
  guestTracking,
  sessionReplay,
  support,
}: Props) {
  const { adminPath, guestPaths } = usePayloadRoutes(guestTracking.paths)

  return (
    <>
      {identify ? (
        <Suspense fallback={null}>
          <PostHogIdentify
            collection={identityCollection}
            properties={identify.properties}
            adminPath={adminPath}
          />
        </Suspense>
      ) : null}
      <Suspense fallback={null}>
        <PostHogGuestTracking
          adminPath={adminPath}
          guestTracking={{ enabled: guestTracking.enabled, paths: guestPaths }}
          sessionReplay={sessionReplay}
        />
      </Suspense>
      {support ? (
        <Suspense fallback={null}>
          <PostHogSupport
            adminPath={adminPath}
            collection={identityCollection}
            identityEndpoint={support.endpoint}
            launcher={support.launcher}
          />
        </Suspense>
      ) : null}
    </>
  )
}
