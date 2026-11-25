import type { PostHogProviderProps } from '@posthog/next'
import type { PostHogOptions } from 'posthog-node'

type NativeOptions = Pick<
  PostHogProviderProps,
  'clientOptions' | 'serverOptions' | 'bootstrapFlags'
>

/**
 * Removes function-valued keys. Options cross the Payload server-to-client boundary as props,
 * so callbacks cannot be forwarded and are rejected at config time instead.
 */
type SerializableOptions<T> = {
  [K in keyof T as Extract<T[K], (...args: never[]) => unknown> extends never ? K : never]: T[K]
}

export type PayloadPostHogOptions = {
  /** Set to false to register nothing. Defaults to true. */
  enabled?: boolean
  apiKey: string
  clientOptions?: SerializableOptions<NonNullable<NativeOptions['clientOptions']>>
  serverOptions?: SerializableOptions<Partial<PostHogOptions>>
  /** Forwarded to `PostHogProvider`. Defaults to `true`. */
  bootstrapFlags?: NativeOptions['bootstrapFlags']
  payload?: {
    identify?: {
      /** Identify authenticated Payload users. Defaults to true. */
      enabled?: boolean
      /** Maps PostHog person property names to Payload user field names. Email is always mapped. */
      properties?: Record<string, string>
    }
    guestTracking?: {
      /**
       * Guest tracking on guest routes: Payload's public auth routes plus `paths`. Set false to turn off
       * authentication lifecycle events and Session Replay for guests. Authenticated users are always tracked.
       * Defaults to true.
       */
      enabled?: boolean
      /** Extra public Admin paths treated as guest routes, relative to the Admin route. */
      paths?: string[]
    }
    /** Enables authenticated PostHog Support. Omit to keep Support disabled. */
    support?: {
      launcher?: 'visible' | 'hidden'
      /** PostHog Support identity verification secret. Keep it server-only. */
      identitySecret: string
    }
  }
}
