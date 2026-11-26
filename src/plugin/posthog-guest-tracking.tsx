'use client'

import { useAuth } from '@payloadcms/ui'
import { usePostHog } from '@posthog/next'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'
import {
  consumeAuthFlowAttempt,
  isRecentAuthFlowAttempt,
  storeAuthFlowAttempt,
} from './auth-flow-attempt'
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
 * Track authentication lifecycle events and gate Replay by identity and route safety.
 * Events carry route templates, not URLs.
 */
export function PostHogGuestTracking({ adminPath, guestTracking, sessionReplay }: Props) {
  const posthog = usePostHog()
  const capturing =
    (posthog?.is_capturing() ?? false) && !(posthog?.has_opted_out_capturing() ?? true)
  const pathname = usePathname() ?? '/'
  const search = useSearchParams().toString()
  const { user } = useAuth()
  const userId = currentUserId(user)
  const route = normalizeGuestRoute(pathname, adminPath)
  const guestAllowed =
    guestTracking.enabled && isGuestRouteTracked(pathname, adminPath, guestTracking.paths)
  const allowed = capturing && (userId !== null || guestAllowed)
  const safeForRecording = !route.sensitive && !search
  const startedFlow = useRef<{ flow: string; startedAt: number } | null>(null)
  const logoutWasStarted = useRef(false)
  const sessionExpiryWasObserved = useRef(false)
  const previousRoute = useRef<string | null>(null)
  const previousUserId = useRef(userId)

  useEffect(() => {
    if (!posthog) return
    const routeChanged = previousRoute.current !== route.pathname
    previousRoute.current = route.pathname

    if (routeChanged && route.authFlow === 'logout') {
      sessionExpiryWasObserved.current = false
      logoutWasStarted.current = previousUserId.current !== null
      if (allowed && logoutWasStarted.current) {
        posthog.capture('auth_logout_started', { route_template: route.route })
      }
    } else if (routeChanged && route.authFlow === 'session_expired') {
      logoutWasStarted.current = false
      sessionExpiryWasObserved.current = previousUserId.current !== null
    } else if (routeChanged && userId !== null) {
      logoutWasStarted.current = false
      sessionExpiryWasObserved.current = false
    }
  }, [allowed, posthog, route.authFlow, route.pathname, route.route, userId])

  useEffect(() => {
    if (!posthog) return
    const canRecord = sessionReplay && allowed && safeForRecording
    if (canRecord) {
      if (!posthog.sessionRecordingStarted()) posthog.startSessionRecording()
    } else if (posthog.sessionRecordingStarted()) {
      posthog.stopSessionRecording()
    }
    return () => {
      if (posthog.sessionRecordingStarted()) posthog.stopSessionRecording()
    }
  }, [allowed, posthog, safeForRecording, sessionReplay])

  useEffect(() => {
    if (!posthog || !capturing) {
      previousUserId.current = userId
      logoutWasStarted.current = false
      sessionExpiryWasObserved.current = false
      startedFlow.current = null
      return
    }
    const previous = previousUserId.current
    const identityChanged = previous !== userId
    const persistedFlow =
      identityChanged && userId !== null
        ? consumeAuthFlowAttempt(sessionStorageOrNull(), true)
        : null
    const localAttempt = identityChanged && userId !== null ? startedFlow.current : null
    if (identityChanged && userId !== null) startedFlow.current = null
    const flow = persistedFlow ?? (isRecentAuthFlowAttempt(localAttempt) ? localAttempt.flow : null)
    if (identityChanged && userId !== null && flow === 'login') {
      posthog.capture('auth_login_succeeded', { route_template: route.route })
    }
    if (identityChanged) {
      if (previous !== null && userId === null) {
        if (sessionExpiryWasObserved.current) {
          posthog.capture('auth_session_expired', { route_template: route.route })
        } else if (logoutWasStarted.current) {
          posthog.capture('auth_logout_completed', { route_template: route.route })
        }
        logoutWasStarted.current = false
        sessionExpiryWasObserved.current = false
      } else if (previous !== null && userId !== null) {
        posthog.capture('auth_account_switched', { route_template: route.route })
        logoutWasStarted.current = false
        sessionExpiryWasObserved.current = false
      } else if (userId !== null) {
        logoutWasStarted.current = false
        sessionExpiryWasObserved.current = false
      }
      previousUserId.current = userId
    }
  }, [capturing, posthog, route.route, userId])

  useEffect(() => {
    if (!posthog || !guestAllowed || userId !== null) return
    const onSubmit = (event: SubmitEvent) => {
      if (!(event.target instanceof HTMLFormElement) || !route.authFlow) return
      startedFlow.current = { flow: route.authFlow, startedAt: Date.now() }
      storeAuthFlowAttempt(sessionStorageOrNull(), route.authFlow)
      posthog.capture('auth_flow_started', { flow: route.authFlow, route_template: route.route })
    }
    document.addEventListener('submit', onSubmit, true)
    return () => document.removeEventListener('submit', onSubmit, true)
  }, [guestAllowed, posthog, route.authFlow, route.route, userId])

  return null
}
