import { describe, expect, it } from 'bun:test'
import { createHmac } from 'node:crypto'
import type { PayloadRequest } from 'payload'
import {
  CONVERSATIONS_IDENTITY_PATH,
  conversationsIdentityURL,
  createConversationsIdentityEndpoint,
} from './identity-endpoint'

const SECRET = 'synthetic-conversations-secret'
const URL_ = 'https://cms.example.test/api/posthog/conversations/identity'

function request(overrides: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return {
    url: URL_,
    headers: new Headers({ origin: 'https://cms.example.test', ...headers }),
    user: { id: 7, collection: 'users', _strategy: 'local-jwt' },
    ...overrides,
  } as unknown as PayloadRequest
}

function endpoint(
  options: Partial<Parameters<typeof createConversationsIdentityEndpoint>[0]> = {}
) {
  return createConversationsIdentityEndpoint({
    authCollections: ['users'],
    canAccessAdmin: async () => true,
    getSecret: () => SECRET,
    ...options,
  })
}

async function call(req: PayloadRequest, ep = endpoint()) {
  const response = await ep.handler(req)
  return { status: response.status, headers: response.headers, body: await response.json() }
}

describe('conversations identity endpoint', () => {
  it('registers the fixed path and honors routes.api', () => {
    expect(endpoint().path).toBe(CONVERSATIONS_IDENTITY_PATH)
    expect(conversationsIdentityURL('/api')).toBe(URL_.replace('https://cms.example.test', ''))
    expect(conversationsIdentityURL('/custom')).toBe('/custom/posthog/conversations/identity')
    expect(conversationsIdentityURL('/')).toBe('/posthog/conversations/identity')
  })

  it('signs only the trusted session user with a private no-store response', async () => {
    const result = await call(request())
    const hash = createHmac('sha256', SECRET).update('users:7').digest('hex')

    expect(result.status).toBe(200)
    expect(result.body).toEqual({ distinctId: 'users:7', hash })
    expect(result.headers.get('cache-control')).toBe('private, no-store, max-age=0')
    expect(JSON.stringify(result.body)).not.toContain(SECRET)
  })

  it('ignores browser-supplied identities', async () => {
    const result = await call(request({ query: { distinctId: 'users:999' } }))
    expect(result.body.distinctId).toBe('users:7')
  })

  it('rejects cross-origin requests', async () => {
    const result = await call(request({}, { origin: 'https://evil.example.test' }))
    expect(result.status).toBe(403)
  })

  it('accepts exact same-origin fetch metadata without an Origin header', async () => {
    const req = request({}, { 'sec-fetch-site': 'same-origin' })
    req.headers.delete('origin')
    expect((await call(req)).status).toBe(200)
  })

  it('rejects same-site sibling origins without an Origin header', async () => {
    const req = request({}, { 'sec-fetch-site': 'same-site' })
    req.headers.delete('origin')
    expect((await call(req)).status).toBe(403)
  })

  it('rejects anonymous, service, API-key, and non-auth-collection identities', async () => {
    expect((await call(request({ user: null }))).status).toBe(401)
    expect(
      (await call(request({ user: { id: 1, collection: 'users', type: 'service' } }))).status
    ).toBe(401)
    expect(
      (await call(request({ user: { id: 1, collection: 'users', _strategy: 'api-key' } }))).status
    ).toBe(401)
    expect((await call(request({ user: { id: 1, collection: 'other' } }))).status).toBe(401)
    expect((await call(request({ user: { collection: 'users' } }))).status).toBe(401)
  })

  it('requires Payload Admin access', async () => {
    const result = await call(request(), endpoint({ canAccessAdmin: async () => false }))
    expect(result.status).toBe(403)
  })

  it('returns 503 without a secret and never leaks it', async () => {
    const result = await call(request(), endpoint({ getSecret: () => '' }))
    expect(result.status).toBe(503)
    expect(JSON.stringify(result.body)).not.toContain(SECRET)
  })

  it('returns a generic 500 when an access check throws', async () => {
    const result = await call(
      request(),
      endpoint({
        canAccessAdmin: async () => {
          throw new Error(`database password ${SECRET}`)
        },
      })
    )
    expect(result.status).toBe(500)
    expect(JSON.stringify(result.body)).not.toContain(SECRET)
  })

  it('logs the outcome in debug mode but never the signature or secret', async () => {
    const logs: unknown[][] = []
    const original = console.log
    console.log = (...args: unknown[]) => void logs.push(args)
    try {
      const result = await call(request(), endpoint({ debug: true }))
      expect(result.status).toBe(200)
    } finally {
      console.log = original
    }
    const printed = JSON.stringify(logs)
    expect(printed).toContain('users:7')
    expect(printed).not.toContain(SECRET)
    expect(printed).not.toMatch(/[a-f\d]{64}/)
  })
})
