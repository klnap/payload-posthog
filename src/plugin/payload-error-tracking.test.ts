import { describe, expect, it } from 'bun:test'
import { createPayloadAfterErrorHook, isExpectedPayloadError } from './payload-error-tracking'

describe('Payload error tracking', () => {
  it('suppresses expected HTTP errors', () => {
    expect(isExpectedPayloadError(Object.assign(new Error('not found'), { status: 404 }))).toBe(
      true
    )
    expect(isExpectedPayloadError(Object.assign(new Error('internal'), { status: 500 }))).toBe(
      false
    )
  })

  it('isolates the host error response when the capture filter fails', async () => {
    const hook = createPayloadAfterErrorHook({
      apiKey: 'phc_public',
      shouldCapture: () => {
        throw new Error('filter failure')
      },
    })

    await expect(
      hook({
        error: new Error('host error'),
        req: { user: null },
      } as never)
    ).resolves.toBeUndefined()
  })

  it('does not hold the Payload error response while PostHog is unreachable', async () => {
    const hook = createPayloadAfterErrorHook({
      apiKey: 'phc_public',
      // Closed local port: the capture fails or times out, and the hook must not wait for it.
      serverOptions: { host: 'http://127.0.0.1:9', requestTimeout: 2_000 },
    })
    const started = performance.now()
    await hook({ error: new Error('synthetic-500'), req: { user: null } } as never)
    expect(performance.now() - started).toBeLessThan(500)
  })
})
