import { describe, expect, it } from 'bun:test'
import { resolveBootstrapFlags } from './posthog-admin-provider'

describe('resolveBootstrapFlags', () => {
  it('uses only configured authenticated user fields and preserves explicit options', () => {
    expect(
      resolveBootstrapFlags(
        { flags: ['flag'], personProperties: { email: 'override@example.test' } },
        { email: 'user@example.test', fullName: 'User', secret: 'private' },
        { email: 'email', name: 'fullName' }
      )
    ).toEqual({
      flags: ['flag'],
      personProperties: { email: 'override@example.test', name: 'User' },
    })
  })

  it('does not enable bootstrap or expose fields when not configured', () => {
    expect(resolveBootstrapFlags(false, { email: 'user@example.test' }, { email: 'email' })).toBe(
      false
    )
    expect(resolveBootstrapFlags(true, { email: 'user@example.test' }, undefined)).toBe(true)
  })
})
