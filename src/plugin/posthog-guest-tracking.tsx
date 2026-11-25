'use client'

import { useAuth } from '@payloadcms/ui'
import { usePostHog } from '@posthog/next'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { consumeAuthFlowAttempt, storeAuthFlowAttempt } from './auth-flow-attempt'
import { isGuestRouteTracked, normalizeGuestRoute } from './guest-route-tracking'

type Props = {
  adminPath: string
  guestTracking: { enabled: boolean; paths: readonly string[] }
  sessionReplay: boolean
}

function currentUserId(user: { id?: number | string } | null | undefined): string | null {
  return user?.id == null ? null : String(user.id)
}

function sessionStorageOrNull(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/**
 * Guest tracking: authentication lifecycle events and Session Replay on guest routes.
 * Authenticated users are always tracked. Events carry route templates, not URLs.
 */
export function PostHogGuestTracking({ adminPath, guestTracking, sessionReplay }: Props) {
  const posthog = usePostHog()
  const capturing =
    (posthog?.is_capturing() ?? false) && !(posthog?.has_opted_out_capturing() ?? true)
  const pathname = usePathname() ?? '/'
  const { user } = useAuth()
  const userId = currentUserId(user)
  const route = normalizeGuestRoute(pathname, adminPath)
  const guestAllowed =
    guestTracking.enabled && isGuestRouteTracked(pathname, adminPath, guestTracking.paths)
  const allowed = capturing && (userId !== null || guestAllowed)
  const startedFlow = useRef<string | null>(null)
  const logoutWasStarted = useRef(false)
  const previousRoute = useRef<string | null>(null)
  const previousUserId = useRef(userId)

  useEffect(() => {
    if (!posthog) return
    const routeChanged = previousRoute.current !== route.pathname
    previousRoute.current = route.pathname

    if (routeChanged && route.authFlow === 'logout') {
      logoutWasStarted.current = userId !== null
      if (allowed && logoutWasStarted.current) {
        posthog.capture('auth_logout_started', { route_template: route.route })
      }
    } else if (routeChanged && userId !== null) {
      logoutWasStarted.current = false
    }
  }, [allowed, posthog, route.authFlow, route.pathname, route.route, userId])

  useEffect(() => {
    if (!posthog) return
    const canRecord = sessionReplay && allowed
    if (canRecord) {
      if (!posthog.sessionRecordingStarted()) posthog.startSessionRecording()
    } else if (posthog.sessionRecordingStarted()) {
      posthog.stopSessionRecording()
    }
    return () => {
      if (posthog.sessionRecordingStarted()) posthog.stopSessionRecording()
    }
  }, [allowed, posthog, sessionReplay])

  useEffect(() => {
    if (!posthog || !capturing) {
      previousUserId.current = userId
      return
    }
    const previous = previousUserId.current
    const persistedFlow =
      userId !== null ? consumeAuthFlowAttempt(sessionStorageOrNull(), true) : null
    if (userId !== null && (persistedFlow || startedFlow.current)) {
      const flow = persistedFlow ?? startedFlow.current
      if (flow) {
        posthog.capture('auth_flow_succeeded', { flow, route_template: route.route })
        startedFlow.current = null
      }
    }
    if (previous !== userId) {
      if (previous !== null && userId === null && logoutWasStarted.current) {
        if (route.authFlow !== 'session_expired') {
          posthog.capture('auth_logout_completed', { route_template: route.route })
        }
        logoutWasStarted.current = false
      } else if (previous !== null && userId !== null) {
        posthog.capture('auth_account_switched', { route_template: route.route })
      }
      previousUserId.current = userId
    }
  }, [capturing, posthog, route.authFlow, route.route, userId])

  useEffect(() => {
    if (!posthog || !guestAllowed || userId !== null) return
    const onSubmit = (event: SubmitEvent) => {
      if (!(event.target instanceof HTMLFormElement) || !route.authFlow) return
      startedFlow.current = route.authFlow
      storeAuthFlowAttempt(sessionStorageOrNull(), route.authFlow)
      posthog.capture('auth_flow_started', { flow: route.authFlow, route_template: route.route })
    }
    document.addEventListener('submit', onSubmit, true)
    return () => document.removeEventListener('submit', onSubmit, true)
  }, [guestAllowed, posthog, route.authFlow, route.route, userId])

  return null
}
