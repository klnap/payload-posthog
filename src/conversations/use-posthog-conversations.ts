'use client'

import { usePostHog } from '@posthog/next'
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { flushRequestedOpen } from './flush'
import {
  canOpenConversations,
  conversationsStatus,
  type PostHogConversationsStatus,
} from './policy'
import {
  getConversationsState,
  INITIAL_CONVERSATIONS_STATE,
  setConversationsState,
  subscribeConversationsState,
} from './state'

export type { PostHogConversationsStatus }

export type PostHogConversationsControls = {
  status: PostHogConversationsStatus
  /** Payload identity is verified and policy allows opening; the SDK may still be loading. */
  canOpen: boolean
  /** The native SDK reports Conversations available. It does not verify the Payload identity. */
  isAvailable: boolean
  open: () => void
  close: () => void
  show: () => void
  hide: () => void
}

/**
 * Controls PostHog Conversations from consumer UI. Use `usePostHog().conversations` for tickets,
 * messages, and themes; this hook only adds Payload identity and launcher policy.
 */
export function usePostHogConversations(): PostHogConversationsControls {
  const posthog = usePostHog()
  const state = useSyncExternalStore(
    subscribeConversationsState,
    getConversationsState,
    () => INITIAL_CONVERSATIONS_STATE
  )
  const sdkDisabled = Boolean(posthog?.config.disable_conversations)
  const status = conversationsStatus(state, sdkDisabled)

  const open = useCallback(() => {
    if (!posthog) return
    // Read current state, not the render-time snapshot, so a stale button cannot open after logout.
    const current = getConversationsState()
    if (!canOpenConversations(current)) return
    setConversationsState({ openRequested: true })
    flushRequestedOpen(posthog.conversations)
  }, [posthog])

  const show = useCallback(() => {
    if (!posthog || !canOpenConversations(getConversationsState())) return
    posthog.conversations.show()
  }, [posthog])

  const hide = useCallback(() => {
    // Cancels a queued open as well as the rendered widget.
    setConversationsState({ openRequested: false })
    posthog?.conversations.hide()
  }, [posthog])

  const close = useCallback(() => {
    setConversationsState({ openRequested: false })
    posthog?.conversations.close()
  }, [posthog])

  return useMemo(
    () => ({
      status,
      canOpen: canOpenConversations(state),
      isAvailable: state.sdk === 'ready',
      open,
      close,
      show,
      hide,
    }),
    [close, hide, open, show, state, status]
  )
}
