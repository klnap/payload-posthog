import { describe, expect, it } from 'bun:test'
import { normalizeClientOptions } from './normalize-client-options'

describe('normalizeClientOptions', () => {
  it('applies the agreed Replay defaults without masking all inputs', () => {
    expect(normalizeClientOptions({}, false).session_recording).toEqual({
      maskAllInputs: false,
      maskInputOptions: { password: true },
    })
  })

  it('keeps password masking when the host changes other mask options', () => {
    const options = normalizeClientOptions(
      {
        session_recording: {
          maskAllInputs: true,
          maskInputOptions: { password: false, email: true },
        },
      },
      false
    )
    expect(options.session_recording).toEqual({
      maskAllInputs: true,
      maskInputOptions: { password: true, email: true },
    })
  })

  it('keeps host Replay controls such as masking selectors', () => {
    const options = normalizeClientOptions(
      { session_recording: { maskTextSelector: '.secret', recordCrossOriginIframes: false } },
      false
    )
    expect(options.session_recording).toMatchObject({
      maskTextSelector: '.secret',
      recordCrossOriginIframes: false,
      maskAllInputs: false,
    })
  })

  it('does not force autocapture, Replay, or exception capture on or off', () => {
    const options = normalizeClientOptions({}, false)
    expect(options).not.toHaveProperty('autocapture')
    expect(options).not.toHaveProperty('disable_session_recording')
    expect(options).not.toHaveProperty('capture_exceptions')
  })

  it('preserves explicit native pageview and referrer overrides', () => {
    expect(
      normalizeClientOptions({ capture_pageview: true, save_referrer: true }, false)
    ).toMatchObject({ capture_pageview: true, save_referrer: true })
    expect(normalizeClientOptions({}, false)).toMatchObject({
      capture_pageview: false,
      save_referrer: false,
      save_campaign_params: false,
    })
  })

  it('disables Conversations unless configured, even when the host asks to enable it', () => {
    expect(normalizeClientOptions({}, false).disable_conversations).toBe(true)
    expect(
      normalizeClientOptions({ disable_conversations: false }, false).disable_conversations
    ).toBe(true)
    expect(normalizeClientOptions({}, true).disable_conversations).toBe(false)
    expect(
      normalizeClientOptions({ disable_conversations: true }, true).disable_conversations
    ).toBe(true)
  })

  it('enables native personal-data masking and URL hash removal by default', () => {
    const options = normalizeClientOptions({}, false)
    expect(options.mask_personal_data_properties).toBe(true)
    expect(options.disable_capture_url_hashes).toBe(true)
    expect(options.custom_personal_data_properties).toContain('access_token')
    expect(options.custom_personal_data_properties).toContain('accessToken')
  })

  it('merges host masking names with the built-in list without mutating the host array', () => {
    const host = ['internal_ref', 'access_token']
    const options = normalizeClientOptions({ custom_personal_data_properties: host }, false)
    expect(options.custom_personal_data_properties?.slice(0, 2)).toEqual([
      'internal_ref',
      'access_token',
    ])
    const merged = options.custom_personal_data_properties ?? []
    expect(new Set(merged).size).toBe(merged.length)
    expect(host).toEqual(['internal_ref', 'access_token'])
  })

  it('respects an explicit host choice to disable native personal-data masking', () => {
    expect(
      normalizeClientOptions({ mask_personal_data_properties: false }, false)
        .mask_personal_data_properties
    ).toBe(false)
  })
})
