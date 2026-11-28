import type { PostHog } from 'posthog-js'

export type ConversationsSdkState = 'loading' | 'ready' | 'unavailable'

/**
 * Maps the native Conversations availability to the plugin's three states. `isAvailable()` only
 * reports the SDK; it does not prove that the Payload identity has been verified.
 */
export function conversationsSdkState(
  conversations: PostHog['conversations']
): ConversationsSdkState {
  if (conversations.isAvailable()) return 'ready'
  switch (conversations.getUnavailableReason()) {
    case 'remote_config_pending':
    case 'initializing':
    case 'not_loaded':
      return 'loading'
    default:
      return 'unavailable'
  }
}
