import type { BootstrapFlagsConfig } from '@posthog/next'
import type { ReactNode } from 'react'
import type { NativeAuthRoutes } from '../redaction/url-redaction'
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
  identityCollections: string[]
  nativeRoutes: NativeAuthRoutes
  identify: { properties: Record<string, string> } | null
  conversations: { endpoint: string; launcher: 'visible' | 'hidden' } | null
}

/**
 * Mounts the official `@posthog/next` provider once for the Admin tree. Consumers read the
 * native SDK with `usePostHog()`; the plugin adds no second SDK instance.
 */
export async function PostHogAdminProvider({
  children,
  apiKey,
  clientOptions,
  serverOptions,
  bootstrapFlags,
  identityCollections,
  nativeRoutes,
  identify,
  conversations,
}: PostHogAdminProviderProps) {
  if (!apiKey) return <>{children}</>
  const [{ PostHogProvider }, { PostHogAdminClientTools }] = await Promise.all([
    import('@posthog/next'),
    import('./posthog-admin-client-tools'),
  ])

  return (
    <PostHogProvider
      apiKey={apiKey}
      bootstrapFlags={bootstrapFlags}
      serverOptions={serverOptions}
      clientOptions={normalizeClientOptions(clientOptions, conversations !== null)}
    >
      <PostHogAdminClientTools
        identityCollections={identityCollections}
        nativeRoutes={nativeRoutes}
        identify={identify}
        conversations={conversations}
        // Explicit `true` leaves pageviews to posthog-js; explicit `false` sends none.
        capturePageviews={clientOptions?.capture_pageview === undefined}
      />
      {children}
    </PostHogProvider>
  )
}
