import { describe, expect, it } from 'bun:test'
import type { PostHog } from 'posthog-js'
import { flushRequestedOpen } from './flush'
import { canOpenConversations, conversationsStatus } from './policy'
import { conversationsSdkState } from './sdk-state'
import {
  type ConversationsState,
  getConversationsState,
  INITIAL_CONVERSATIONS_STATE,
  setConversationsState,
} from './state'

const verified: ConversationsState = {
  ...INITIAL_CONVERSATIONS_STATE,
  configured: true,
  consented: true,
  identity: 'verified',
  sdk: 'ready',
}

type Sdk = PostHog['conversations']

function sdk(overrides: Partial<Record<'isAvailable' | 'reason', unknown>> = {}) {
  const calls: string[] = []
  const conversations = {
    isAvailable: () => (overrides.isAvailable ?? true) as boolean,
    getUnavailableReason: () => (overrides.reason ?? null) as string | null,
    open: () => calls.push('open'),
    show: () => calls.push('show'),
    hide: () => calls.push('hide'),
    close: () => calls.push('close'),
  } as unknown as Sdk
  return { calls, conversations }
}

describe('conversations policy', () => {
  it('permits opening only with verified identity and policy', () => {
    expect(canOpenConversations(verified)).toBe(true)
    expect(canOpenConversations({ ...verified, identity: 'pending' })).toBe(false)
    expect(canOpenConversations({ ...verified, identity: 'failed' })).toBe(false)
    expect(canOpenConversations({ ...verified, consented: false })).toBe(false)
    expect(canOpenConversations({ ...verified, configured: false })).toBe(false)
  })

  it('reports ready only when identity is verified and the SDK is available', () => {
    expect(conversationsStatus(verified, false)).toBe('ready')
    expect(conversationsStatus({ ...verified, sdk: 'loading' }, false)).toBe('loading')
    expect(conversationsStatus({ ...verified, sdk: 'unavailable' }, false)).toBe('unavailable')
    expect(conversationsStatus({ ...verified, identity: 'pending' }, false)).toBe('loading')
    expect(conversationsStatus({ ...verified, identity: 'failed' }, false)).toBe('unavailable')
    expect(conversationsStatus({ ...verified, identity: 'none' }, false)).toBe('unavailable')
    expect(conversationsStatus(verified, true)).toBe('disabled')
    expect(conversationsStatus(INITIAL_CONVERSATIONS_STATE, false)).toBe('disabled')
  })

  it('maps SDK reasons without treating disabled projects as loading', () => {
    expect(conversationsSdkState(sdk({ isAvailable: true }).conversations)).toBe('ready')
    expect(
      conversationsSdkState(sdk({ isAvailable: false, reason: 'not_loaded' }).conversations)
    ).toBe('loading')
    expect(
      conversationsSdkState(
        sdk({ isAvailable: false, reason: 'remote_config_pending' }).conversations
      )
    ).toBe('loading')
    expect(
      conversationsSdkState(
        sdk({ isAvailable: false, reason: 'disabled_in_project' }).conversations
      )
    ).toBe('unavailable')
    expect(
      conversationsSdkState(sdk({ isAvailable: false, reason: 'consent_opted_out' }).conversations)
    ).toBe('unavailable')
  })
})

describe('flushRequestedOpen', () => {
  const requested = { ...verified, openRequested: true }
  const reset = () => setConversationsState({ ...INITIAL_CONVERSATIONS_STATE })

  it('opens a queued request once identity is verified and the SDK is ready', () => {
    reset()
    setConversationsState(requested)
    const { calls, conversations } = sdk()
    flushRequestedOpen(conversations)
    expect(calls).toEqual(['open'])
    expect(getConversationsState().openRequested).toBe(false)
  })

  it('keeps the request while the SDK is still loading', () => {
    reset()
    setConversationsState(requested)
    const { calls, conversations } = sdk({ isAvailable: false, reason: 'not_loaded' })
    flushRequestedOpen(conversations)
    expect(calls).toEqual([])
    expect(getConversationsState().openRequested).toBe(true)
  })

  it('drops the request when the SDK is unavailable', () => {
    reset()
    setConversationsState(requested)
    const { calls, conversations } = sdk({ isAvailable: false, reason: 'disabled_in_project' })
    flushRequestedOpen(conversations)
    expect(calls).toEqual([])
    expect(getConversationsState().openRequested).toBe(false)
  })

  it('waits for identity verification before opening', () => {
    reset()
    setConversationsState({ ...requested, identity: 'pending' })
    const { calls, conversations } = sdk()
    flushRequestedOpen(conversations)
    expect(calls).toEqual([])
    expect(getConversationsState().openRequested).toBe(true)
  })
})
