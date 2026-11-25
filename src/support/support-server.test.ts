import { describe, expect, it } from 'bun:test'
import { createHmac } from 'node:crypto'
import { createSupportIdentityHandler, signSupportDistinctId } from './server'

describe('PostHog Support identity server helpers', () => {
  it('signs the server-resolved distinct ID and disables caching', async () => {
    const handler = createSupportIdentityHandler({
      resolveDistinctId: async () => 'users:42',
      secret: 'test-secret',
    })
    const response = await handler()
    const body = (await response.json()) as { distinctId: string; hash: string }

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toContain('no-store')
    expect(body).toEqual({
      distinctId: 'users:42',
      hash: createHmac('sha256', 'test-secret').update('users:42').digest('hex'),
    })
  })

  it('does not return a hash for anonymous requests or missing secrets', async () => {
    const anonymous = await createSupportIdentityHandler({
      resolveDistinctId: async () => null,
      secret: 'test-secret',
    })()
    const unconfigured = await createSupportIdentityHandler({
      resolveDistinctId: async () => 'users:42',
      secret: undefined,
    })()

    expect(anonymous.status).toBe(401)
    expect(await anonymous.text()).not.toContain('hash')
    expect(unconfigured.status).toBe(503)
    expect(await unconfigured.text()).not.toContain('hash')
    expect(signSupportDistinctId('users:42', 'test-secret')).toHaveLength(64)
  })
})
