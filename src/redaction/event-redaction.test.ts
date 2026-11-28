import { describe, expect, it } from 'bun:test'
import { redactEventUrls } from './event-redaction'
import { REDACTED } from './url-redaction'

const ROUTES = { adminRoute: '/admin', resetRoute: '/reset' }
const TOKEN = 'synthetic-reset-token-canary-abcdefghijklmnop'
const URL_ = `https://cms.example.test/admin/reset/${TOKEN}?t=${TOKEN}#access_token=${TOKEN}`

function redact(properties: Record<string, unknown>) {
  return redactEventUrls({ event: '$pageview', properties }, ROUTES).properties as Record<
    string,
    unknown
  >
}

describe('redactEventUrls', () => {
  it('redacts pageview URL, pathname, and referrer properties', () => {
    const out = redact({
      $current_url: URL_,
      $pathname: `/admin/reset/${TOKEN}`,
      $referrer: `https://cms.example.test/admin/reset/${TOKEN}?x=1`,
      $initial_referrer: URL_,
      $session_entry_url: URL_,
      $referring_domain: 'cms.example.test',
    })
    expect(JSON.stringify(out)).not.toContain(TOKEN)
    expect(out.$current_url).toBe(`https://cms.example.test/admin/reset/${REDACTED}?t=${REDACTED}`)
    expect(out.$referring_domain).toBe('cms.example.test')
  })

  it('redacts nested $set and $set_once person properties', () => {
    const out = redact({
      $set: { $initial_current_url: URL_, name: 'Ada' },
      $set_once: { $initial_current_url: URL_ },
    }) as { $set: Record<string, unknown>; $set_once: Record<string, unknown> }
    expect(JSON.stringify(out)).not.toContain(TOKEN)
    expect(out.$set.name).toBe('Ada')
  })

  it('redacts element href attributes and drops unparseable URL values', () => {
    const out = redact({
      $elements: [{ tag_name: 'a', attr__href: URL_, text: 'Reset' }],
      $current_url: 'http://[::1',
    }) as { $elements: Array<Record<string, unknown>> }
    expect(JSON.stringify(out)).not.toContain(TOKEN)
    expect(out.$elements[0]?.text).toBe('Reset')
    expect('$current_url' in out).toBe(false)
  })

  it('redacts the Replay meta href and keeps other snapshot items', () => {
    const out = redact({
      $snapshot_data: [
        { type: 4, data: { href: URL_, width: 780 }, timestamp: 1 },
        { type: 3, data: { source: 1 }, timestamp: 2 },
      ],
    }) as { $snapshot_data: Array<{ type: number; data: Record<string, unknown> }> }
    expect(JSON.stringify(out)).not.toContain(TOKEN)
    expect(out.$snapshot_data[0]?.data.width).toBe(780)
    expect(out.$snapshot_data[1]?.data).toEqual({ source: 1 })
  })

  it('redacts network timing resource URLs in Replay plugin events', () => {
    const out = redact({
      $snapshot_data: [
        {
          type: 6,
          data: {
            plugin: 'rrweb/network@1',
            payload: { requests: [{ name: URL_, duration: 12 }] },
          },
          timestamp: 3,
        },
      ],
    }) as {
      $snapshot_data: Array<{ data: { payload: { requests: Array<Record<string, unknown>> } } }>
    }
    expect(JSON.stringify(out)).not.toContain(TOKEN)
    expect(out.$snapshot_data[0]?.data.payload.requests[0]?.duration).toBe(12)
  })

  it('redacts URLs in custom Replay events such as $url_changed', () => {
    const href = `https://cms.example.test/admin/login/?redirect=${encodeURIComponent(`/admin/collections/posts/?search=${TOKEN}`)}`
    const out = redact({
      $snapshot_data: [{ type: 5, data: { tag: '$url_changed', payload: { href } }, timestamp: 4 }],
    }) as { $snapshot_data: Array<{ data: { payload: { href: string } } }> }
    expect(JSON.stringify(out)).not.toContain(TOKEN)
    expect(out.$snapshot_data[0]?.data.payload.href).toBe(
      'https://cms.example.test/admin/login/?redirect=[REDACTED]'
    )
  })

  it('redacts URL attributes in incremental DOM mutations', () => {
    const out = redact({
      $snapshot_data: [
        {
          type: 3,
          data: {
            source: 0,
            adds: [
              { parentId: 1, node: { tagName: 'a', attributes: { href: URL_, class: 'btn' } } },
            ],
            attributes: [{ id: 2, attributes: { src: URL_ } }],
          },
          timestamp: 5,
        },
      ],
    }) as { $snapshot_data: Array<{ data: Record<string, unknown> }> }
    expect(JSON.stringify(out)).not.toContain(TOKEN)
    expect(JSON.stringify(out)).toContain('"class":"btn"')
  })

  it('does not touch unrelated properties, feature flags, or identity', () => {
    const properties = {
      distinct_id: 'users:1',
      $feature_flag: 'new-editor',
      $feature_flag_response: true,
      token: 'phc_public_key',
      api_key: 'phc_public_key',
      count: 3,
    }
    expect(redact(properties)).toEqual(properties)
  })

  it('does not mutate the original event', () => {
    const event = { event: '$pageview', properties: { $current_url: URL_ } }
    redactEventUrls(event, ROUTES)
    expect(event.properties.$current_url).toBe(URL_)
  })

  it('passes events without properties through', () => {
    const event: { event: string; properties?: unknown } = { event: 'x' }
    expect(redactEventUrls(event, ROUTES)).toBe(event)
  })

  it('keeps posthog-js no-referrer sentinels unchanged', () => {
    const out = redact({
      $referrer: '$direct',
      $initial_referrer: '$direct',
      $referring_domain: '$direct',
    })
    expect(out.$referrer).toBe('$direct')
    expect(out.$initial_referrer).toBe('$direct')
    expect(redact({ $referrer: '' }).$referrer).toBe('')
  })

  it('redacts src, action, and formaction attributes and drops non-string URL values', () => {
    const out = redact({
      $elements: [
        { tag_name: 'img', attr__src: URL_ },
        { tag_name: 'form', attr__action: URL_ },
        { tag_name: 'button', attr__formaction: URL_ },
      ],
      $current_url: { href: URL_ },
    }) as { $elements: Array<Record<string, unknown>> }
    expect(JSON.stringify(out)).not.toContain(TOKEN)
    expect(out.$elements[0]?.attr__src).toBe(
      `https://cms.example.test/admin/reset/${REDACTED}?t=${REDACTED}`
    )
    expect('$current_url' in out).toBe(false)
  })
})
