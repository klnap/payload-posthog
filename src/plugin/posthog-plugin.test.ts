import { describe, expect, it } from 'bun:test'
import type { Config } from 'payload'
import { CONVERSATIONS_IDENTITY_PATH } from '../conversations/identity-endpoint'
import { type PayloadPostHogOptions, postHog } from '../exports/index'

const config = {
  admin: { user: 'users' },
  collections: [{ slug: 'users', auth: true }],
} as Config

const apply = (options: PayloadPostHogOptions, base: Config = config) =>
  postHog(options)(base) as Config

type ProviderEntry = { path: string; clientProps: Record<string, unknown>; serverProps?: unknown }
const providerEntry = (result: Config) =>
  result.admin?.components?.providers?.at(-1) as unknown as ProviderEntry | undefined
const providerProps = (result: Config) => providerEntry(result)?.clientProps ?? {}

// @ts-expect-error Internal extension constructors cannot cross Payload's serialized provider boundary.
const extensionClasses: PayloadPostHogOptions['clientOptions'] = { __extensionClasses: {} }
void extensionClasses

describe('postHog', () => {
  it('exports the lower-camelCase factory only', async () => {
    const exports = await import('../exports/index')
    expect(exports.postHog).toBeTypeOf('function')
    expect(Object.keys(exports).sort()).toEqual(['payloadDistinctId', 'postHog'])
  })

  it('registers nothing when disabled or without an API key', () => {
    expect(apply({ apiKey: '' })).toBe(config)
    expect(apply({ apiKey: 'phc_public', enabled: false })).toBe(config)
  })

  it('minimal configuration registers the provider, identity, and error tracking', () => {
    const result = apply({ apiKey: 'phc_public' })
    expect(providerEntry(result)?.path).toBe('@klnap/payload-posthog/admin#PostHogAdminProvider')
    expect(providerProps(result)).toMatchObject({
      apiKey: 'phc_public',
      identityCollections: ['users'],
      nativeRoutes: { adminRoute: '/admin', resetRoute: '/reset' },
      identify: { properties: { email: 'email' } },
      conversations: null,
    })
    expect(result.hooks?.afterError).toHaveLength(1)
    expect(result.endpoints ?? []).toHaveLength(0)
  })

  it('does not forward bootstrapFlags unless the host sets it', () => {
    expect(providerProps(apply({ apiKey: 'phc_public' })).bootstrapFlags).toBeUndefined()
    expect(
      providerEntry(apply({ apiKey: 'phc_public', bootstrapFlags: false }))?.clientProps
    ).toMatchObject({ bootstrapFlags: false })
  })

  it('merges custom identify properties over the email default', () => {
    const result = apply({
      apiKey: 'phc_public',
      payload: { identify: { properties: { name: 'profile.fullName', roles: 'roles[].name' } } },
    })
    expect(providerProps(result).identify).toEqual({
      properties: { email: 'email', name: 'profile.fullName', roles: 'roles[].name' },
    })
  })

  it('rejects identify mappings that point at credential fields', () => {
    expect(() =>
      apply({ apiKey: 'phc_public', payload: { identify: { properties: { pw: 'password' } } } })
    ).toThrow('credential field')
  })

  it('disables identification with an explicit opt-out', () => {
    expect(
      providerProps(apply({ apiKey: 'phc_public', payload: { identify: { enabled: false } } }))
        .identify
    ).toBeNull()
  })

  it('omits error tracking when disabled', () => {
    expect(
      apply({ apiKey: 'phc_public', payload: { errorTracking: { enabled: false } } }).hooks
        ?.afterError
    ).toBeUndefined()
  })

  it('registers the Conversations endpoint and clientProps only when configured', () => {
    const result = apply({
      apiKey: 'phc_public',
      payload: { conversations: { secret: 'synthetic-secret' } },
    })
    expect(result.endpoints?.[0]?.path).toBe(CONVERSATIONS_IDENTITY_PATH)
    expect(providerProps(result).conversations).toEqual({
      endpoint: '/api/posthog/conversations/identity',
      launcher: 'visible',
    })
  })

  it('never places the Conversations secret in browser-visible props', () => {
    const result = apply({
      apiKey: 'phc_public',
      payload: { conversations: { secret: 'synthetic-secret-value', launcher: 'hidden' } },
    })
    expect(JSON.stringify(providerEntry(result)?.clientProps)).not.toContain('synthetic-secret')
    expect(JSON.stringify(providerEntry(result)?.serverProps)).not.toContain('synthetic-secret')
    expect(providerProps(result).conversations).toEqual({
      endpoint: '/api/posthog/conversations/identity',
      launcher: 'hidden',
    })
  })

  it('honors routes.api for the Conversations endpoint URL', () => {
    const result = apply({ apiKey: 'phc_public', payload: { conversations: { secret: 's' } } }, {
      ...config,
      routes: { api: '/custom-api' },
    } as Config)
    expect(providerProps(result).conversations).toEqual({
      endpoint: '/custom-api/posthog/conversations/identity',
      launcher: 'visible',
    })
  })

  it('requires an authenticated collection and a secret for Conversations', () => {
    expect(() =>
      apply({ apiKey: 'phc_public', payload: { conversations: { secret: 's' } } }, {
        collections: [{ slug: 'pages' }],
      } as unknown as Config)
    ).toThrow('requires an authenticated Payload collection')
    expect(() =>
      apply({ apiKey: 'phc_public', payload: { conversations: { secret: '' } } })
    ).toThrow('non-empty string')
  })

  it('requires identification for Conversations because both must verify the same ID', () => {
    expect(() =>
      apply({
        apiKey: 'phc_public',
        payload: { identify: { enabled: false }, conversations: { secret: 's' } },
      })
    ).toThrow('requires payload.identify')
  })

  it('rejects an existing GET endpoint at the Conversations path', () => {
    const base = {
      ...config,
      endpoints: [
        { path: '/posthog/conversations/identity', method: 'get', handler: () => new Response() },
      ],
    } as Config
    expect(() =>
      apply({ apiKey: 'phc_public', payload: { conversations: { secret: 's' } } }, base)
    ).toThrow('conflicts with an existing Payload endpoint')
  })

  it('rejects function-valued client and server options before they reach the provider', () => {
    expect(() =>
      apply({
        apiKey: 'phc_public',
        clientOptions: { loaded: () => undefined } as never,
      })
    ).toThrow('clientOptions.loaded must be serializable')
    expect(() =>
      apply({ apiKey: 'phc_public', serverOptions: { beforeSend: () => null } as never })
    ).toThrow('serverOptions.beforeSend must be serializable')
  })

  describe('debug mode', () => {
    const afterMeHooks = (result: Config) => result.collections?.[0]?.hooks?.afterMe ?? []
    const withSilentLog = <T>(run: () => T): T => {
      const log = console.log
      const table = console.table
      console.log = () => {}
      console.table = () => {}
      try {
        return run()
      } finally {
        console.log = log
        console.table = table
      }
    }

    it('keyless without debug registers nothing (unchanged behavior)', () => {
      const base = { ...config, collections: [{ slug: 'users', auth: true }] } as Config
      expect(apply({ apiKey: undefined } as never, base)).toBe(base)
    })

    it('keyless debug registers identity diagnostics only: no provider, no error capture, no endpoint', () => {
      const result = withSilentLog(() =>
        apply({ debug: true, payload: { conversations: { secret: 's' } } } as never)
      )
      expect(result.admin?.components?.providers).toBeUndefined()
      expect(result.hooks?.afterError).toBeUndefined()
      expect(result.endpoints ?? []).toHaveLength(0)
      expect(afterMeHooks(result)).toHaveLength(1)
    })

    it('keyed debug adds the diagnostics next to the normal integration', () => {
      const result = withSilentLog(() => apply({ apiKey: 'phc_public', debug: true }))
      expect(providerEntry(result)?.path).toBe('@klnap/payload-posthog/admin#PostHogAdminProvider')
      expect(result.hooks?.afterError).toHaveLength(1)
      expect(afterMeHooks(result)).toHaveLength(1)
    })

    it('appends diagnostics without replacing existing afterMe hooks', () => {
      const existing = () => undefined
      const base = {
        ...config,
        collections: [{ slug: 'users', auth: true, fields: [], hooks: { afterMe: [existing] } }],
      } as Config
      const result = withSilentLog(() => apply({ debug: true }, base))
      expect(afterMeHooks(result)[0]).toBe(existing)
      expect(afterMeHooks(result)).toHaveLength(2)
    })

    it('debug disabled by default: no diagnostics hooks are added', () => {
      const result = apply({ apiKey: 'phc_public' })
      expect(afterMeHooks(result)).toHaveLength(0)
    })

    it('enabled: false with debug registers nothing', () => {
      const result = withSilentLog(() =>
        apply({ apiKey: undefined, enabled: false, debug: true } as never)
      )
      expect(result.admin?.components?.providers).toBeUndefined()
      expect(afterMeHooks(result)).toHaveLength(0)
    })
  })
})
