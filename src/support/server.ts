import { createHmac } from 'node:crypto'

const NO_STORE = { 'Cache-Control': 'no-store' }

export type SupportIdentityHandlerDeps = {
  /** Resolve the authenticated session's namespaced Payload ID, or null for anonymous requests. */
  resolveDistinctId: () => Promise<string | null>
  secret: string | undefined
}

/** HMAC-SHA256 (hex) of a trusted distinct ID, keyed with PostHog's Support identity secret. */
export function signSupportDistinctId(distinctId: string, secret: string): string {
  return createHmac('sha256', secret).update(distinctId).digest('hex')
}

/**
 * Creates a no-store handler for a host-owned authenticated route.
 * The host must resolve the identity from its server session, never from request input.
 */
export function createSupportIdentityHandler({
  resolveDistinctId,
  secret,
}: SupportIdentityHandlerDeps) {
  return async function getSupportIdentity(): Promise<Response> {
    let distinctId: string | null
    try {
      distinctId = await resolveDistinctId()
    } catch {
      return Response.json({ error: 'session_error' }, { status: 500, headers: NO_STORE })
    }
    if (!distinctId) {
      return Response.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE })
    }
    if (!secret) {
      return Response.json({ error: 'not_configured' }, { status: 503, headers: NO_STORE })
    }
    return Response.json(
      { distinctId, hash: signSupportDistinctId(distinctId, secret) },
      { headers: NO_STORE }
    )
  }
}
