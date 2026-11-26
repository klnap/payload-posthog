import 'server-only'

import type { OnRequestErrorOptions } from '@posthog/next'
import type { Instrumentation } from 'next'

type RequestErrorHandler = Instrumentation.onRequestError

let registration: Promise<RequestErrorHandler> | undefined

const noOpRequestErrorHandler: RequestErrorHandler = async () => {}

function getRequestErrorHandler(options?: OnRequestErrorOptions): Promise<RequestErrorHandler> {
  if (!isNodeRuntime()) return Promise.resolve(noOpRequestErrorHandler)
  registration ??= Promise.resolve()
    .then(async () => {
      const { createOnRequestError } = await import('@posthog/next')
      return options === undefined ? createOnRequestError() : createOnRequestError(options)
    })
    .catch(() => noOpRequestErrorHandler)
  return registration
}

function isNodeRuntime(): boolean {
  const runtime = typeof process !== 'undefined' ? process.env.NEXT_RUNTIME : undefined
  return !runtime || runtime === 'nodejs'
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
  try {
    const handler = await getRequestErrorHandler()
    await handler(...args)
  } catch {
    // Error telemetry must not change the host request's error handling.
  }
}
