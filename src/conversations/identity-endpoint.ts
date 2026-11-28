import { createHmac } from 'node:crypto'
import { type Endpoint, getAccessResults, type PayloadRequest } from 'payload'
import { logConversationsStatus } from '../diagnostics/debug'
import { payloadDistinctId } from '../identity/payload-distinct-id'

export const CONVERSATIONS_IDENTITY_PATH = '/posthog/conversations/identity'

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
}

/** Returns the Payload API route for the identity endpoint, honoring `routes.api`. */
export function conversationsIdentityURL(apiRoute = '/api'): string {
  const prefix = `/${apiRoute.split('/').filter(Boolean).join('/')}`
  return `${prefix === '/' ? '' : prefix}${CONVERSATIONS_IDENTITY_PATH}`
}

function isSameOriginRequest(req: { headers: Headers; url?: string }): boolean {
  if (!req.url) return false
  const origin = req.headers.get('origin')
  if (!origin) {
    // Same-site would admit sibling subdomains, so only exact same-origin metadata counts.
    return req.headers.get('sec-fetch-site') === 'same-origin'
  }
  try {
    return new URL(origin).origin === new URL(req.url).origin
  } catch {
    return false
  }
}

type AuthenticatedPayloadUser = {
  id?: string | number
  collection?: string
  type?: string
  _strategy?: string
}

// Payload computes canAccessAdmin on access results, not on req.user.
const canAccessPayloadAdmin = async (req: PayloadRequest): Promise<boolean> =>
  (await getAccessResults({ req })).canAccessAdmin === true

/**
 * Signs the authenticated Payload user for PostHog Conversations. The secret stays on the server:
 * the response carries only the distinct ID and its HMAC-SHA256 hash.
 */
export function createConversationsIdentityEndpoint({
  authCollections,
  canAccessAdmin = canAccessPayloadAdmin,
  getSecret,
  debug = false,
}: {
  authCollections: readonly string[]
  canAccessAdmin?: (req: PayloadRequest) => Promise<boolean>
  getSecret: () => string
  /** Logs the outcome (never the signature) to the terminal. */
  debug?: boolean
}): Endpoint {
  const log = (status: string, distinctId?: string) => {
    if (debug) logConversationsStatus(status, distinctId)
  }
  return {
    path: CONVERSATIONS_IDENTITY_PATH,
    method: 'get',
    handler: async (req) => {
      try {
        if (!isSameOriginRequest(req)) {
          log('rejected: cross-origin request')
          return Response.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE_HEADERS })
        }

        const user = req.user as AuthenticatedPayloadUser | null
        const collection = user?.collection
        if (
          user?.id == null ||
          String(user.id).length === 0 ||
          !collection ||
          !authCollections.includes(collection) ||
          user.type === 'service' ||
          user._strategy === 'api-key'
        ) {
          return Response.json(
            { error: 'unauthorized' },
            { status: 401, headers: NO_STORE_HEADERS }
          )
        }

        if (!(await canAccessAdmin(req))) {
          log('rejected: no Payload Admin access')
          return Response.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE_HEADERS })
        }

        const secret = getSecret()
        if (secret.length === 0) {
          log('rejected: secret not configured')
          return Response.json(
            { error: 'not_configured' },
            { status: 503, headers: NO_STORE_HEADERS }
          )
        }

        const distinctId = payloadDistinctId(collection, user.id)
        const hash = createHmac('sha256', secret).update(distinctId).digest('hex')
        log('signed for the authenticated user', distinctId)
        return Response.json({ distinctId, hash }, { headers: NO_STORE_HEADERS })
      } catch {
        return Response.json({ error: 'server_error' }, { status: 500, headers: NO_STORE_HEADERS })
      }
    },
  }
}
