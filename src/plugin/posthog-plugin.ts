import type { CollectionConfig, Config, Plugin } from 'payload'
import {
  CONVERSATIONS_IDENTITY_PATH,
  conversationsIdentityURL,
  createConversationsIdentityEndpoint,
} from '../conversations/identity-endpoint'
import {
  createIdentityDiagnosticsHook,
  logConfiguredMappings,
  logConversationsConfig,
  logPluginMode,
} from '../diagnostics/debug'
import { isCredentialPath } from '../identity/person-properties'
import { assertSerializable } from './assert-serializable'
import { createPayloadAfterErrorHook } from './payload-error-tracking'
import type { PayloadPostHogOptions } from './types'

const PROVIDER = '@klnap/payload-posthog/admin#PostHogAdminProvider'

/** Default person property mapping. Identity mapping merges over it. */
const DEFAULT_IDENTIFY_PROPERTIES = { email: 'email' } as const

/** Adds native PostHog analytics, Session Replay, and error tracking to Payload Admin. */
export function postHog(options: PayloadPostHogOptions): Plugin {
  return (config: Config): Config => {
    const {
      enabled = true,
      apiKey,
      debug = false,
      clientOptions,
      serverOptions,
      bootstrapFlags,
      payload = {},
    } = options
    if (!enabled) {
      if (debug) logPluginMode('disabled')
      return config
    }
    if (!apiKey && !debug) return config
    assertSerializable(clientOptions, 'clientOptions')
    assertSerializable(serverOptions, 'serverOptions')

    const authCollections =
      config.collections
        ?.filter((collection) => Boolean(collection.auth))
        .map(({ slug }) => slug) ?? []
    const identityCollection = config.admin?.user ?? authCollections[0]

    const identifyEnabled = payload.identify?.enabled ?? true
    const identifyProperties = { ...DEFAULT_IDENTIFY_PROPERTIES, ...payload.identify?.properties }
    for (const [name, path] of Object.entries(identifyProperties)) {
      if (isCredentialPath(path)) {
        throw new Error(`PostHog: identify property "${name}" maps to a credential field.`)
      }
    }

    const conversations = payload.conversations
    if (conversations) {
      // Conversations verifies the same distinct ID that analytics identifies, so identity must run.
      if (!identifyEnabled) {
        throw new Error('PostHog: Conversations requires payload.identify to be enabled.')
      }
      if (authCollections.length === 0) {
        throw new Error('PostHog: Conversations requires an authenticated Payload collection.')
      }
      if (typeof conversations.secret !== 'string' || conversations.secret.length === 0) {
        throw new Error('PostHog: payload.conversations.secret must be a non-empty string.')
      }
      if (
        config.endpoints?.some(
          (endpoint) =>
            endpoint.method === 'get' &&
            `/${endpoint.path.split('/').filter(Boolean).join('/')}` === CONVERSATIONS_IDENTITY_PATH
        )
      ) {
        throw new Error(
          `PostHog: GET ${CONVERSATIONS_IDENTITY_PATH} conflicts with an existing Payload endpoint.`
        )
      }
    }

    const identityDiagnostics: Record<string, string> | null =
      debug && identifyEnabled ? identifyProperties : null

    if (!apiKey) {
      // Keyless debug: identity diagnostics only. No provider, no error capture, no endpoint.
      logPluginMode('keyless')
      return withIdentityDiagnostics(config, identityDiagnostics, 'Not transmitted: keyless mode.')
    }
    if (debug) {
      logPluginMode('enabled')
      if (identityDiagnostics) logConfiguredMappings(identityDiagnostics)
      if (conversations) logConversationsConfig(conversations.launcher ?? 'visible')
    }

    // Native Payload credential paths are built from these routes (see docs/specification.md).
    const nativeRoutes = {
      adminRoute: config.routes?.admin ?? '/admin',
      resetRoute: config.admin?.routes?.reset ?? '/reset',
    }

    const errorTracking = payload.errorTracking?.enabled ?? true
    const configWithErrorTracking: Config = errorTracking
      ? {
          ...config,
          hooks: {
            ...config.hooks,
            afterError: [
              ...(config.hooks?.afterError ?? []),
              createPayloadAfterErrorHook({
                apiKey,
                serverOptions,
                authCollection: identityCollection,
                shouldCapture: payload.errorTracking?.shouldCapture,
              }),
            ],
          },
        }
      : config

    const withDiagnostics = debug
      ? withIdentityDiagnostics(
          configWithErrorTracking,
          identityDiagnostics ?? null,
          'Identified in the browser when consent allows.'
        )
      : configWithErrorTracking

    return {
      ...withDiagnostics,
      ...(conversations
        ? {
            endpoints: [
              createConversationsIdentityEndpoint({
                authCollections,
                getSecret: () => conversations.secret,
                debug,
              }),
              ...(config.endpoints ?? []),
            ],
          }
        : {}),
      admin: {
        ...config.admin,
        components: {
          ...config.admin?.components,
          providers: [
            ...(config.admin?.components?.providers ?? []),
            {
              path: PROVIDER,
              clientProps: {
                apiKey,
                nativeRoutes,
                clientOptions,
                bootstrapFlags,
                identityCollections: authCollections,
                identify: identifyEnabled ? { properties: identifyProperties } : null,
                conversations: conversations
                  ? {
                      endpoint: conversationsIdentityURL(config.routes?.api),
                      launcher: conversations.launcher ?? 'visible',
                    }
                  : null,
              },
              serverProps: {
                serverOptions,
              },
            },
          ],
        },
      },
    }
  }
}

/** Adds the server-side identity diagnostics to every auth collection's `me` response (debug only). */
function withIdentityDiagnostics(
  config: Config,
  mapping: Readonly<Record<string, string>> | null,
  transmitted: string
): Config {
  type AfterMeHook = NonNullable<NonNullable<CollectionConfig['hooks']>['afterMe']>[number]
  const hook = createIdentityDiagnosticsHook(mapping, transmitted) as AfterMeHook
  return {
    ...config,
    collections: config.collections?.map((collection) =>
      collection.auth
        ? {
            ...collection,
            hooks: { ...collection.hooks, afterMe: [...(collection.hooks?.afterMe ?? []), hook] },
          }
        : collection
    ),
  }
}
