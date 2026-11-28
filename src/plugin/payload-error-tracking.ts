import type { AfterErrorHook } from 'payload'
import type { PostHogOptions } from 'posthog-node'
import { payloadDistinctId } from '../identity/payload-distinct-id'
import { withSanitizedBeforeSend } from './error-privacy'

export type PayloadErrorCaptureContext = {
  error: Error
  collection?: string
  status?: number
}

type PayloadErrorTrackingOptions = {
  apiKey: string
  serverOptions?: Partial<PostHogOptions>
  /** Admin user collection, used when the request carries no authenticated collection. */
  authCollection?: string
  shouldCapture?: (context: PayloadErrorCaptureContext) => boolean | Promise<boolean>
}

export function isExpectedPayloadError(error: Error): boolean {
  const status = (error as Error & { status?: unknown }).status
  return typeof status === 'number' && status >= 400 && status < 500
}

export function createPayloadAfterErrorHook({
  apiKey,
  serverOptions,
  authCollection,
  shouldCapture,
}: PayloadErrorTrackingOptions): AfterErrorHook {
  let clientPromise: Promise<import('posthog-node').PostHog> | undefined

  return async ({ collection, error, req }) => {
    try {
      const status = (error as Error & { status?: unknown }).status
      if (
        isExpectedPayloadError(error) ||
        (shouldCapture &&
          !(await shouldCapture({
            error,
            collection: collection?.slug,
            status: typeof status === 'number' ? status : undefined,
          })))
      ) {
        return
      }

      clientPromise ??= import('posthog-node')
        .then(({ PostHog }) => {
          return new PostHog(apiKey, {
            ...withSanitizedBeforeSend(serverOptions, 'beforeSend'),
            fetchRetryCount: serverOptions?.fetchRetryCount ?? 0,
            requestTimeout: serverOptions?.requestTimeout ?? 2_000,
          })
        })
        // A failed import must not disable capture for the rest of the process.
        .catch((error: unknown) => {
          clientPromise = undefined
          throw error
        })
      const client = await clientPromise
      // Prefer the collection the request authenticated against; fall back to the Admin user collection.
      const userId = req.user?.id
      const userCollection =
        (req.user as { collection?: string } | null)?.collection ?? authCollection
      const distinctId =
        userCollection && (typeof userId === 'string' || typeof userId === 'number')
          ? payloadDistinctId(userCollection, userId)
          : undefined
      // Payload awaits afterError hooks before responding. Do not hold the original error response
      // for ingestion; failures are swallowed below.
      void client
        .captureExceptionImmediate(error, {
          distinctId,
          properties: {
            source: 'payload',
            ...(collection?.slug ? { collection: collection.slug } : {}),
            ...(typeof status === 'number' ? { status_code: status } : {}),
          },
        })
        .catch(() => {})
    } catch {
      // Error telemetry must not change the host error response.
    }
  }
}
