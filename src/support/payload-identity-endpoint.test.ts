import { describe, expect, it } from 'bun:test'
import { createHmac } from 'node:crypto'
import type { Endpoint } from 'payload'
import {
  createPayloadSupportIdentityEndpoint,
  POSTHOG_SUPPORT_IDENTITY_PATH,
  postHogSupportIdentityURL,
} from './payload-identity-endpoint'

function endpoint(
  user: unknown,
  getSecret: () => string | undefined = () => 'test-secret',
  canAccessAdmin: () => Promise<boolean> = async () => true
) {
  const value = createPayloadSupportIdentityEndpoint({
    adminUserCollection: 'admins',
    authCollections: ['admins', 'users'],
    canAccessAdmin,
    getSecret,
  })
  const request = Object.assign(
    new Request(`https://studio.example/api${POSTHOG_SUPPORT_IDENTITY_PATH}?distinctId=spoofed`, {
      headers: { Origin: 'https://studio.example' },
    }),
    { user }
  )
  return (value.handler as (request: Request & { user: unknown }) => Promise<Response>)(request)
}

describe('Payload Support identity endpoint', () => {
  it('signs the authenticated, collection-qualified Payload identity only', async () => {
    const response = await endpoint({ id: 42, collection: 'admins' })
    const body = (await response.json()) as { distinctId: string; hash: string }

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(body).toEqual({
      distinctId: 'admins:42',
      hash: createHmac('sha256', 'test-secret').update('admins:42').digest('hex'),
    })
  })

  it('uses each authenticated collection and distinguishes equal user IDs', async () => {
    const admins = await endpoint({ id: '42', collection: 'admins' })
    const users = await endpoint({ id: '42', collection: 'users' })

    expect((await admins.json()).distinctId).toBe('admins:42')
    expect((await users.json()).distinctId).toBe('users:42')
  })

  it('rejects anonymous, service, and non-authenticated-collection identities', async () => {
    expect((await endpoint(null)).status).toBe(401)
    expect((await endpoint({ id: 'svc', collection: 'users', type: 'service' })).status).toBe(401)
    expect((await endpoint({ id: '1', collection: 'articles' })).status).toBe(401)
    expect((await endpoint({ id: 0, collection: 'admins' })).status).toBe(200)
  })

  it('refuses users whose Payload admin access check is false, without signing', async () => {
    let secretReads = 0
    const response = await endpoint(
      { id: '42', collection: 'users' },
      () => {
        secretReads += 1
        return 'test-secret'
      },
      async () => false
    )
    const body = await response.text()

    expect(response.status).toBe(403)
    expect(body).not.toContain('distinctId')
    expect(body).not.toContain('hash')
    expect(secretReads).toBe(0)
  })

  it('treats empty and incorrectly typed signing secrets as unconfigured', async () => {
    const empty = await endpoint({ id: '42', collection: 'admins' }, () => '')
    const typed = await endpoint({ id: '42', collection: 'admins' }, () => 42 as unknown as string)

    expect(empty.status).toBe(503)
    expect(typed.status).toBe(503)
    expect((await empty.json()).error).toBe('not_configured')
    expect((await typed.json()).error).toBe('not_configured')
  })

  it('does not sign identity when the server secret is missing', async () => {
    const response = await endpoint({ id: '42', collection: 'admins' }, () => undefined)
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toEqual({
      error: 'not_configured',
      message: 'Set payload.support.identitySecret on the server.',
    })
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0')
  })

  it('returns 500 instead of throwing when access resolution fails', async () => {
    const value = createPayloadSupportIdentityEndpoint({
      adminUserCollection: 'admins',
      authCollections: ['admins'],
      canAccessAdmin: async () => {
        throw new Error('boom')
      },
      getSecret: () => 'test-secret',
    })
    const request = Object.assign(
      new Request(`https://studio.example/api${POSTHOG_SUPPORT_IDENTITY_PATH}`, {
        headers: { Origin: 'https://studio.example' },
      }),
      { user: { id: '42', collection: 'admins' } }
    )
    const handler = value.handler as (request: Request & { user: unknown }) => Promise<Response>
    const response = await handler(request)

    expect(response.status).toBe(500)
  })

  it('does not read the signing secret for unauthenticated requests', async () => {
    let secretReads = 0
    const response = await endpoint(null, () => {
      secretReads += 1
      return 'test-secret'
    })

    expect(response.status).toBe(401)
    expect(secretReads).toBe(0)
  })

  it('rejects cross-origin requests before reading identity or signing', async () => {
    const value = createPayloadSupportIdentityEndpoint({
      adminUserCollection: 'admins',
      authCollections: ['admins'],
      getSecret: () => 'test-secret',
    })
    const request = Object.assign(
      new Request(`https://studio.example/api${POSTHOG_SUPPORT_IDENTITY_PATH}`, {
        headers: { Origin: 'https://attacker.example' },
      }),
      { user: { id: '42', collection: 'admins' } }
    )
    const handler = value.handler as (request: Request & { user: unknown }) => Promise<Response>
    const response = await handler(request)

    expect(response.status).toBe(403)
    expect(await response.text()).not.toContain('distinctId')
  })

  it('rejects requests that carry neither Origin nor a same-site Fetch Metadata header', async () => {
    const value = createPayloadSupportIdentityEndpoint({
      adminUserCollection: 'admins',
      authCollections: ['admins'],
      canAccessAdmin: async () => true,
      getSecret: () => 'test-secret',
    })
    const handler = value.handler as (request: Request & { user: unknown }) => Promise<Response>
    const user = { id: '42', collection: 'admins' }
    const url = `https://studio.example/api${POSTHOG_SUPPORT_IDENTITY_PATH}`

    const missingBoth = Object.assign(new Request(url), { user })
    expect((await handler(missingBoth)).status).toBe(403)

    // A sibling subdomain is same-site, not same-origin, so it is refused without an Origin header.
    const sameSite = Object.assign(
      new Request(url, { headers: { 'Sec-Fetch-Site': 'same-site' } }),
      { user }
    )
    expect((await handler(sameSite)).status).toBe(403)

    const crossSite = Object.assign(
      new Request(url, { headers: { 'Sec-Fetch-Site': 'cross-site' } }),
      {
        user,
      }
    )
    expect((await handler(crossSite)).status).toBe(403)

    const sameOrigin = Object.assign(
      new Request(url, { headers: { 'Sec-Fetch-Site': 'same-origin' } }),
      {
        user,
      }
    )
    expect((await handler(sameOrigin)).status).toBe(200)
  })

  it('builds the identity URL from Payload’s configured API prefix', () => {
    expect(postHogSupportIdentityURL()).toBe('/api/posthog/support/identity')
    expect(postHogSupportIdentityURL('/cms-api/')).toBe('/cms-api/posthog/support/identity')
    expect(postHogSupportIdentityURL('/')).toBe(POSTHOG_SUPPORT_IDENTITY_PATH)
  })

  it('registers a GET endpoint under Payload’s root endpoint contract', () => {
    const registered: Endpoint = createPayloadSupportIdentityEndpoint({
      adminUserCollection: 'admins',
      authCollections: ['admins'],
      getSecret: () => 'test-secret',
    })

    expect(registered).toMatchObject({
      method: 'get',
      path: POSTHOG_SUPPORT_IDENTITY_PATH,
    })
  })
})

describe('Payload Support identity endpoint with the real admin access check', () => {
  // Minimal stub: only the fields getAccessResults reads. Both collections pass their own
  // `access.admin`, so only the `admin.user` match decides the result.
  const accessCollection = (slug: string) => ({ slug, access: {}, fields: [] })
  const adminCollection = accessCollection('usersadminers')
  const stubPayload = {
    config: {
      admin: { user: 'usersadminers' },
      collections: [adminCollection],
      globals: [],
    },
    collections: {
      usersadminers: {
        config: { ...adminCollection, access: { admin: async () => true } },
      },
      users: {
        config: { ...accessCollection('users'), access: { admin: async () => true } },
      },
    },
  }

  function realAccessEndpoint(user: unknown) {
    const value = createPayloadSupportIdentityEndpoint({
      adminUserCollection: 'usersadminers',
      authCollections: ['usersadminers', 'users'],
      getSecret: () => 'test-secret',
    })
    const request = Object.assign(
      new Request(`https://studio.example/api${POSTHOG_SUPPORT_IDENTITY_PATH}`, {
        headers: { Origin: 'https://studio.example' },
      }),
      { user, payload: stubPayload }
    )
    return (value.handler as (request: Request) => Promise<Response>)(request)
  }

  it('signs a user of the configured admin.user collection', async () => {
    const response = await realAccessEndpoint({ id: '7', collection: 'usersadminers' })
    const body = (await response.json()) as { distinctId: string }

    expect(response.status).toBe(200)
    expect(body.distinctId).toBe('usersadminers:7')
  })

  it('refuses a users-collection user when admin.user is usersadminers, even with its own admin access', async () => {
    const response = await realAccessEndpoint({ id: '7', collection: 'users' })
    const body = await response.text()

    expect(response.status).toBe(403)
    expect(body).not.toContain('distinctId')
  })
})
