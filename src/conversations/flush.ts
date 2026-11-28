import type { PostHog } from 'posthog-js'
import { conversationsSdkState } from './sdk-state'
import { getConversationsState, setConversationsState } from './state'

/**
 * Applies a queued open once the Payload identity is verified and the SDK is ready. The SDK
 * ignores `open()` until remote config loads, so the request waits here instead of polling.
 */
export function flushRequestedOpen(conversations: PostHog['conversations']): void {
  const state = getConversationsState()
  if (!state.openRequested || !state.consented || state.identity !== 'verified') return
  const sdk = conversationsSdkState(conversations)
  if (sdk === 'loading') return
  setConversationsState({ openRequested: false })
  if (sdk === 'ready') conversations.open()
}
