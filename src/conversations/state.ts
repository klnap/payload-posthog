import type { ConversationsSdkState } from './sdk-state'

type ConversationsIdentityState = 'none' | 'pending' | 'verified' | 'failed'

export type ConversationsState = {
  configured: boolean
  /** Payload identity is verified for the current user (not the SDK's availability). */
  identity: ConversationsIdentityState
  /** Consent allows Conversations for this page. */
  consented: boolean
  sdk: ConversationsSdkState
  /** An open requested before the SDK became ready; applied once it is ready. */
  openRequested: boolean
}

export const INITIAL_CONVERSATIONS_STATE: ConversationsState = {
  configured: false,
  identity: 'none',
  consented: false,
  sdk: 'loading',
  openRequested: false,
}

type Listener = () => void
type Store = { state: ConversationsState; listeners: Set<Listener> }

const STORE_KEY = '__payloadPostHogConversations'

// Keyed on globalThis so every chunk that imports this module shares one store.
function store(): Store {
  const global = globalThis as typeof globalThis & { [STORE_KEY]?: Store }
  global[STORE_KEY] ??= { state: INITIAL_CONVERSATIONS_STATE, listeners: new Set() }
  return global[STORE_KEY]
}

export function getConversationsState(): ConversationsState {
  return store().state
}

export function setConversationsState(patch: Partial<ConversationsState>): void {
  const current = store()
  const next = { ...current.state, ...patch }
  if (
    Object.keys(patch).every((key) =>
      Object.is(
        current.state[key as keyof ConversationsState],
        next[key as keyof ConversationsState]
      )
    )
  ) {
    return
  }
  current.state = next
  for (const listener of current.listeners) listener()
}

export function subscribeConversationsState(listener: Listener): () => void {
  const current = store()
  current.listeners.add(listener)
  return () => current.listeners.delete(listener)
}
