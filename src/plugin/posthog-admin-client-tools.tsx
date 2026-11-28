'use client'

import { PostHogPageView, usePostHog } from '@posthog/next'
import { Suspense } from 'react'
import { LAUNCHER_STYLESHEET } from '../conversations/launcher'
import { installNativeUrlRedaction } from '../redaction/install'
import type { NativeAuthRoutes } from '../redaction/url-redaction'
import { PostHogIdentity } from './posthog-identity'

type Props = {
  identityCollections: string[]
  nativeRoutes: NativeAuthRoutes
  identify: { properties: Record<string, string> } | null
  conversations: { endpoint: string; launcher: 'visible' | 'hidden' } | null
  /** Mounts the native pageview owner. False when the host set `capture_pageview` itself. */
  capturePageviews: boolean
}

export function PostHogAdminClientTools({
  identityCollections,
  nativeRoutes,
  identify,
  conversations,
  capturePageviews,
}: Props) {
  // Runs during render, before the children below can capture: the first event is already redacted.
  // `usePostHog()` also returns the singleton during server rendering; installation is client-only.
  const posthog = usePostHog()
  if (posthog && typeof window !== 'undefined') installNativeUrlRedaction(posthog, nativeRoutes)
  return (
    <>
      {/* Identity is rendered before the pageview owner: React runs sibling effects in order, so a
          logout or account switch is applied before the next pageview is captured. */}
      {identify !== null || conversations !== null ? (
        <Suspense fallback={null}>
          <PostHogIdentity
            identityCollections={identityCollections}
            identify={identify}
            conversations={conversations}
          />
        </Suspense>
      ) : null}
      {capturePageviews ? <PostHogPageView captureRouteTemplate /> : null}
      {conversations ? <style>{LAUNCHER_STYLESHEET}</style> : null}
    </>
  )
}
