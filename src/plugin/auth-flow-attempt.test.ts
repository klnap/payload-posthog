import { describe, expect, it } from 'bun:test'
import {
  consumeAuthFlowAttempt,
  isRecentAuthFlowAttempt,
  storeAuthFlowAttempt,
} from './auth-flow-attempt'

function createStorage(): Storage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
    clear: () => values.clear(),
    key: () => null,
    get length() {
      return values.size
    },
  }
}

describe('auth flow attempt storage', () => {
  it('consumes a recent flow once after authentication', () => {
    const storage = createStorage()
    storeAuthFlowAttempt(storage, 'login', 1000)

    expect(consumeAuthFlowAttempt(storage, true, 2000)).toBe('login')
    expect(consumeAuthFlowAttempt(storage, true, 2000)).toBeNull()
  })

  it('retains the attempt while the visitor remains anonymous', () => {
    const storage = createStorage()
    storeAuthFlowAttempt(storage, 'login', 1000)

    expect(consumeAuthFlowAttempt(storage, false, 2000)).toBeNull()
    expect(consumeAuthFlowAttempt(storage, true, 2000)).toBe('login')
  })

  it('rejects expired, future, and unknown flow markers', () => {
    const storage = createStorage()
    storeAuthFlowAttempt(storage, 'login', 1000)
    expect(consumeAuthFlowAttempt(storage, true, 121_001)).toBeNull()

    storeAuthFlowAttempt(storage, 'login', 3000)
    expect(consumeAuthFlowAttempt(storage, true, 2000)).toBeNull()

    storeAuthFlowAttempt(storage, 'custom', 1000)
    expect(consumeAuthFlowAttempt(storage, true, 2000)).toBeNull()
  })

  it('expires same-page attempts after two minutes', () => {
    expect(isRecentAuthFlowAttempt({ flow: 'login', startedAt: 1000 }, 121_000)).toBe(true)
    expect(isRecentAuthFlowAttempt({ flow: 'login', startedAt: 1000 }, 121_001)).toBe(false)
    expect(isRecentAuthFlowAttempt({ flow: 'other', startedAt: 1000 }, 2000)).toBe(false)
  })
})
