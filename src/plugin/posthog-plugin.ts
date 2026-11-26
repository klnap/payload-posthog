import type { Config, Plugin } from 'payload'
import {
  createPayloadSupportIdentityEndpoint,
  POSTHOG_SUPPORT_IDENTITY_PATH,
  postHogSupportIdentityURL,
} from '../support/payload-identity-endpoint'
import { assertSerializable } from './assert-serializable'
import { normalizeCaptureConfiguration, resolveAdminViewCapture } from './capture-config'
import { createPayloadAfterErrorHook } from './payload-error-tracking'
import type { PayloadPostHogOptions } from './types'

const PROVIDER = '@klnap/payload-posthog/admin#PostHogAdminProvider'

export function postHog(options: PayloadPostHogOptions): Plugin {
  return (config: Config): Config => {
    const {
      enabled = true,
      apiKey,
      clientOptions,
      serverOptions,
      bootstrapFlags = true,
      payload = {},
    } = options
    if (!enabled || !apiKey) return config
    assertSerializable(clientOptions, 'clientOptions')
    normalizeCaptureConfiguration(payload.capture)
    assertSerializable(serverOptions, 'serverOptions')
    const collectionSlugs = config.collections?.map(({ slug }) => slug) ?? []
    const globalSlugs = config.globals?.map(({ slug }) => slug) ?? []
    const adminViewCapture = resolveAdminViewCapture(payload.capture, collectionSlugs, globalSlugs)
    assertSerializable(adminViewCapture, 'payload.capture')
    const errorTrackingEnabled = payload.errorTracking?.enabled ?? true
    const configWithErrorTracking = errorTrackingEnabled
      ? {
          ...config,
          hooks: {
            ...config.hooks,
            afterError: [
              ...(config.hooks?.afterError ?? []),
              createPayloadAfterErrorHook({
                apiKey,
                serverOptions,
                authCollection: authCollectionsFrom(config.collections),
                shouldCapture: payload.errorTracking?.shouldCapture,
              }),
            ],
          },
        }
      : config
    const hasPayloadFeatures =
      (payload.identify?.enabled ?? true) ||
      (payload.guestTracking?.enabled ?? true) ||
      payload.support !== undefined ||
      [
        ...Object.values(adminViewCapture.collections),
        ...Object.values(adminViewCapture.globals),
      ].some((resource) => Object.values(resource).some((event) => event.enabled))
    const hasNativeFeatures =
      clientOptions?.capture_pageview !== false ||
      clientOptions?.autocapture !== false ||
      clientOptions?.capture_exceptions !== false ||
      clientOptions?.disable_session_recording !== true ||
      clientOptions?.disable_conversations === false ||
      bootstrapFlags !== false
    if (!hasPayloadFeatures && !hasNativeFeatures) return configWithErrorTracking

    const authCollections =
      config.collections
        ?.filter((collection) => Boolean(collection.auth))
        .map(({ slug }) => slug) ?? []
    const identityCollection = config.admin?.user ?? authCollections[0]
    const { support } = payload
    if (support) {
      if (authCollections.length === 0) {
        throw new Error('PostHog: Support requires an authenticated Payload collection.')
      }
      if (
        config.endpoints?.some(
          (endpoint) =>
            endpoint.method === 'get' &&
            `/${endpoint.path.split('/').filter(Boolean).join('/')}` ===
              POSTHOG_SUPPORT_IDENTITY_PATH
        )
      ) {
        throw new Error(
          `PostHog: GET ${POSTHOG_SUPPORT_IDENTITY_PATH} conflicts with an existing Payload endpoint.`
        )
      }
    }

    const providers = config.admin?.components?.providers ?? []
    return {
      ...configWithErrorTracking,
      ...(support
        ? {
            endpoints: [
              createPayloadSupportIdentityEndpoint({
                adminUserCollection: identityCollection,
                authCollections,
                getSecret: () => support.identitySecret,
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
            ...providers,
            {
              path: PROVIDER,
              clientProps: {
                apiKey,
                clientOptions,
                identityCollection,
                adminViewCapture,
                identify:
                  (payload.identify?.enabled ?? true)
                    ? { properties: { email: 'email', ...payload.identify?.properties } }
                    : null,
                guestTracking: {
                  enabled: payload.guestTracking?.enabled ?? true,
                  paths: payload.guestTracking?.paths ?? [],
                },
                support: support
                  ? {
                      launcher: support.launcher ?? 'visible',
                      endpoint: postHogSupportIdentityURL(config.routes?.api),
                    }
                  : null,
              },
              serverProps: {
                serverOptions,
                bootstrapFlags,
              },
            },
          ],
        },
      },
    }
  }
}

function authCollectionsFrom(collections: Config['collections']): string | undefined {
  const authCollections = collections?.filter(({ auth }) => Boolean(auth)) ?? []
  return authCollections.length === 1 ? authCollections[0]?.slug : undefined
}
