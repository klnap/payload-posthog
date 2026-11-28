type ConversationsIdentity = { distinctId: string; hash: string }

type VerifyOptions = {
  endpoint: string
  /** The distinct ID the Payload identity sync established in analytics. */
  expectedDistinctId: string
  signal: AbortSignal
  fetcher?: typeof fetch
}

const HMAC_SHA256_HEX = /^[a-f\d]{64}$/i

function isIdentity(value: unknown): value is ConversationsIdentity {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ConversationsIdentity).distinctId === 'string' &&
    typeof (value as ConversationsIdentity).hash === 'string' &&
    HMAC_SHA256_HEX.test((value as ConversationsIdentity).hash)
  )
}

/**
 * Requests the server-signed Conversations identity for the current user. Returns null when the
 * response is not the expected user's signed identity. Aborted requests reject with the abort
 * reason, so a stale response can never be applied.
 */
export async function fetchConversationsIdentity({
  endpoint,
  expectedDistinctId,
  signal,
  fetcher = fetch,
}: VerifyOptions): Promise<ConversationsIdentity | null> {
  const response = await fetcher(endpoint, {
    cache: 'no-store',
    credentials: 'same-origin',
    referrerPolicy: 'no-referrer',
    signal,
  })
  if (!response.ok) return null
  const body: unknown = await response.json()
  signal.throwIfAborted()
  if (!isIdentity(body) || body.distinctId !== expectedDistinctId) return null
  return body
}
