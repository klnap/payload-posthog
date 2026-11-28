import type { PostHogConfig } from 'posthog-js'
import { mergeSensitiveParameters } from '../redaction/sensitive-parameters'

/**
 * Applies the plugin's few defaults. PostHog keeps ownership of initialization, pageviews,
 * autocapture, Replay, consent, and remote configuration; explicit host values always win.
 */
export function normalizeClientOptions(
  clientOptions: Partial<PostHogConfig> = {},
  conversationsEnabled: boolean
): Partial<PostHogConfig> {
  const recording = clientOptions.session_recording
  return {
    ...clientOptions,
    // Pageviews have one owner: the PostHogPageView mounted by the plugin, unless the host sets this.
    capture_pageview: clientOptions.capture_pageview ?? false,
    // Referrers can carry a previous page's query values; campaign values persist across events.
    save_referrer: clientOptions.save_referrer ?? false,
    save_campaign_params: clientOptions.save_campaign_params ?? false,
    // Keeps URL hashes, which can hold tokens, out of captured URLs.
    disable_capture_url_hashes: clientOptions.disable_capture_url_hashes ?? true,
    // Native persisted attribution masks these parameter names (exact, case-sensitive match).
    mask_personal_data_properties: clientOptions.mask_personal_data_properties ?? true,
    custom_personal_data_properties: mergeSensitiveParameters(
      clientOptions.custom_personal_data_properties
    ),
    session_recording: {
      ...recording,
      maskAllInputs: recording?.maskAllInputs ?? false,
      // Password inputs stay masked even when the host changes other input masking options.
      maskInputOptions: { ...recording?.maskInputOptions, password: true },
    },
    // Conversations stays off unless configured: its launcher is gated only when the plugin manages it.
    disable_conversations: conversationsEnabled
      ? (clientOptions.disable_conversations ?? false)
      : true,
  }
}
