import type { BootstrapFlagsConfig, PostHogProviderProps } from '@posthog/next'
import type { PostHogOptions } from 'posthog-node'
import type { PayloadErrorCaptureContext } from './payload-error-tracking'

type NativeClientOptions = NonNullable<PostHogProviderProps['clientOptions']>

/**
 * Removes function-valued keys. Options cross the Payload server-to-client boundary as props,
 * so callbacks cannot be forwarded and are rejected at config time instead.
 */
type SerializableOptions<T> = {
  [K in keyof T as Extract<T[K], (...args: never[]) => unknown> extends never ? K : never]: T[K]
}

export type PayloadPostHogOptions = {
  /**
   * PostHog project API key, public by design (the value of `NEXT_PUBLIC_POSTHOG_KEY`).
   * Required unless `debug` is true, which runs keyless diagnostics only.
   */
  apiKey?: string
  /**
   * Terminal diagnostics from the Payload server: configuration, identity resolution, mapped
   * properties, and Conversations status. Keyless when no `apiKey` is set. Defaults to false.
   * Output may contain personal data. Secrets and signatures are never printed.
   */
  debug?: boolean
  /** Set to false to register nothing. Defaults to true. */
  enabled?: boolean
  /** Native posthog-js options, merged over the plugin defaults. Must be serializable. */
  clientOptions?: SerializableOptions<Omit<NativeClientOptions, '__extensionClasses'>>
  /** Native posthog-node options for server-side capture. Server-only. */
  serverOptions?: SerializableOptions<Partial<PostHogOptions>>
  /**
   * Native server-side feature flag bootstrap. Omit it to evaluate flags in the browser.
   * Setting it makes Admin routes request-time rendered.
   */
  bootstrapFlags?: boolean | BootstrapFlagsConfig
  payload?: {
    /** Identifies the authenticated Admin user. Defaults to enabled. */
    identify?: {
      enabled?: boolean
      /**
       * PostHog person properties resolved from the Payload user. Keys are PostHog property
       * names; values are dotted field paths such as `profile.fullName`, `roles`, or `roles[].name`.
       * `email` is mapped by default.
       */
      properties?: Record<string, string>
    }
    /** Captures unexpected Payload REST errors on the server. Defaults to enabled. */
    errorTracking?: {
      enabled?: boolean
      /** Server-only filter applied after expected HTTP 4xx errors are suppressed. */
      shouldCapture?: (context: PayloadErrorCaptureContext) => boolean | Promise<boolean>
    }
    /** Authenticated PostHog Conversations. Omit to keep Conversations disabled. */
    conversations?: {
      /** Conversations identity verification secret. Server-only; never sent to the browser. */
      secret: string
      /** `visible` (default) renders the native launcher. `hidden` leaves opening to your UI. */
      launcher?: 'visible' | 'hidden'
    }
  }
}
