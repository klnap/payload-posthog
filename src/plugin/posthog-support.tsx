'use client'

import { useAuth } from '@payloadcms/ui'
import { usePostHog } from '@posthog/next'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { payloadDistinctId } from '../identity/payload-distinct-id'
import {
  getPostHogSupportStatus,
  setPostHogSupportLauncher,
  setPostHogSupportReady,
  setPostHogSupportStatus,
} from '../support/events'
import { supportSdkStatus } from '../support/status'
import { isSafeAdminSupportRoute, normalizeGuestRoute } from './guest-route-tracking'

type Identity = { distinctId: string; hash: string }
type Props = {
  identityEndpoint?: string
  collection?: string
  launcher?: 'visible' | 'hidden'
  adminPath?: string
}
function isIdentity(value: unknown): value is Identity {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Identity).distinctId === 'string' &&
    (value as Identity).distinctId.length > 0 &&
    typeof (value as Identity).hash === 'string' &&
    /^[a-f\d]{64}$/i.test((value as Identity).hash)
  )
}

export function PostHogSupport({
  identityEndpoint,
  collection,
  launcher = 'visible',
  adminPath = '/',
}: Props) {
  const posthog = usePostHog()
  const canUseSupport =
    (posthog?.is_capturing() ?? false) && !(posthog?.has_opted_out_capturing() ?? true)
  const { authSession, token, user } = useAuth()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const route = normalizeGuestRoute(pathname ?? '/', adminPath)
  const routeIsSafe = isSafeAdminSupportRoute(route, searchParams.toString())
  const userId = collection && user?.id != null ? payloadDistinctId(collection, user.id) : null
  const authSessionKey = `${token ?? ''}:${authSession?.expiresAt ?? ''}`

  useEffect(() => {
    setPostHogSupportLauncher(launcher)
  }, [launcher])

  useEffect(() => {
    if (!posthog) return
    const controller = new AbortController()
    const support = posthog.conversations
    support.hide()
    posthog.clearIdentity()
    setPostHogSupportReady(false)
    if (!routeIsSafe) {
      setPostHogSupportStatus({ state: 'unavailable', reason: 'sensitive-route' })
      return () => {
        posthog.clearIdentity()
        support.hide()
        setPostHogSupportReady(false)
        setPostHogSupportStatus({ state: 'disabled' })
      }
    }
    if (!canUseSupport) {
      setPostHogSupportStatus({ state: 'unavailable', reason: 'consent' })
      return () => {
        posthog.clearIdentity()
        support.hide()
        setPostHogSupportReady(false)
        setPostHogSupportStatus({ state: 'disabled' })
      }
    }
    setPostHogSupportStatus({ state: 'identity-pending' })
    let statusTimer: ReturnType<typeof setTimeout> | undefined
    let statusChecks = 0
    let authorized = false

    const monitorConversations = () => {
      if (controller.signal.aborted || !authorized) return
      const status = supportSdkStatus(support)
      const previousStatus = getPostHogSupportStatus()
      setPostHogSupportStatus(status)
      if (status.state === 'ready') {
        if (statusTimer) clearTimeout(statusTimer)
        statusTimer = undefined
        if (launcher === 'visible' && previousStatus.state !== 'ready') support.show()
      } else if (status.state === 'loading' && statusChecks < 50 && !statusTimer) {
        statusChecks += 1
        statusTimer = setTimeout(() => {
          statusTimer = undefined
          monitorConversations()
        }, 100)
      } else if (statusTimer) {
        clearTimeout(statusTimer)
        statusTimer = undefined
      }
    }

    const unsubscribeFeatureFlags = posthog.onFeatureFlags(monitorConversations)
    const unsubscribeEvents = posthog.on('eventCaptured', (event) => {
      if (
        event.event === '$conversations_loaded' ||
        event.event === '$conversations_widget_loaded'
      ) {
        monitorConversations()
      }
    })
    let identityRetryTimer: ReturnType<typeof setTimeout> | undefined

    const authorizeSupport = () => {
      authorized = true
      setPostHogSupportReady(true)
      monitorConversations()
    }

    if (identityEndpoint && userId && authSessionKey) {
      const verifyIdentity = async (retry: boolean) => {
        try {
          const response = await fetch(identityEndpoint, {
            cache: 'no-store',
            credentials: 'same-origin',
            referrerPolicy: 'no-referrer',
            signal: controller.signal,
          })
          if (controller.signal.aborted) return
          if (!response.ok) {
            if (response.status >= 500 && response.status !== 503 && retry) {
              identityRetryTimer = setTimeout(() => {
                setPostHogSupportStatus({ state: 'identity-pending' })
                void verifyIdentity(false)
              }, 500)
              return
            }
            if (response.status === 401) {
              setPostHogSupportStatus({ state: 'identity-required' })
            } else if (response.status === 503) {
              setPostHogSupportStatus({ state: 'identity-error', reason: 'missing-secret' })
            } else {
              setPostHogSupportStatus({ state: 'identity-error', reason: 'verification-failed' })
            }
            return
          }
          const identity: unknown = await response.json()
          if (
            !controller.signal.aborted &&
            !posthog.has_opted_out_capturing() &&
            isIdentity(identity)
          ) {
            posthog.setIdentity(identity.distinctId, identity.hash)
            authorizeSupport()
          } else if (!controller.signal.aborted) {
            setPostHogSupportStatus({ state: 'identity-error', reason: 'verification-failed' })
          }
        } catch {
          if (controller.signal.aborted) return
          if (retry) {
            identityRetryTimer = setTimeout(() => {
              setPostHogSupportStatus({ state: 'identity-pending' })
              void verifyIdentity(false)
            }, 500)
            return
          }
          posthog.clearIdentity()
          support.hide()
          setPostHogSupportReady(false)
          setPostHogSupportStatus({ state: 'identity-error', reason: 'verification-failed' })
        }
      }
      void verifyIdentity(true)
    } else {
      setPostHogSupportStatus({ state: 'identity-required' })
    }

    return () => {
      controller.abort()
      if (statusTimer) clearTimeout(statusTimer)
      if (identityRetryTimer) clearTimeout(identityRetryTimer)
      unsubscribeFeatureFlags()
      unsubscribeEvents()
      posthog.clearIdentity()
      support.hide()
      setPostHogSupportReady(false)
      setPostHogSupportStatus({ state: 'disabled' })
    }
  }, [authSessionKey, canUseSupport, identityEndpoint, launcher, posthog, routeIsSafe, userId])

  useEffect(() => {
    if (!posthog) return
    const applyTheme = () =>
      posthog.conversations.setTheme({
        colorScheme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
      })
    applyTheme()
    const observer = new MutationObserver(applyTheme)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [posthog])

  return null
}
