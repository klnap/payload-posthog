import { createHmac } from 'node:crypto'
import { type Endpoint, getAccessResults, type PayloadRequest } from 'payload'
import { payloadDistinctId } from '../identity/payload-distinct-id'

export const POSTHOG_SUPPORT_IDENTITY_PATH = '/posthog/support/identity'

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
}

function isSameOriginRequest(req: { headers: Headers; url?: string }): boolean {
  if (!req.url) return false
  const origin = req.headers.get('origin')
  if (!origin) {
    // Without Origin only an exact same-origin Fetch Metadata value counts: same-site would admit sibling subdomains.
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
}

// Payload computes canAccessAdmin on access results, not on req.user.
const canAccessPayloadAdmin = async (req: PayloadRequest): Promise<boolean> =>
  (await getAccessResults({ req })).canAccessAdmin === true

export function createPayloadSupportIdentityEndpoint({
  adminUserCollection,
  authCollections,
  canAccessAdmin = canAccessPayloadAdmin,
  getSecret,
}: {
  adminUserCollection?: string
  authCollections: readonly string[]
  canAccessAdmin?: (req: PayloadRequest) => Promise<boolean>
  getSecret: () => string | undefined
}): Endpoint {
  return {
    path: POSTHOG_SUPPORT_IDENTITY_PATH,
    method: 'get',
    handler: async (req) => {
      try {
        if (!isSameOriginRequest(req)) {
          return Response.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE_HEADERS })
        }

        const user = req.user as AuthenticatedPayloadUser | null
        const collection = user?.collection ?? adminUserCollection
        if (
          user?.id == null ||
          String(user.id).length === 0 ||
          user.type === 'service' ||
          !collection ||
          !authCollections.includes(collection)
        ) {
          return Response.json(
            { error: 'unauthorized' },
            { status: 401, headers: NO_STORE_HEADERS }
          )
        }

        if (!(await canAccessAdmin(req))) {
          return Response.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE_HEADERS })
        }

        const secret = getSecret()
        if (typeof secret !== 'string' || secret.length === 0) {
          return Response.json(
            {
              error: 'not_configured',
              message: 'Set payload.support.identitySecret on the server.',
            },
            { status: 503, headers: NO_STORE_HEADERS }
          )
        }

        const distinctId = payloadDistinctId(collection, user.id)
        const hash = createHmac('sha256', secret).update(distinctId).digest('hex')
        return Response.json({ distinctId, hash }, { headers: NO_STORE_HEADERS })
      } catch {
        return Response.json({ error: 'server_error' }, { status: 500, headers: NO_STORE_HEADERS })
      }
    },
  }
}

export function postHogSupportIdentityURL(apiRoute = '/api'): string {
  const prefix = `/${apiRoute.split('/').filter(Boolean).join('/')}`
  return `${prefix === '/' ? '' : prefix}${POSTHOG_SUPPORT_IDENTITY_PATH}`
}
