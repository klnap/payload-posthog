/* biome-ignore-all lint/suspicious/noConsole: this module writes diagnostics to the terminal by design. */
import { createHash } from 'node:crypto'
import { payloadDistinctId } from '../identity/payload-distinct-id'
import { resolvePersonProperties, resolvePersonProperty } from '../identity/person-properties'

/**
 * Terminal diagnostics for `debug: true`. Server-side only: the output comes from the Payload
 * process (`console`), never from the browser, and nothing is sent to a PostHog endpoint.
 * Output can contain personal data: explicitly mapped person properties are printed as resolved.
 * Secrets, tokens, HMAC values, headers, and complete user objects are never printed.
 */
const PREFIX = '[payload-posthog]'

export type PluginMode = 'enabled' | 'keyless' | 'disabled'

/**
 * Last reported state per key, so unchanged requests (for example every `/me`) stay silent.
 * Kept on globalThis: Next.js bundles this module into several server chunks, and each copy would
 * otherwise print the same startup lines again.
 */
const STATE_KEY = '__payloadPosthogDebugReported'
const globalState = globalThis as Record<string, unknown>
const isDigest = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const existingState = globalState[STATE_KEY]
if (
  !(existingState instanceof Map) ||
  ![...existingState].every(([key, state]) => isDigest(key) && isDigest(state))
) {
  globalState[STATE_KEY] = new Map<string, string>()
}
const reported = globalState[STATE_KEY] as Map<string, string>
const MAX_REPORTED_STATES = 64

function once(key: string, state: string, report: () => void): void {
  const keyHash = createHash('sha256').update(key).digest('hex')
  const stateHash = createHash('sha256').update(state).digest('hex')
  if (reported.get(keyHash) === stateHash) return
  reported.delete(keyHash)
  reported.set(keyHash, stateHash)
  if (reported.size > MAX_REPORTED_STATES) {
    const oldest = reported.keys().next().value
    if (oldest !== undefined) reported.delete(oldest)
  }
  try {
    report()
  } catch {
    // Broken terminal output must not affect Payload or Conversations responses.
  }
}

const MODE_TEXT: Record<PluginMode, string> = {
  enabled: 'PostHog enabled. Plugin diagnostics only; native SDK debug is `clientOptions.debug`.',
  keyless:
    'keyless diagnostic mode. PostHog is not initialized; no telemetry and no remote SDK assets are used. Identity diagnostics only.',
  disabled: 'disabled (`enabled: false`). Nothing is registered.',
}

export function logPluginMode(mode: PluginMode): void {
  once('mode', mode, () => console.log(PREFIX, 'mode:', MODE_TEXT[mode]))
}

export function logConfiguredMappings(mapping: Readonly<Record<string, string>>): void {
  const key = JSON.stringify(mapping)
  once('mappings', key, () => {
    console.log(PREFIX, 'configured identity property mappings:')
    console.table(Object.entries(mapping).map(([property, path]) => ({ property, path })))
  })
}

type AnonymousAfterMeHook = (args: { response: unknown; collection: { slug: string } }) => unknown

/**
 * Resolved identity for the signed-in user on a `/me` request. Reads the same user Payload returns
 * to that request (read access applied), so no field can be exposed that the user cannot read.
 */
export function createIdentityDiagnosticsHook(
  mapping: Readonly<Record<string, string>> | null,
  transmittedNote: string
): AnonymousAfterMeHook {
  return ({ response, collection }) => {
    try {
      const me = response as
        | { user?: Record<string, unknown> | null; collection?: string }
        | undefined
      const user = me?.user
      if (
        !user ||
        user.id == null ||
        (typeof user.id !== 'string' && typeof user.id !== 'number')
      ) {
        once('identity', 'anonymous', () =>
          console.log(
            PREFIX,
            'identity: anonymous on this request (the browser SDK owns the anonymous ID; the server cannot see it)'
          )
        )
        return undefined
      }
      const distinctId = payloadDistinctId(me?.collection ?? collection.slug, user.id)
      const properties = mapping ? resolvePersonProperties(user, mapping) : {}
      once('identity', `${distinctId}\0${JSON.stringify(properties)}`, () => {
        console.log(PREFIX, `identity: resolved distinct ID ${distinctId}. ${transmittedNote}`)
        if (!mapping) return
        console.table(
          Object.entries(mapping).map(([property, path]) => {
            const value = resolvePersonProperty(user, path)
            return {
              property,
              path,
              value,
              status: value === undefined ? 'omitted (missing or unsupported)' : 'resolved',
            }
          })
        )
      })
    } catch {
      // Diagnostics must never change the Payload authentication response.
      return undefined
    }
    return undefined
  }
}

/** Conversations identity outcome. Never includes the signature or the secret. */
export function logConversationsStatus(status: string, distinctId?: string): void {
  once('conversations-status', `${distinctId ?? ''}\0${status}`, () =>
    console.log(
      PREFIX,
      `conversations identity: ${status}${distinctId ? ` for ${distinctId}` : ''}. The HMAC signature is not logged.`
    )
  )
}

export function logConversationsConfig(launcher: string): void {
  once('conversations-config', launcher, () =>
    console.log(
      PREFIX,
      `conversations: configured (launcher: ${launcher}). The signing endpoint is registered; the secret is never logged.`
    )
  )
}
