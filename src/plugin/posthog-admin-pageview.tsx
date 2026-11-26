'use client'

import { usePostHog } from '@posthog/next'
import { usePathname, useSearchParams } from 'next/navigation'
import type { PostHogConfig } from 'posthog-js'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { resolveSafeAdminPageview } from './pageview-privacy'
import { useAdminPath } from './payload-routes'

export function PostHogAdminPageView({
  capturePageviews,
  autocapture,
}: {
  capturePageviews: boolean
  autocapture: NonNullable<PostHogConfig['autocapture']>
}) {
  return (
    <Suspense fallback={null}>
      <PageViewTracker capturePageviews={capturePageviews} autocapture={autocapture} />
    </Suspense>
  )
}

function PageViewTracker({
  capturePageviews,
  autocapture,
}: {
  capturePageviews: boolean
  autocapture: NonNullable<PostHogConfig['autocapture']>
}) {
  const pathname = usePathname() ?? '/'
  const searchParams = useSearchParams()
  const search =
    typeof window === 'undefined' ? searchParams.toString() : window.location.search.slice(1)
  const adminPath = useAdminPath()
  const posthog = usePostHog()
  const previousPage = useRef<string | null>(null)
  const pageview = useMemo(
    () =>
      typeof window === 'undefined'
        ? null
        : resolveSafeAdminPageview(pathname, search, adminPath, window.location.origin),
    [adminPath, pathname, search]
  )

  useEffect(() => {
    if (!posthog) return

    posthog.set_config({ autocapture: pageview ? autocapture : false })
    if (!pageview || !capturePageviews) {
      previousPage.current = null
      return
    }
    if (previousPage.current === pageview.url) return

    previousPage.current = pageview.url
    posthog.capture('$pageview', {
      $current_url: pageview.url,
      $pathname: pageview.pathname,
      source: 'payload',
    })
  }, [autocapture, capturePageviews, pageview, posthog])

  return null
}
