import type { BootstrapFlagsConfig } from '@posthog/next'
import type { ReactNode } from 'react'
import type { AdminViewCaptureConfig } from './capture-config'
import { normalizeClientOptions } from './normalize-client-options'
import type { PayloadPostHogOptions } from './types'

type NativeClientOptions = NonNullable<PayloadPostHogOptions['clientOptions']>
type NativeServerOptions = NonNullable<PayloadPostHogOptions['serverOptions']>

export type PostHogAdminProviderProps = {
  children?: ReactNode
  apiKey: string
  clientOptions?: NativeClientOptions
  serverOptions?: NativeServerOptions
  bootstrapFlags?: boolean | BootstrapFlagsConfig
  identityCollection?: string
  adminViewCapture: AdminViewCaptureConfig
  identify: { properties: Record<string, string> } | null
  guestTracking: { enabled: boolean; paths: string[] }
  support: { launcher: 'visible' | 'hidden'; endpoint: string } | null
  user?: Record<string, unknown> | null
}

export function resolveBootstrapFlags(
  bootstrapFlags: boolean | BootstrapFlagsConfig,
  user: Record<string, unknown> | null | undefined,
  properties: Record<string, string> | undefined
): boolean | BootstrapFlagsConfig {
  if (!bootstrapFlags || !user || !properties) return bootstrapFlags
  const personProperties = Object.fromEntries(
    Object.entries(properties)
      .map(([name, field]) => [name, user[field]])
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  )
  return {
    ...(typeof bootstrapFlags === 'object' ? bootstrapFlags : {}),
    personProperties: {
      ...personProperties,
      ...(typeof bootstrapFlags === 'object' ? bootstrapFlags.personProperties : {}),
    },
  }
}

export async function PostHogAdminProvider({
  children,
  apiKey,
  clientOptions,
  serverOptions,
  bootstrapFlags = true,
  identityCollection,
  adminViewCapture,
  identify,
  guestTracking,
  support,
  user,
}: PostHogAdminProviderProps) {
  if (!apiKey) return <>{children}</>
  const [{ PostHogProvider }, { PostHogAdminClientTools }, { PostHogAdminPageView }] =
    await Promise.all([
      import('@posthog/next'),
      import('./posthog-admin-client-tools'),
      import('./posthog-admin-pageview'),
    ])

  // Omitted capture_pageview lets the privacy-aware tracker own pageviews. Explicit values stay with the SDK.
  const nativePageviews = clientOptions?.capture_pageview === undefined

  return (
    <PostHogProvider
      apiKey={apiKey}
      bootstrapFlags={resolveBootstrapFlags(bootstrapFlags, user, identify?.properties)}
      serverOptions={serverOptions}
      clientOptions={normalizeClientOptions(clientOptions, support !== null)}
    >
      <PostHogAdminPageView
        capturePageviews={nativePageviews}
        autocapture={clientOptions?.autocapture ?? true}
      />
      <PostHogAdminClientTools
        identify={identify}
        identityCollection={identityCollection}
        adminViewCapture={adminViewCapture}
        guestTracking={guestTracking}
        sessionReplay={clientOptions?.disable_session_recording !== true}
        support={support}
      />
      {children}
    </PostHogProvider>
  )
}
