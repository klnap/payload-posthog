/**
 * Canonical sensitive query parameter names, in snake_case. Derived from Payload's native
 * authentication links (reset, email verification, invitation-style tokens), common OAuth and
 * one-time-code conventions, and posthog-js's own personal-data list.
 */
export const SENSITIVE_PARAMETER_NAMES = [
  'password',
  'passwd',
  'pwd',
  'passphrase',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'auth_token',
  'session_token',
  'reset_token',
  'reset_password_token',
  'verification_token',
  'invite_token',
  'invitation_token',
  'api_key',
  'secret',
  'client_secret',
  'authorization',
  'code',
  'otp',
  'recovery_code',
  'signature',
] as const

function camel(parts: readonly string[]): string {
  return parts.map((part, index) => (index === 0 ? part : capitalize(part))).join('')
}

function capitalize(part: string): string {
  return part.charAt(0).toUpperCase() + part.slice(1)
}

/**
 * Exact spellings for one canonical name. posthog-js matches `custom_personal_data_properties`
 * exactly and case-sensitively, so the common conventions are listed explicitly rather than
 * matched by pattern. Mixed-case forms outside these conventions are not covered natively.
 */
export function parameterVariants(name: string): string[] {
  const parts = name.split('_')
  const lower = parts.join('_')
  return [
    lower,
    camel(parts),
    capitalize(camel(parts)),
    parts.join('-'),
    lower.toUpperCase(),
    parts.join('-').toUpperCase(),
  ]
}

/** Built-in native names: every canonical name in each common convention, deduplicated. */
export const BUILT_IN_SENSITIVE_PARAMETERS: readonly string[] = [
  ...new Set(SENSITIVE_PARAMETER_NAMES.flatMap(parameterVariants)),
]

/**
 * Merges host-provided names with the built-in list. Host names come first and keep their
 * spelling; duplicates are removed; the input array is never mutated.
 */
export function mergeSensitiveParameters(hostNames: readonly string[] | undefined): string[] {
  return [...new Set([...(hostNames ?? []), ...BUILT_IN_SENSITIVE_PARAMETERS])]
}
