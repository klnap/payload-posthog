'use client'

import { useAuth } from '@payloadcms/ui'
import { usePostHog } from '@posthog/next'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { payloadDistinctId } from '../identity/payload-distinct-id'
import { syncPostHogIdentity } from '../identity/sync-posthog-identity'
import { resolveAdminReadEvent, shouldSampleAdminRead } from './admin-read-tracking'
import type { AdminViewCaptureConfig } from './capture-config'
import {
  hasSensitiveQueryParameters,
  isSafeAdminContentRoute,
  normalizeGuestRoute,
} from './guest-route-tracking'
import { resolveSafeAdminPageview } from './pageview-privacy'

export function PostHogIdentify({
  collection,
  identityEnabled,
  properties = {},
  adminPath = '/admin',
  adminViewCapture,
}: {
  collection?: string
  identityEnabled: boolean
  properties?: Record<string, string>
  adminPath?: string
  adminViewCapture?: AdminViewCaptureConfig
}) {
  const posthog = usePostHog()
  const canIdentify =
    (posthog?.is_capturing() ?? false) && !(posthog?.has_opted_out_capturing() ?? true)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search =
    typeof window === 'undefined' ? searchParams.toString() : window.location.search.slice(1)
  const { user } = useAuth()
  const previousId = useRef<string | null>(null)
  const previousPropertiesKey = useRef('')
  const previousViewKey = useRef<string | null>(null)
  const route = normalizeGuestRoute(pathname ?? '/', adminPath)
  const safeRoute = isSafeAdminContentRoute(route) && !hasSensitiveQueryParameters(search)
  const userId = collection && user?.id != null ? payloadDistinctId(collection, user.id) : null
  const personProperties = Object.fromEntries(
    Object.entries(properties)
      .map(([property, field]) => [property, user?.[field]])
      .filter(
        (entry): entry is [string, string | number | boolean] =>
          typeof entry[1] === 'string' ||
          typeof entry[1] === 'number' ||
          typeof entry[1] === 'boolean'
      )
  )
  useEffect(() => {
    if (!posthog) return
    const next = syncPostHogIdentity(
      posthog,
      { id: previousId.current, propertiesKey: previousPropertiesKey.current },
      identityEnabled && canIdentify && safeRoute ? userId : null,
      personProperties
    )
    previousId.current = next.id
    previousPropertiesKey.current = next.propertiesKey
    const safePageview =
      typeof window === 'undefined' || !adminViewCapture
        ? null
        : resolveSafeAdminPageview(pathname ?? '/', search, adminPath, window.location.origin)
    const readEvent =
      safePageview && adminViewCapture
        ? resolveAdminReadEvent(safePageview.resourceRoute ?? '', adminViewCapture)
        : null
    const routeKey = `${userId ?? ''}\0${pathname ?? '/'}\0${search}`
    if (!canIdentify || !safeRoute || !userId || !safePageview || !readEvent) {
      previousViewKey.current = null
      return
    }
    if (previousViewKey.current === routeKey) return
    previousViewKey.current = routeKey
    if (
      !shouldSampleAdminRead(
        readEvent.event.sampleRate,
        identityEnabled ? (next.id ?? '') : posthog.get_distinct_id(),
        posthog.get_session_id(),
        routeKey
      )
    ) {
      return
    }
    posthog.capture(readEvent.event.name, {
      ...readEvent.event.properties,
      $current_url: safePageview.url,
      $pathname: safePageview.pathname,
      source: 'payload',
      route_template: safePageview.pathname,
      view: readEvent.view,
      ...(readEvent.resourceType === 'collection'
        ? { collection: readEvent.resourceSlug }
        : { global: readEvent.resourceSlug }),
    })
  }, [
    adminPath,
    adminViewCapture,
    canIdentify,
    identityEnabled,
    pathname,
    personProperties,
    posthog,
    safeRoute,
    search,
    userId,
  ])

  return null
}
