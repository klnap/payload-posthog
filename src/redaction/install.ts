import type { PostHog } from 'posthog-js'
import { maskReplayAttribute, redactEventUrls } from './event-redaction'
import type { NativeAuthRoutes } from './url-redaction'

const installed = new WeakSet<PostHog>()

/**
 * Installs URL redaction as the first `before_send` handler of the native client. Called during
 * render, after the provider initializes the SDK and before any child effect can capture, so the
 * first `$pageview`, identity event, and Replay metadata are already redacted.
 *
 * Host handlers, which can exist only if the host configured the instance directly, run after it.
 */
export function installNativeUrlRedaction(posthog: PostHog, routes: NativeAuthRoutes): void {
  if (installed.has(posthog)) return
  installed.add(posthog)
  const existing = posthog.config.before_send
  const hostHandlers = existing === undefined ? [] : Array.isArray(existing) ? existing : [existing]
  // A host callback, if one was set through set_config, still runs and sees the redacted value.
  const hostMask = posthog.config.session_recording?.maskAttributeFn
  posthog.set_config({
    before_send: [(event) => redactEventUrls(event, routes), ...hostHandlers],
    session_recording: {
      ...posthog.config.session_recording,
      maskAttributeFn: (name, value, element) => {
        const redacted = maskReplayAttribute(name, value, routes)
        return hostMask ? hostMask(name, redacted, element) : redacted
      },
    },
  })
}
