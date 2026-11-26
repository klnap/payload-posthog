import type { AfterErrorHook } from 'payload'
import type { PostHogOptions } from 'posthog-node'
import { payloadDistinctId } from '../identity/payload-distinct-id'
import { sanitizeExceptionEvent } from './error-privacy'

export type PayloadErrorCaptureContext = {
  error: Error
  collection?: string
  status?: number
}

export type PayloadErrorTrackingOptions = {
  apiKey: string
  serverOptions?: Partial<PostHogOptions>
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

      clientPromise ??= import('posthog-node').then(({ PostHog }) => {
        const beforeSend = serverOptions?.before_send
        const beforeSendHandlers = beforeSend
          ? Array.isArray(beforeSend)
            ? beforeSend
            : [beforeSend]
          : []
        return new PostHog(apiKey, {
          ...serverOptions,
          fetchRetryCount: serverOptions?.fetchRetryCount ?? 0,
          requestTimeout: serverOptions?.requestTimeout ?? 2_000,
          before_send: [...beforeSendHandlers, (event) => sanitizeExceptionEvent(event)],
        })
      })
      const client = await clientPromise
      const userId = req.user?.id
      const distinctId =
        authCollection && (typeof userId === 'string' || typeof userId === 'number')
          ? payloadDistinctId(authCollection, userId)
          : undefined
      await client.captureExceptionImmediate(error, distinctId, {
        source: 'payload',
        ...(collection?.slug ? { collection: collection.slug } : {}),
        ...(typeof status === 'number' ? { status_code: status } : {}),
      })
    } catch {
      // Error telemetry must not change the host error response.
    }
  }
}
