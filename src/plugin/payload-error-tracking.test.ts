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
})
