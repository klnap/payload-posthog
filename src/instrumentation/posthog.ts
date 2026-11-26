import 'server-only'

import type { OnRequestErrorOptions } from '@posthog/next'
import { createOnRequestError } from '@posthog/next'
import type { Instrumentation } from 'next'

type RequestErrorHandler = Instrumentation.onRequestError

let registration: Promise<RequestErrorHandler> | undefined

function getRequestErrorHandler(options?: OnRequestErrorOptions): Promise<RequestErrorHandler> {
  registration ??= Promise.resolve().then(() =>
    options === undefined ? createOnRequestError() : createOnRequestError(options)
  )
  return registration
}

/**
 * Prepare the native PostHog request-error handler once per server instance.
 * It reads NEXT_PUBLIC_POSTHOG_KEY and NEXT_PUBLIC_POSTHOG_HOST; Payload plugin
 * options are not shared with Next.js instrumentation.
 */
export async function registerPostHog(options?: OnRequestErrorOptions): Promise<void> {
  await getRequestErrorHandler(options)
}

/** Compatible with Next.js Instrumentation.onRequestError. */
export async function capturePostHogError(
  ...args: Parameters<Instrumentation.onRequestError>
): Promise<void> {
  const handler = await getRequestErrorHandler()
  await handler(...args)
}
