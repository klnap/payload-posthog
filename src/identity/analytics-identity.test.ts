import { describe, expect, it } from 'bun:test'
import {
  ANONYMOUS_IDENTITY,
  type AnalyticsIdentityClient,
  type AnalyticsIdentityState,
  syncAnalyticsIdentity,
} from './analytics-identity'

function client(distinctId = 'anonymous-id') {
  const calls: unknown[][] = []
  const native: AnalyticsIdentityClient = {
    identify: (id, properties) => calls.push(['identify', id, properties]),
    reset: () => calls.push(['reset']),
    get_distinct_id: () => distinctId,
  }
  return { calls, native }
}

const COLLECTIONS = ['users']
const ada = { distinctId: 'users:1', properties: { email: 'ada@example.test' } }

describe('syncAnalyticsIdentity', () => {
  it('identifies an authenticated user once', () => {
    const { calls, native } = client()
    const first = syncAnalyticsIdentity(native, ANONYMOUS_IDENTITY, ada, COLLECTIONS)
    const second = syncAnalyticsIdentity(native, first, ada, COLLECTIONS)

    expect(first.distinctId).toBe('users:1')
    expect(second).toBe(first)
    expect(calls).toEqual([['identify', 'users:1', { email: 'ada@example.test' }]])
  })

  it('re-identifies when mapped properties change without resetting', () => {
    const { calls, native } = client()
    const first = syncAnalyticsIdentity(native, ANONYMOUS_IDENTITY, ada, COLLECTIONS)
    syncAnalyticsIdentity(
      native,
      first,
      { distinctId: 'users:1', properties: { email: 'new@example.test' } },
      COLLECTIONS
    )

    expect(calls.map((call) => call[0])).toEqual(['identify', 'identify'])
    expect(calls).not.toContainEqual(['reset'])
  })

  it('resets on logout', () => {
    const { calls, native } = client()
    const previous: AnalyticsIdentityState = { distinctId: 'users:1', propertiesKey: '{}' }
    expect(syncAnalyticsIdentity(native, previous, null, COLLECTIONS)).toEqual(ANONYMOUS_IDENTITY)
    expect(calls).toEqual([['reset']])
  })

  it('resets before identifying a different user', () => {
    const { calls, native } = client()
    const previous: AnalyticsIdentityState = { distinctId: 'users:1', propertiesKey: '{}' }
    syncAnalyticsIdentity(native, previous, { distinctId: 'users:2', properties: {} }, COLLECTIONS)
    expect(calls).toEqual([['reset'], ['identify', 'users:2', {}]])
  })

  it('resets a stale persisted identity on a page without a user', () => {
    const { calls, native } = client('users:1')
    syncAnalyticsIdentity(native, ANONYMOUS_IDENTITY, null, COLLECTIONS)
    expect(calls).toEqual([['reset']])
  })

  it('resets a stale persisted identity before identifying a different user on load', () => {
    const { calls, native } = client('users:1')
    syncAnalyticsIdentity(
      native,
      ANONYMOUS_IDENTITY,
      { distinctId: 'users:2', properties: {} },
      COLLECTIONS
    )
    expect(calls).toEqual([['reset'], ['identify', 'users:2', {}]])
  })

  it('does not touch a persisted anonymous identity', () => {
    const { calls, native } = client('anonymous-id')
    expect(syncAnalyticsIdentity(native, ANONYMOUS_IDENTITY, null, COLLECTIONS)).toBe(
      ANONYMOUS_IDENTITY
    )
    expect(calls).toEqual([])
  })

  it('qualifies distinct IDs by collection for every configured auth collection', () => {
    const { calls, native } = client('admins:9')
    syncAnalyticsIdentity(native, ANONYMOUS_IDENTITY, null, ['users', 'admins'])
    expect(calls).toEqual([['reset']])
  })
})
