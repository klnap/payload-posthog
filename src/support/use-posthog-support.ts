'use client'

import { usePostHog } from '@posthog/next'
import { usePathname, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { isSafeAdminSupportRoute, normalizeGuestRoute } from '../plugin/guest-route-tracking'
import { useAdminPath } from '../plugin/payload-routes'
import {
  getPostHogSupportLauncher,
  getPostHogSupportStatus,
  setPostHogSupportStatus,
  subscribeToPostHogSupportStatus,
} from './events'
import {
  type PostHogSupportOpenResult,
  type PostHogSupportStatus,
  type PostHogSupportUnavailableReason,
  supportSdkStatus,
} from './status'

const OPEN_TIMEOUT_MS = 3_000
const OPEN_POLL_INTERVAL_MS = 100
type PendingOpen = {
  promise: Promise<PostHogSupportOpenResult>
  cancel: { current: () => void }
}

export async function openConversation(
  conversations: ReturnType<typeof usePostHog>['conversations'],
  initialStatus: PostHogSupportStatus,
  isCancelled: () => boolean,
  getUnavailableReason: () => PostHogSupportUnavailableReason | null = () => null,
  onCancelled: () => void = () => conversations.hide()
): Promise<PostHogSupportOpenResult> {
  if (initialStatus.state === 'unavailable' && initialStatus.reason === 'sensitive-route') {
    conversations.hide()
    const status = { state: 'unavailable', reason: 'sensitive-route' } as const
    setPostHogSupportStatus(status)
    return status
  }
  const initialUnavailableReason = getUnavailableReason()
  if (initialUnavailableReason) {
    conversations.hide()
    const status = { state: 'unavailable', reason: initialUnavailableReason } as const
    setPostHogSupportStatus(status)
    return status
  }
  if (initialStatus.state === 'identity-pending') {
    return { state: 'blocked', reason: 'identity-pending' }
  }
  if (initialStatus.state === 'identity-required' || initialStatus.state === 'identity-error') {
    return { state: 'blocked', reason: 'identity-required' }
  }
  const currentStatus = supportSdkStatus(conversations)
  if (currentStatus.state === 'disabled') {
    setPostHogSupportStatus(currentStatus)
    return { state: 'blocked', reason: 'disabled' }
  }
  if (currentStatus.state === 'unavailable') {
    setPostHogSupportStatus(currentStatus)
    return { state: 'unavailable', reason: currentStatus.reason }
  }

  conversations.open()
  const deadline = Date.now() + OPEN_TIMEOUT_MS
  while (Date.now() < deadline) {
    const unavailableReason = getUnavailableReason()
    if (unavailableReason) {
      conversations.hide()
      const status = { state: 'unavailable', reason: unavailableReason } as const
      setPostHogSupportStatus(status)
      return status
    }
    if (isCancelled()) {
      onCancelled()
      return { state: 'loading' }
    }
    if (conversations.isVisible()) {
      setPostHogSupportStatus({ state: 'ready' })
      return { state: 'opened' }
    }

    const status = supportSdkStatus(conversations)
    if (status.state === 'unavailable') {
      setPostHogSupportStatus(status)
      return { state: 'unavailable', reason: status.reason }
    }
    if (status.state === 'disabled') {
      setPostHogSupportStatus(status)
      return { state: 'blocked', reason: 'disabled' }
    }
    setPostHogSupportStatus(status)
    await new Promise((resolve) => setTimeout(resolve, OPEN_POLL_INTERVAL_MS))
  }

  const finalUnavailableReason = getUnavailableReason()
  if (finalUnavailableReason) {
    conversations.hide()
    const status = { state: 'unavailable', reason: finalUnavailableReason } as const
    setPostHogSupportStatus(status)
    return status
  }
  if (isCancelled()) {
    onCancelled()
    return { state: 'loading' }
  }
  const finalStatus = supportSdkStatus(conversations)
  if (finalStatus.state === 'ready') {
    const unavailable = { state: 'unavailable', reason: 'widget-not-opened' } as const
    setPostHogSupportStatus(unavailable)
    return unavailable
  }
  setPostHogSupportStatus(finalStatus)
  return finalStatus.state === 'unavailable'
    ? { state: 'unavailable', reason: finalStatus.reason }
    : { state: 'loading' }
}

/**
 * Controls PostHog Conversations from consumer-owned UI.
 * `isAvailable` means the SDK reports Conversations ready; use `canOpen` to enable a custom trigger.
 */
export function usePostHogSupport() {
  const adminPath = useAdminPath()
  const posthog = usePostHog()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const route = normalizeGuestRoute(pathname ?? '/', adminPath)
  const routeIsSafe = isSafeAdminSupportRoute(route, searchParams.toString())
  const routeSafety = useRef(routeIsSafe)
  routeSafety.current = routeIsSafe
  const observedStatus = useSyncExternalStore(
    subscribeToPostHogSupportStatus,
    getPostHogSupportStatus,
    (): PostHogSupportStatus => ({ state: 'disabled' })
  )
  const status = posthog.config.disable_conversations
    ? { state: 'disabled' as const }
    : routeIsSafe
      ? observedStatus
      : { state: 'unavailable' as const, reason: 'sensitive-route' as const }
  const operation = useRef(0)
  const pendingOpen = useRef<PendingOpen | null>(null)
  const isAvailable = status.state === 'ready'
  const canOpen = routeIsSafe && (status.state === 'ready' || status.state === 'loading')

  useEffect(
    () => () => {
      operation.current += 1
      if (pendingOpen.current) {
        pendingOpen.current.cancel.current = () => posthog.conversations.hide()
      }
      posthog.conversations.hide()
    },
    [posthog]
  )
  useEffect(() => {
    if (canOpen) return
    operation.current += 1
    if (pendingOpen.current) {
      pendingOpen.current.cancel.current = () => posthog.conversations.hide()
    }
    posthog.conversations.hide()
  }, [canOpen, posthog])

  const open = useCallback(() => {
    if (pendingOpen.current) return pendingOpen.current.promise
    const id = ++operation.current
    const cancel = { current: () => posthog.conversations.hide() }
    const promise = openConversation(
      posthog.conversations,
      status,
      () => operation.current !== id,
      () => {
        if (!routeSafety.current) return 'sensitive-route'
        return posthog.is_capturing() && !posthog.has_opted_out_capturing() ? null : 'consent'
      },
      () => cancel.current()
    ).catch(() => {
      const unavailable = { state: 'unavailable', reason: 'sdk-failure' } as const
      setPostHogSupportStatus(unavailable)
      return unavailable
    })
    const pending = { promise, cancel }
    pendingOpen.current = pending
    void promise.finally(() => {
      if (pendingOpen.current === pending) {
        pendingOpen.current = null
      }
    })
    return promise
  }, [posthog, status])

  const close = useCallback(() => {
    operation.current += 1
    if (!canOpen) return
    const closeConversation = () => {
      if (getPostHogSupportLauncher() === 'hidden') posthog.conversations.hide()
      else posthog.conversations.close()
    }
    if (pendingOpen.current) pendingOpen.current.cancel.current = closeConversation
    closeConversation()
  }, [canOpen, posthog])

  return { status, isAvailable, canOpen, open, close }
}
