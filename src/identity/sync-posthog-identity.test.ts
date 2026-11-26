import { describe, expect, it } from 'bun:test'
import { payloadDistinctId } from './payload-distinct-id'
import { type PostHogIdentityState, syncPostHogIdentity } from './sync-posthog-identity'

function identityClient(optedOut = false, distinctId = 'anonymous-id') {
  const calls: Array<[string, ...unknown[]]> = []
  return {
    calls,
    client: {
      identify: (id: string, properties?: Record<string, unknown>) =>
        calls.push(['identify', id, properties]),
      reset: () => calls.push(['reset']),
      get_distinct_id: () => distinctId,
      is_capturing: () => true,
      has_opted_out_capturing: () => optedOut,
    },
  }
}

const start: PostHogIdentityState = { id: null, propertiesKey: '' }

describe('syncPostHogIdentity', () => {
  it('qualifies user IDs by collection to prevent cross-collection collisions', () => {
    expect(payloadDistinctId('users', 1)).toBe('users:1')
    expect(payloadDistinctId('admins', 1)).toBe('admins:1')
  })

  it('identifies once the user is authenticated', () => {
    const { calls, client } = identityClient()
    const next = syncPostHogIdentity(client, start, 'users:1', { email: 'a@example.test' }, 'users')

    expect(next.id).toBe('users:1')
    expect(calls).toEqual([['identify', 'users:1', { email: 'a@example.test' }]])
  })

  it('resets when an authenticated user logs out', () => {
    const { calls, client } = identityClient()
    const previous = { id: 'users:1', propertiesKey: JSON.stringify({}) }

    expect(syncPostHogIdentity(client, previous, null, {}, 'users').id).toBeNull()
    expect(calls).toEqual([['reset']])
  })

  it('resets before identifying a different account', () => {
    const { calls, client } = identityClient()
    const previous = { id: 'users:1', propertiesKey: JSON.stringify({}) }

    syncPostHogIdentity(client, previous, 'users:2', {}, 'users')
    expect(calls).toEqual([['reset'], ['identify', 'users:2', {}]])
  })

  it('treats collection changes as account changes', () => {
    const { calls, client } = identityClient()
    const previous = { id: 'users:1', propertiesKey: JSON.stringify({}) }

    syncPostHogIdentity(client, previous, 'admins:1', {}, 'users')
    expect(calls[0]).toEqual(['reset'])
  })

  it('does not identify when the user has opted out of capture', () => {
    const { calls, client } = identityClient(true)

    expect(syncPostHogIdentity(client, start, 'users:1', {}, 'users').id).toBeNull()
    expect(calls).toEqual([])
  })

  it('does not identify the same principal and properties twice', () => {
    const { calls, client } = identityClient()
    const first = syncPostHogIdentity(
      client,
      start,
      'users:1',
      { email: 'a@example.test' },
      'users'
    )
    const second = syncPostHogIdentity(
      client,
      first,
      'users:1',
      { email: 'a@example.test' },
      'users'
    )

    expect(second).toBe(first)
    expect(calls).toHaveLength(1)
  })

  it('does not identify while the user is unauthenticated', () => {
    const { calls, client } = identityClient()

    expect(syncPostHogIdentity(client, start, null, {}, 'users').id).toBeNull()
    expect(calls).toEqual([])
  })

  it('resets a persisted Payload identity when a new page has no authenticated user', () => {
    const { calls, client } = identityClient(false, 'users:1')

    syncPostHogIdentity(client, start, null, {}, 'users')

    expect(calls).toEqual([['reset']])
  })
})
