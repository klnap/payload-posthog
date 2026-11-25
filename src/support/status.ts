import type { PostHog } from 'posthog-js'

type Conversations = PostHog['conversations']
type UnavailableReason = NonNullable<ReturnType<Conversations['getUnavailableReason']>>

export type PostHogSupportUnavailableReason =
  | 'remote-disabled'
  | 'consent'
  | 'sensitive-route'
  | 'configuration'
  | 'sdk-failure'
  | 'widget-not-opened'

export type PostHogSupportStatus =
  | { state: 'disabled' }
  | { state: 'identity-pending' }
  | { state: 'identity-required' }
  | { state: 'identity-error'; reason?: 'missing-secret' | 'verification-failed' }
  | { state: 'loading'; stage: 'remote-config' | 'sdk' }
  | { state: 'ready' }
  | { state: 'unavailable'; reason: PostHogSupportUnavailableReason }

export type PostHogSupportOpenResult =
  | { state: 'opened' }
  | { state: 'loading' }
  | { state: 'blocked'; reason: 'disabled' | 'identity-pending' | 'identity-required' }
  | { state: 'unavailable'; reason: PostHogSupportUnavailableReason }

export function supportSdkStatus(conversations: Conversations): PostHogSupportStatus {
  if (conversations.isAvailable()) return { state: 'ready' }

  const reason = conversations.getUnavailableReason()
  if (!reason) return { state: 'unavailable', reason: 'sdk-failure' }

  switch (reason as UnavailableReason) {
    case 'disabled_by_config':
    case 'disabled_for_toolbar':
      return { state: 'disabled' }
    case 'remote_config_pending':
      return { state: 'loading', stage: 'remote-config' }
    case 'initializing':
    case 'not_loaded':
      return { state: 'loading', stage: 'sdk' }
    case 'disabled_in_project':
      return { state: 'unavailable', reason: 'remote-disabled' }
    case 'consent_opted_out':
      return { state: 'unavailable', reason: 'consent' }
    case 'missing_token':
      return { state: 'unavailable', reason: 'configuration' }
    case 'remote_config_failed':
    case 'extensions_unavailable':
    case 'load_failed':
      return { state: 'unavailable', reason: 'sdk-failure' }
  }
}
