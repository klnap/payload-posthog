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

  it('classifies version routes without retaining document or version IDs', () => {
    expect(
      resolveSafeAdminPageview(
        '/admin/collections/projects/doc-private/versions/version-private',
        '',
        '/admin',
        'https://cms.example.test'
      )
    ).toEqual({
      pathname: '/collections/projects/[id]/versions/[version_id]',
      resourceRoute: '/collections/projects/[id]/versions/[version_id]',
      url: 'https://cms.example.test/admin/collections/projects/[id]/versions/[version_id]',
    })
    expect(
      resolveSafeAdminPageview(
        '/admin/globals/site-settings/versions/version-private',
        '',
        '/admin',
        'https://cms.example.test'
      )
    ).toEqual({
      pathname: '/globals/site-settings/versions/[version_id]',
      resourceRoute: '/globals/site-settings/versions/[version_id]',
      url: 'https://cms.example.test/admin/globals/site-settings/versions/[version_id]',
    })
    expect(
      resolveSafeAdminPageview(
        '/admin/collections/projects/create',
        '',
        '/admin',
        'https://cms.example.test'
      )?.resourceRoute
    ).toBeNull()
  })

  it('attaches only numeric document and version IDs as read-event metadata', () => {
    expect(
      resolveSafeAdminPageview(
        '/admin/collections/projects/123',
        '',
        '/admin',
        'https://cms.example.test'
      )
    ).toMatchObject({ documentId: '123' })
    expect(
      resolveSafeAdminPageview(
        '/admin/collections/projects/123/versions/456',
        '',
        '/admin',
        'https://cms.example.test'
      )
    ).toMatchObject({ documentId: '123', versionId: '456' })
    expect(
      resolveSafeAdminPageview(
        '/admin/globals/site-settings/versions/456',
        '',
        '/admin',
        'https://cms.example.test'
      )
    ).toMatchObject({ versionId: '456' })
    expect(
      resolveSafeAdminPageview(
        '/admin/collections/projects/secret-document-id',
        '',
        '/admin',
        'https://cms.example.test'
      )
    ).not.toHaveProperty('documentId')
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
