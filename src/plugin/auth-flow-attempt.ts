const STORAGE_KEY = 'payload-posthog:auth-flow-attempt'
const MAX_AGE_MS = 2 * 60 * 1000

const AUTH_FLOWS = new Set([
  'authentication',
  'bootstrap',
  'invitation',
  'login',
  'logout',
  'password_recovery',
  'password_reset',
  'session_expired',
])

type AuthFlowAttempt = {
  flow: string
  startedAt: number
}

export function storeAuthFlowAttempt(
  storage: Pick<Storage, 'setItem'> | null,
  flow: string,
  now = Date.now()
): void {
  if (!storage || !AUTH_FLOWS.has(flow)) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ flow, startedAt: now }))
  } catch {
    // Storage can be disabled; same-document tracking still uses its in-memory marker.
  }
}

export function consumeAuthFlowAttempt(
  storage: Pick<Storage, 'getItem' | 'removeItem'> | null,
  authenticated: boolean,
  now = Date.now()
): string | null {
  if (!authenticated || !storage) return null
  try {
    const serialized = storage.getItem(STORAGE_KEY)
    if (!serialized) return null
    storage.removeItem(STORAGE_KEY)
    const attempt = JSON.parse(serialized) as Partial<AuthFlowAttempt>
    if (
      typeof attempt.flow !== 'string' ||
      !AUTH_FLOWS.has(attempt.flow) ||
      typeof attempt.startedAt !== 'number' ||
      now < attempt.startedAt ||
      now - attempt.startedAt > MAX_AGE_MS
    ) {
      return null
    }
    return attempt.flow
  } catch {
    return null
  }
}
