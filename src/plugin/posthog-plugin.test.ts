import { describe, expect, it } from 'bun:test'
import type { Config } from 'payload'
import { type PayloadPostHogOptions, PostHog } from '../exports/index'
import { POSTHOG_SUPPORT_IDENTITY_PATH } from '../support/payload-identity-endpoint'

const config = {
  admin: { user: 'users' },
  collections: [{ slug: 'users', auth: true }],
} as Config

const apply = (options: PayloadPostHogOptions, base: Config = config) =>
  PostHog(options)(base) as Config

const providerEntry = (result: Config) => result.admin?.components?.providers?.at(-1)

describe('PostHog', () => {
  it('registers nothing without an API key', () => {
    expect(apply({ apiKey: '' })).toBe(config)
  })

  it('registers no provider when every known feature is disabled', () => {
    const result = apply({
      apiKey: 'phc_public',
      bootstrapFlags: false,
      clientOptions: {
        autocapture: false,
        capture_exceptions: false,
        capture_pageview: false,
        disable_conversations: true,
        disable_session_recording: true,
      },
      payload: {
        identify: { enabled: false },
        guestTracking: { enabled: false },
        capture: {
          collections: { defaults: false },
          globals: { defaults: false },
        },
      },
    })

    expect(result).toBe(config)
  })

  it('validates the typed capture configuration at plugin setup', () => {
    expect(() =>
      apply({
        apiKey: 'phc_public',
        payload: {
          capture: {
            collections: {
              defaults: { events: { read: 'not snake case' } },
            },
          },
        },
      })
    ).toThrow('payload.capture.collections.defaults.events.read')
  })

  it('forwards resolved read-view configuration and rejects callback values', () => {
    expect(
      providerEntry(
        apply({
          apiKey: 'phc_public',
          payload: {
            capture: {
              prefix: 'cms_',
              collections: {
                overrides: {
                  users: {
                    events: { read: { name: 'post_opened', properties: { area: 'cms' } } },
                  },
                },
              },
            },
          },
        })
      )
    ).toMatchObject({
      clientProps: {
        adminViewCapture: {
          collections: {
            users: {
              listRead: { name: 'cms_collection_read', enabled: true },
              read: {
                name: 'post_opened',
                enabled: true,
                properties: { area: 'cms' },
              },
            },
          },
        },
      },
    })

    expect(() =>
      apply({
        apiKey: 'phc_public',
        payload: {
          capture: {
            collections: {
              defaults: {
                events: {
                  read: { properties: { callback: () => 'not serializable' } },
                },
              },
            },
          },
        },
      })
    ).toThrow('payload.capture.collections.users.read.properties.callback must be serializable')
  })

  it('registers one native provider with native options passed through unchanged', () => {
    const clientOptions = {
      api_host: 'https://events.example.test',
      ui_host: 'https://eu.posthog.com',
      autocapture: true,
      session_recording: { maskInputOptions: { password: true } },
    }
    const result = apply({ apiKey: 'phc_public', clientOptions })

    expect(result.admin?.components?.providers).toHaveLength(1)
    expect(providerEntry(result)).toMatchObject({
      path: '@klnap/payload-posthog/admin#PostHogAdminProvider',
      clientProps: { apiKey: 'phc_public', clientOptions, identityCollection: 'users' },
      serverProps: { bootstrapFlags: true },
    })
  })

  it('passes serverOptions and explicit bootstrapFlags to the server props only', () => {
    const result = apply({
      apiKey: 'phc_public',
      serverOptions: { host: 'https://ingest.example.test' },
      bootstrapFlags: false,
    })

    expect(providerEntry(result)).toMatchObject({
      clientProps: { clientOptions: undefined },
      serverProps: {
        serverOptions: { host: 'https://ingest.example.test' },
        bootstrapFlags: false,
      },
    })
  })

  it('rejects function-valued options, including nested ones, before they reach the client', () => {
    expect(() =>
      apply({
        apiKey: 'phc_public',
        clientOptions: { before_send: () => null } as PayloadPostHogOptions['clientOptions'],
      })
    ).toThrow('clientOptions.before_send must be serializable')
    expect(() =>
      apply({
        apiKey: 'phc_public',
        clientOptions: {
          session_recording: { maskTextFn: () => '' },
        } as unknown as PayloadPostHogOptions['clientOptions'],
      })
    ).toThrow('clientOptions.session_recording.maskTextFn must be serializable')
    expect(() =>
      apply({
        apiKey: 'phc_public',
        serverOptions: { fetch: () => Promise.reject(new Error('unused')) } as never,
      })
    ).toThrow('serverOptions.fetch must be serializable')
  })

  it('passes guest tracking options through with defaults on', () => {
    expect(providerEntry(apply({ apiKey: 'phc_public' }))).toMatchObject({
      clientProps: { guestTracking: { enabled: true, paths: [] } },
    })
    expect(
      providerEntry(
        apply({
          apiKey: 'phc_public',
          payload: { guestTracking: { enabled: false, paths: ['/accept-invitation'] } },
        })
      )
    ).toMatchObject({
      clientProps: { guestTracking: { enabled: false, paths: ['/accept-invitation'] } },
    })
  })

  it('keeps Support off unless payload.support is configured', () => {
    const result = apply({ apiKey: 'phc_public' })
    expect(result.endpoints).toBeUndefined()
    expect(providerEntry(result)).toMatchObject({ clientProps: { support: null } })
  })

  it('enables Support and keeps the identity secret out of client props', () => {
    const result = apply({
      apiKey: 'phc_public',
      payload: { support: { identitySecret: 'support-secret' } },
    })

    expect(result.endpoints?.[0]).toMatchObject({
      path: POSTHOG_SUPPORT_IDENTITY_PATH,
      method: 'get',
    })
    expect(providerEntry(result)).toMatchObject({
      clientProps: { support: { endpoint: '/api/posthog/support/identity' } },
    })
    expect(JSON.stringify(providerEntry(result))).not.toContain('support-secret')
  })

  it('requires an authenticated collection when Support is enabled', () => {
    expect(() =>
      apply({ apiKey: 'phc_public', payload: { support: { identitySecret: 'support-secret' } } }, {
        collections: [],
      } as unknown as Config)
    ).toThrow('Support requires an authenticated Payload collection')
  })

  it('rejects a conflicting GET identity endpoint', () => {
    expect(() =>
      apply({ apiKey: 'phc_public', payload: { support: { identitySecret: 'secret' } } }, {
        ...config,
        endpoints: [{ path: POSTHOG_SUPPORT_IDENTITY_PATH, method: 'get', handler: () => null }],
      } as unknown as Config)
    ).toThrow('conflicts with an existing Payload endpoint')
  })
})
