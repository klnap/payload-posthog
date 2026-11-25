import { describe, expect, it } from 'bun:test'
import {
  hasSensitiveQueryParameters,
  isGuestRouteTracked,
  isSafeAdminContentRoute,
  isSafeAdminSupportRoute,
  normalizeGuestRoute,
} from './guest-route-tracking'

describe('normalizeGuestRoute', () => {
  it('strips Payload admin prefixes and discards query and fragment data', () => {
    expect(
      normalizeGuestRoute('/studio/login?redirect=%2Freset%2Fsecret#token', '/studio')
    ).toEqual({
      pathname: '/login',
      route: '/login',
      authFlow: 'login',
      sensitive: true,
    })
  })

  it('redacts reset, invitation, and callback path secrets', () => {
    expect(normalizeGuestRoute('/admin/reset/short-secret', '/admin').route).toBe(
      '/reset/[redacted]'
    )
    expect(normalizeGuestRoute('/admin/invite/accept/secret', '/admin').route).toBe(
      '/invite/accept/[redacted]'
    )
    expect(normalizeGuestRoute('/admin/auth/callback/secret', '/admin').route).toBe(
      '/auth/callback/[redacted]'
    )
  })

  it('redacts 20+ character unbroken segments under any route, keeping normal slugs', () => {
    const token = 'abcdefghijklmnopqrstuvwx'
    const under = normalizeGuestRoute(`/admin/collections/${token}`, '/admin')
    expect(under.route).toBe('/collections/[redacted]')
    expect(under.sensitive).toBe(true)

    const custom = normalizeGuestRoute(`/admin/custom-view/${token}`, '/admin')
    expect(custom.sensitive).toBe(true)
    expect(custom.route).not.toContain(token)

    expect(normalizeGuestRoute('/admin/collections/annual-report-2026', '/admin').route).toBe(
      '/collections/annual-report-2026'
    )
  })

  it('redacts the segment that follows set-password and accept', () => {
    expect(normalizeGuestRoute('/admin/set-password/short', '/admin').route).toBe(
      '/set-password/[redacted]'
    )
    expect(normalizeGuestRoute('/admin/invite/accept/short', '/admin').route).toBe(
      '/invite/accept/[redacted]'
    )
  })

  it('marks native and IAM guest auth routes as sensitive', () => {
    for (const path of [
      '/login',
      '/bootstrap',
      '/sign-out',
      '/session-ended',
      '/reset-password',
      '/set-password',
      '/reset/token-value',
      '/invite/accept',
      '/forgot',
    ]) {
      expect(normalizeGuestRoute(`/admin${path}`, '/admin').sensitive).toBe(true)
    }
  })

  it('leaves ordinary Admin route templates intact', () => {
    expect(normalizeGuestRoute('/admin/collections/articles', '/admin').route).toBe(
      '/collections/articles'
    )
    expect(
      normalizeGuestRoute('/admin/collections/articles/0123456789abcdef01234567', '/admin').route
    ).toBe('/collections/articles/[id]')
  })

  it('detects sensitive query names and nested authentication redirects', () => {
    expect(hasSensitiveQueryParameters('token=encoded-secret')).toBe(true)
    expect(hasSensitiveQueryParameters('redirect=%2Fadmin%2Freset%2Fsecret')).toBe(true)
    expect(hasSensitiveQueryParameters('page=2&sort=title')).toBe(false)
  })

  it('allows replay and autocapture only on safe Payload content surfaces', () => {
    expect(
      isSafeAdminContentRoute(normalizeGuestRoute('/admin/collections/articles', '/admin'))
    ).toBe(true)
    expect(isSafeAdminContentRoute(normalizeGuestRoute('/admin/login', '/admin'))).toBe(false)
    expect(isSafeAdminContentRoute(normalizeGuestRoute('/admin/account/security', '/admin'))).toBe(
      false
    )
    expect(isSafeAdminContentRoute(normalizeGuestRoute('/admin/custom-view', '/admin'))).toBe(false)
    expect(
      isSafeAdminContentRoute(
        normalizeGuestRoute('/admin/collections/articles/0123456789abcdef01234567', '/admin')
      )
    ).toBe(false)
  })
})

describe('isGuestRouteTracked', () => {
  const guestPaths = ['/login', '/reset', '/accept-invitation']

  it('tracks configured public auth paths and their nested segments only', () => {
    expect(isGuestRouteTracked('/admin/login', '/admin', guestPaths)).toBe(true)
    expect(isGuestRouteTracked('/admin/reset/token-value', '/admin', guestPaths)).toBe(true)
    expect(isGuestRouteTracked('/admin/accept-invitation', '/admin', guestPaths)).toBe(true)
    expect(isGuestRouteTracked('/admin/collections/articles', '/admin', guestPaths)).toBe(false)
    expect(isGuestRouteTracked('/admin/loginx', '/admin', guestPaths)).toBe(false)
  })

  it('matches at the root when the Admin route is the site root', () => {
    expect(isGuestRouteTracked('/login', '/', guestPaths)).toBe(true)
    expect(isGuestRouteTracked('/', '/', guestPaths)).toBe(false)
  })
})

describe('isSafeAdminSupportRoute', () => {
  it('blocks sensitive routes and query parameters', () => {
    expect(
      isSafeAdminSupportRoute(normalizeGuestRoute('/admin/collections/users', '/admin'), '')
    ).toBe(true)
    expect(isSafeAdminSupportRoute(normalizeGuestRoute('/admin/reset/token', '/admin'), '')).toBe(
      false
    )
    expect(
      isSafeAdminSupportRoute(
        normalizeGuestRoute('/admin/collections/users', '/admin'),
        'token=secret'
      )
    ).toBe(false)
  })
})
