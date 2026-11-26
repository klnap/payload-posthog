import type { PostHogConfig } from 'posthog-js'

/**
 * Sets only what the plugin needs to stay predictable. Every other option keeps its native default.
 */
export function normalizeClientOptions(
  clientOptions: Partial<PostHogConfig> = {},
  supportEnabled: boolean
): Partial<PostHogConfig> {
  return {
    ...clientOptions,
    // Explicit false: the privacy-aware tracker owns pageviews unless the host sets capture_pageview itself.
    capture_pageview: clientOptions.capture_pageview ?? false,
    // The route tracker enables autocapture only after classifying the current Admin route.
    autocapture: false,
    // Prevent an initial Replay snapshot before the route and user are classified.
    disable_session_recording: true,
    // Hides URL hashes from captured URLs. Native default is off until defaults 2026-06-25.
    disable_capture_url_hashes: clientOptions.disable_capture_url_hashes ?? true,
    session_recording: {
      ...clientOptions.session_recording,
      // Fail closed for unclassified inputs; the host can explicitly choose a native policy.
      maskAllInputs: clientOptions.session_recording?.maskAllInputs ?? true,
      // Passwords remain protected even when the host overrides other input masking options.
      maskInputOptions: { ...clientOptions.session_recording?.maskInputOptions, password: true },
    },
    // Conversations is part of Support, so it stays off until Support is configured.
    disable_conversations: clientOptions.disable_conversations ?? !supportEnabled,
  }
}
