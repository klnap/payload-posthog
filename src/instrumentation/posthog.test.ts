import { describe, expect, it, mock } from 'bun:test'
import type { Instrumentation } from 'next'
import type { ReactNode } from 'react'

const handlers: ReturnType<typeof mock>[] = []
const mockPageView = () => null
const mockProvider = ({ children }: { children: ReactNode }) => children
const createOnRequestError = mock(() => {
  const handler = mock(async () => {})
  handlers.push(handler)
  return handler
})
mock.module('server-only', () => ({}))
mock.module('@posthog/next', () => ({
  createOnRequestError,
  PostHogPageView: mockPageView,
  PostHogProvider: mockProvider,
  usePostHog: () => null,
}))

const loadInstrumentation = (instance: string) => import(`./posthog.ts?${instance}`)

describe('PostHog instrumentation', () => {
  it('passes explicit options to the native handler and reuses it', async () => {
    const { capturePostHogError, registerPostHog } = await loadInstrumentation('explicit')
    const options = {
      apiKey: 'sensitive-project-key',
      host: 'https://analytics.example.test',
      disabled: true,
    }
    const args = [
      new Error('request failed'),
      { path: '/api/test', method: 'GET', headers: {} },
      {
        routerKind: 'App Router',
        routePath: '/api/test',
        routeType: 'route',
        revalidateReason: undefined,
      },
    ] as const

    await Promise.all([
      registerPostHog(options),
      registerPostHog(options),
      capturePostHogError(...args),
    ])

    expect(createOnRequestError).toHaveBeenCalledTimes(1)
    expect(createOnRequestError).toHaveBeenCalledWith(options)
    expect(handlers[0]).toHaveBeenCalledWith(...args)
  })

  it('uses native environment defaults when called without options', async () => {
    const { registerPostHog } = await loadInstrumentation('defaults')

    await registerPostHog()

    expect(createOnRequestError).toHaveBeenCalledTimes(2)
    expect(createOnRequestError.mock.calls[1]).toEqual([])
  })

  it('matches Next.js Instrumentation.onRequestError', async () => {
    const { capturePostHogError } = await loadInstrumentation('typecheck')
    const nextRequestErrorHandler: Instrumentation.onRequestError = capturePostHogError

    expect(nextRequestErrorHandler).toBe(capturePostHogError)
  })
})
