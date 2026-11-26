import type { Config, Plugin } from 'payload'
import {
  createPayloadSupportIdentityEndpoint,
  POSTHOG_SUPPORT_IDENTITY_PATH,
  postHogSupportIdentityURL,
} from '../support/payload-identity-endpoint'
import { assertSerializable } from './assert-serializable'
import { normalizeCaptureConfiguration } from './capture-config'
import type { PayloadPostHogOptions } from './types'

const PROVIDER = '@klnap/payload-posthog/admin#PostHogAdminProvider'

export function PostHog(options: PayloadPostHogOptions): Plugin {
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
    const hasPayloadFeatures =
      (payload.identify?.enabled ?? true) ||
      (payload.guestTracking?.enabled ?? true) ||
      payload.support !== undefined
    const hasNativeFeatures =
      clientOptions?.capture_pageview !== false ||
      clientOptions?.autocapture !== false ||
      clientOptions?.capture_exceptions !== false ||
      clientOptions?.disable_session_recording !== true ||
      clientOptions?.disable_conversations === false ||
      bootstrapFlags !== false
    if (!hasPayloadFeatures && !hasNativeFeatures) return config

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
      ...config,
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
