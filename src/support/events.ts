import type { PostHogSupportStatus } from './status'

export const POSTHOG_SUPPORT_READY_EVENT = 'payload-posthog:support-ready'
export const POSTHOG_SUPPORT_STATUS_EVENT = 'payload-posthog:support-status'

type SupportWindow = Window & {
  __payloadPostHogSupportLauncher?: 'visible' | 'hidden'
  __payloadPostHogSupportReady?: boolean
  __payloadPostHogSupportStatus?: PostHogSupportStatus
}

export function getPostHogSupportReady(): boolean {
  return (
    typeof window !== 'undefined' && (window as SupportWindow).__payloadPostHogSupportReady === true
  )
}

export function getPostHogSupportStatus(): PostHogSupportStatus {
  return (
    (typeof window !== 'undefined' && (window as SupportWindow).__payloadPostHogSupportStatus) || {
      state: 'disabled',
    }
  )
}

export function setPostHogSupportStatus(status: PostHogSupportStatus): void {
  if (typeof window === 'undefined') return
  const supportWindow = window as SupportWindow
  const previous = supportWindow.__payloadPostHogSupportStatus
  if (
    previous?.state === status.state &&
    (!('stage' in status) || ('stage' in previous && previous.stage === status.stage)) &&
    (!('reason' in status) || ('reason' in previous && previous.reason === status.reason))
  ) {
    return
  }
  supportWindow.__payloadPostHogSupportStatus = status
  window.dispatchEvent(new CustomEvent(POSTHOG_SUPPORT_STATUS_EVENT, { detail: status }))
}

export function subscribeToPostHogSupportStatus(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(POSTHOG_SUPPORT_STATUS_EVENT, listener)
  return () => window.removeEventListener(POSTHOG_SUPPORT_STATUS_EVENT, listener)
}

export function getPostHogSupportLauncher(): 'visible' | 'hidden' {
  return (
    (typeof window !== 'undefined' && (window as SupportWindow).__payloadPostHogSupportLauncher) ||
    'visible'
  )
}

export function setPostHogSupportLauncher(launcher: 'visible' | 'hidden'): void {
  if (typeof window !== 'undefined') {
    ;(window as SupportWindow).__payloadPostHogSupportLauncher = launcher
  }
}

export function subscribeToPostHogSupportReady(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(POSTHOG_SUPPORT_READY_EVENT, listener)
  return () => window.removeEventListener(POSTHOG_SUPPORT_READY_EVENT, listener)
}

export function setPostHogSupportReady(ready: boolean): void {
  if (typeof window === 'undefined') return
  ;(window as SupportWindow).__payloadPostHogSupportReady = ready
  window.dispatchEvent(new CustomEvent(POSTHOG_SUPPORT_READY_EVENT, { detail: ready }))
}
