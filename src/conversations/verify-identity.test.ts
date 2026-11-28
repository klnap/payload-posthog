import { describe, expect, it } from 'bun:test'
import { fetchConversationsIdentity } from './verify-identity'

const HASH = 'a'.repeat(64)
const ENDPOINT = '/api/posthog/conversations/identity'

function fetcherReturning(body: unknown, init: { status?: number } = {}) {
  const calls: Array<[string, RequestInit | undefined]> = []
  const fetcher = (async (url: string, options?: RequestInit) => {
    calls.push([url, options])
    return new Response(JSON.stringify(body), { status: init.status ?? 200 })
  }) as typeof fetch
  return { calls, fetcher }
}

describe('fetchConversationsIdentity', () => {
  it('returns the signed identity for the expected distinct ID', async () => {
    const { calls, fetcher } = fetcherReturning({ distinctId: 'users:1', hash: HASH })
    const result = await fetchConversationsIdentity({
      endpoint: ENDPOINT,
      expectedDistinctId: 'users:1',
      signal: new AbortController().signal,
      fetcher,
    })
    expect(result).toEqual({ distinctId: 'users:1', hash: HASH })
    expect(calls[0]?.[1]).toMatchObject({
      cache: 'no-store',
      credentials: 'same-origin',
      referrerPolicy: 'no-referrer',
    })
  })

  it('rejects a signed identity for a different user', async () => {
    const { fetcher } = fetcherReturning({ distinctId: 'users:2', hash: HASH })
    expect(
      await fetchConversationsIdentity({
        endpoint: ENDPOINT,
        expectedDistinctId: 'users:1',
        signal: new AbortController().signal,
        fetcher,
      })
    ).toBeNull()
  })

  it('rejects malformed hashes', async () => {
    for (const hash of ['xyz', 'a'.repeat(63), 'g'.repeat(64), undefined]) {
      const { fetcher } = fetcherReturning({ distinctId: 'users:1', hash })
      expect(
        await fetchConversationsIdentity({
          endpoint: ENDPOINT,
          expectedDistinctId: 'users:1',
          signal: new AbortController().signal,
          fetcher,
        })
      ).toBeNull()
    }
  })

  it('returns null for error responses', async () => {
    const { fetcher } = fetcherReturning({ error: 'unauthorized' }, { status: 401 })
    expect(
      await fetchConversationsIdentity({
        endpoint: ENDPOINT,
        expectedDistinctId: 'users:1',
        signal: new AbortController().signal,
        fetcher,
      })
    ).toBeNull()
  })

  it('does not apply a response that arrives after the request was aborted', async () => {
    const controller = new AbortController()
    const fetcher = (async () => {
      controller.abort(new Error('logout'))
      return new Response(JSON.stringify({ distinctId: 'users:1', hash: HASH }))
    }) as unknown as typeof fetch
    await expect(
      fetchConversationsIdentity({
        endpoint: ENDPOINT,
        expectedDistinctId: 'users:1',
        signal: controller.signal,
        fetcher,
      })
    ).rejects.toThrow('logout')
  })
})
