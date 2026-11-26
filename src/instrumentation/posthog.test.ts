import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import type { Instrumentation } from 'next'
import type { ReactNode } from 'react'

const handlers: ReturnType<typeof mock>[] = []
const originalRuntime = process.env.NEXT_RUNTIME
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

beforeEach(() => {
  process.env.NEXT_RUNTIME = 'nodejs'
})

afterEach(() => {
  if (originalRuntime === undefined) delete process.env.NEXT_RUNTIME
  else process.env.NEXT_RUNTIME = originalRuntime
})

describe('PostHog instrumentation', () => {
  it('passes explicit options to the native handler and reuses it', async () => {
    const { capturePostHogError, registerPostHog } = await loadInstrumentation('explicit')
    const options = {
      apiKey: 'sensitive-project-key',
      host: 'https://analytics.example.test',
      disabled: true,
      beforeCapture: async () => false,
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

  it('does not initialize or call the Node SDK on Edge', async () => {
    const { capturePostHogError, registerPostHog } = await loadInstrumentation('edge')
    const calls = createOnRequestError.mock.calls.length
    process.env.NEXT_RUNTIME = 'edge'

    await registerPostHog()
    await capturePostHogError(
      new Error('edge request'),
      { path: '/api/test' },
      { routerKind: 'App Router' }
    )

    expect(createOnRequestError).toHaveBeenCalledTimes(calls)
  })

  it('isolates native handler failures from the host request hook', async () => {
    const { capturePostHogError, registerPostHog } = await loadInstrumentation('failure')
    await registerPostHog()
    handlers.at(-1)?.mockImplementation(async () => {
      throw new Error('telemetry failed')
    })

    await expect(
      capturePostHogError(
        new Error('request failed'),
        { path: '/api/test' },
        { routerKind: 'App Router' }
      )
    ).resolves.toBeUndefined()
  })

  it('isolates native handler initialization failures from server startup', async () => {
    const { capturePostHogError, registerPostHog } = await loadInstrumentation('init-failure')
    createOnRequestError.mockImplementationOnce(() => {
      throw new Error('telemetry unavailable')
    })

    await expect(registerPostHog()).resolves.toBeUndefined()
    await expect(
      capturePostHogError(
        new Error('request failed'),
        { path: '/api/test' },
        { routerKind: 'App Router' }
      )
    ).resolves.toBeUndefined()
  })
})
