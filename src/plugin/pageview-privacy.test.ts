import { describe, expect, it } from 'bun:test'
import { resolveSafeAdminPageview } from './pageview-privacy'

describe('resolveSafeAdminPageview', () => {
  it('removes query strings and document IDs from safe Admin pageviews', () => {
    expect(
      resolveSafeAdminPageview(
        '/studio/collections/projects/secret-document-id',
        '',
        '/studio',
        'https://cms.example.test'
      )
    ).toEqual({
      pathname: '/collections/projects/[id]',
      resourceRoute: '/collections/projects/[id]',
      url: 'https://cms.example.test/studio/collections/projects/[id]',
    })
  })

  it('preserves a Next base path while removing the concrete document ID', () => {
    expect(
      resolveSafeAdminPageview(
        '/docs/dashboard/globals/site-settings',
        '',
        '/dashboard',
        'https://cms.example.test'
      )
    ).toEqual({
      pathname: '/globals/site-settings',
      resourceRoute: '/globals/site-settings',
      url: 'https://cms.example.test/docs/dashboard/globals/site-settings',
    })
  })

  it('allows only numeric Payload pagination parameters and strips them from the event URL', () => {
    expect(
      resolveSafeAdminPageview(
        '/admin/collections/projects',
        'depth=1&limit=10',
        '/admin',
        'https://cms.example.test'
      )
    ).toEqual({
      pathname: '/collections/projects',
      resourceRoute: '/collections/projects',
      url: 'https://cms.example.test/admin/collections/projects',
    })
  })

  it('does not classify nested routes or create routes as resource views', () => {
    for (const pathname of [
      '/admin/collections/projects/secret-id/versions',
      '/admin/collections/projects/create',
    ]) {
      expect(
        resolveSafeAdminPageview(pathname, '', '/admin', 'https://cms.example.test')?.resourceRoute
      ).toBeNull()
    }
  })

  it.each([
    ['/admin/login', '', '/admin'],
    ['/admin/collections/projects', 'reset_token=canary', '/admin'],
    ['/admin/collections/projects', 'q=private-search', '/admin'],
    ['/admin/collections/projects/reset/secret-token', '', '/admin'],
    ['/admin/custom-view', '', '/admin'],
  ])('does not capture unsafe route %s', (pathname, search, adminPath) => {
    expect(
      resolveSafeAdminPageview(pathname, search, adminPath, 'https://cms.example.test')
    ).toBeNull()
  })

  it('does not mistake a similarly prefixed route for the Admin path', () => {
    expect(
      resolveSafeAdminPageview(
        '/administrator/collections/projects',
        '',
        '/admin',
        'https://cms.example.test'
      )
    ).toBeNull()
  })
})
