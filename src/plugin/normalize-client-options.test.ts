import { describe, expect, it } from 'bun:test'
import { normalizeClientOptions } from './normalize-client-options'

describe('normalizeClientOptions', () => {
  it('sets only the explicit plugin defaults and leaves native defaults alone', () => {
    const options = normalizeClientOptions({}, false)

    expect(options).toMatchObject({
      capture_pageview: false,
      autocapture: false,
      disable_session_recording: true,
      disable_capture_url_hashes: true,
      disable_conversations: true,
      session_recording: { maskAllInputs: true, maskInputOptions: { password: true } },
    })
    expect(options).not.toHaveProperty('save_referrer')
    expect(options).not.toHaveProperty('save_campaign_params')
    expect(options).not.toHaveProperty('capture_exceptions')
    expect(options).not.toHaveProperty('person_profiles')
    expect(options).not.toHaveProperty('advanced_disable_feature_flags_on_first_load')
  })

  it('keeps an explicit capture_pageview owned by the SDK', () => {
    expect(normalizeClientOptions({ capture_pageview: 'history_change' }, true)).toMatchObject({
      capture_pageview: 'history_change',
    })
  })

  it('preserves native options while retaining the initial Replay privacy gate', () => {
    const options = normalizeClientOptions(
      {
        api_host: 'https://events.example.test',
        disable_capture_url_hashes: false,
        save_referrer: true,
        disable_conversations: false,
        session_recording: { maskInputOptions: { password: false, email: true } },
      },
      false
    )

    expect(options).toMatchObject({
      api_host: 'https://events.example.test',
      disable_capture_url_hashes: false,
      save_referrer: true,
      autocapture: false,
      disable_session_recording: true,
      disable_conversations: false,
      session_recording: { maskInputOptions: { password: true, email: true } },
    })
  })

  it('enables Conversations by default only when Support is configured', () => {
    expect(normalizeClientOptions({}, true)).toMatchObject({ disable_conversations: false })
  })
})
