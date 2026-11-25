import { describe, expect, it } from 'bun:test'
import type { PostHog } from 'posthog-js'
import { supportSdkStatus } from './status'

type ConversationsApi = PostHog['conversations']

function conversations(
  reason: ReturnType<ConversationsApi['getUnavailableReason']>,
  available = false
): ConversationsApi {
  return {
    getUnavailableReason: () => reason,
    isAvailable: () => available,
  } as ConversationsApi
}

describe('supportSdkStatus', () => {
  it('reports ready only when the SDK reports Conversations available', () => {
    expect(supportSdkStatus(conversations('remote_config_pending'))).toEqual({
      state: 'loading',
      stage: 'remote-config',
    })
    expect(supportSdkStatus(conversations(null, true))).toEqual({ state: 'ready' })
  })

  it('maps remote disablement, consent, and SDK failures to stable public reasons', () => {
    expect(supportSdkStatus(conversations('disabled_in_project'))).toEqual({
      state: 'unavailable',
      reason: 'remote-disabled',
    })
    expect(supportSdkStatus(conversations('consent_opted_out'))).toEqual({
      state: 'unavailable',
      reason: 'consent',
    })
    expect(supportSdkStatus(conversations('load_failed'))).toEqual({
      state: 'unavailable',
      reason: 'sdk-failure',
    })
  })

  it('distinguishes local disablement from remote disablement', () => {
    expect(supportSdkStatus(conversations('disabled_by_config'))).toEqual({ state: 'disabled' })
    expect(supportSdkStatus(conversations('missing_token'))).toEqual({
      state: 'unavailable',
      reason: 'configuration',
    })
  })
})
