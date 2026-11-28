import { describe, expect, it } from 'bun:test'
import { REDACTED, redactUrl } from './url-redaction'

const ROUTES = { adminRoute: '/admin', resetRoute: '/reset' }
const HOST = 'https://cms.example.test'

describe('redactUrl', () => {
  it('redacts every query value and keeps names', () => {
    expect(redactUrl(`${HOST}/admin/reset?token=secret123`, ROUTES)).toBe(
      `${HOST}/admin/reset?token=${REDACTED}`
    )
    expect(redactUrl(`${HOST}/admin/invite?invitation=secret123`, ROUTES)).toBe(
      `${HOST}/admin/invite?invitation=${REDACTED}`
    )
    expect(redactUrl(`${HOST}/admin/articles?limit=10&page=2`, ROUTES)).toBe(
      `${HOST}/admin/articles?limit=${REDACTED}&page=${REDACTED}`
    )
    expect(redactUrl(`${HOST}/admin/collections/articles?search=confidential`, ROUTES)).toBe(
      `${HOST}/admin/collections/articles?search=${REDACTED}`
    )
  })

  it('redacts repeated, empty, and encoded query values', () => {
    expect(redactUrl(`${HOST}/admin/x?a=1&a=2&b=&c=%20x%26y`, ROUTES)).toBe(
      `${HOST}/admin/x?a=${REDACTED}&a=${REDACTED}&b=${REDACTED}&c=${REDACTED}`
    )
  })

  it('removes fragments and credentials in the authority', () => {
    expect(redactUrl(`${HOST}/admin#access_token=secret123`, ROUTES)).toBe(`${HOST}/admin`)
    expect(redactUrl(`https://user:pass@cms.example.test/admin/x`, ROUTES)).toBe(
      'https://cms.example.test/admin/x'
    )
  })

  it('redacts the native reset path segment', () => {
    expect(redactUrl(`${HOST}/admin/reset/secret123`, ROUTES)).toBe(
      `${HOST}/admin/reset/${REDACTED}`
    )
  })

  it('redacts the native email verification segment under any collection slug', () => {
    expect(redactUrl(`${HOST}/admin/users/verify/secret123`, ROUTES)).toBe(
      `${HOST}/admin/users/verify/${REDACTED}`
    )
    expect(redactUrl(`${HOST}/admin/admins/verify/secret123`, ROUTES)).toBe(
      `${HOST}/admin/admins/verify/${REDACTED}`
    )
  })

  it('follows configured Admin and reset route names', () => {
    const custom = { adminRoute: '/ops/cms', resetRoute: '/recover' }
    expect(redactUrl(`${HOST}/ops/cms/recover/secret123`, custom)).toBe(
      `${HOST}/ops/cms/recover/${REDACTED}`
    )
    // The default names no longer apply once renamed.
    expect(redactUrl(`${HOST}/ops/cms/reset/secret123`, custom)).toBe(
      `${HOST}/ops/cms/reset/secret123`
    )
    expect(redactUrl(`${HOST}/admin/reset/secret123`, custom)).toBe(`${HOST}/admin/reset/secret123`)
  })

  it('handles a site-root Admin route', () => {
    expect(redactUrl(`${HOST}/reset/secret123`, { adminRoute: '', resetRoute: '/reset' })).toBe(
      `${HOST}/reset/${REDACTED}`
    )
  })

  it('preserves ordinary paths and document identifiers', () => {
    expect(redactUrl(`${HOST}/admin/collections/articles/123`, ROUTES)).toBe(
      `${HOST}/admin/collections/articles/123`
    )
    const uuid = '3fe80c2d-5ed7-4998-b8b3-daa0ba6fae21'
    expect(redactUrl(`${HOST}/admin/collections/users/${uuid}`, ROUTES)).toBe(
      `${HOST}/admin/collections/users/${uuid}`
    )
    expect(redactUrl(`${HOST}/admin/collections/posts/verify`, ROUTES)).toBe(
      `${HOST}/admin/collections/posts/verify`
    )
  })

  it('redacts relative paths and keeps them relative', () => {
    expect(redactUrl('/admin/reset/secret123?x=1', ROUTES)).toBe(
      `/admin/reset/${REDACTED}?x=${REDACTED}`
    )
  })

  it('is idempotent', () => {
    const once = redactUrl(`${HOST}/admin/reset/secret123?token=abc#frag`, ROUTES)
    expect(once).toBeDefined()
    expect(redactUrl(once as string, ROUTES)).toBe(once)
  })

  it('returns undefined for values that cannot be parsed, never the original', () => {
    expect(redactUrl('http://[::1', ROUTES)).toBeUndefined()
  })

  it('redacts credentials when the path contains repeated slashes', () => {
    expect(redactUrl(`${HOST}//admin//reset//secret123`, ROUTES)).toBe(
      `${HOST}//admin//reset//${REDACTED}`
    )
    expect(redactUrl(`${HOST}//admin/users//verify/secret123`, ROUTES)).toBe(
      `${HOST}//admin/users//verify/${REDACTED}`
    )
  })

  it('fails closed for a scheme-like value without a host', () => {
    expect(redactUrl('localhost:3000/admin/reset/secret123', ROUTES)).toBeUndefined()
  })

  it('redacts credentials under a Next.js basePath prefix', () => {
    expect(redactUrl(`${HOST}/cms/admin/reset/secret123`, ROUTES)).toBe(
      `${HOST}/cms/admin/reset/${REDACTED}`
    )
    expect(redactUrl(`${HOST}/cms/admin/users/verify/secret123`, ROUTES)).toBe(
      `${HOST}/cms/admin/users/verify/${REDACTED}`
    )
  })

  it('does not redact a reset-like path without the Admin prefix', () => {
    expect(redactUrl(`${HOST}/blog/reset/secret123`, ROUTES)).toBe(`${HOST}/blog/reset/secret123`)
  })
})
