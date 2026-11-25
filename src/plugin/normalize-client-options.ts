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
    // Explicit false: PostHogPageView owns pageviews unless the host sets capture_pageview itself.
    capture_pageview: clientOptions.capture_pageview ?? false,
    // Hides URL hashes from captured URLs. Native default is off until defaults 2026-06-25.
    disable_capture_url_hashes: clientOptions.disable_capture_url_hashes ?? true,
    session_recording: {
      ...clientOptions.session_recording,
      // Native default masks every input. Only password inputs are masked by default.
      maskAllInputs: clientOptions.session_recording?.maskAllInputs ?? false,
      maskInputOptions: { password: true, ...clientOptions.session_recording?.maskInputOptions },
    },
    // Conversations is part of Support, so it stays off until Support is configured.
    disable_conversations: clientOptions.disable_conversations ?? !supportEnabled,
  }
}
