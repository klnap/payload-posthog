import type { ConversationsState } from './state'

export type PostHogConversationsStatus = 'disabled' | 'loading' | 'ready' | 'unavailable'

/** Payload identity is verified and consent allows Conversations. */
export function canOpenConversations(state: ConversationsState): boolean {
  return state.configured && state.consented && state.identity === 'verified'
}

/** Public status. `ready` requires both verified Payload identity and native SDK availability. */
export function conversationsStatus(
  state: ConversationsState,
  sdkDisabled: boolean
): PostHogConversationsStatus {
  if (!state.configured || sdkDisabled) return 'disabled'
  if (!state.consented || state.identity === 'none' || state.identity === 'failed') {
    return 'unavailable'
  }
  if (state.identity === 'pending') return 'loading'
  if (state.sdk === 'ready') return 'ready'
  return state.sdk === 'loading' ? 'loading' : 'unavailable'
}
