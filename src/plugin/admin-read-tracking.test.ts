import { describe, expect, it } from 'bun:test'
import {
  hasAdminReadCapture,
  resolveAdminReadEvent,
  shouldSampleAdminRead,
} from './admin-read-tracking'
import { resolveAdminViewCapture } from './capture-config'

const capture = resolveAdminViewCapture(undefined, ['posts', 'annual report'], ['settings'])

describe('resolveAdminReadEvent', () => {
  it('keeps the identity provider mounted for any enabled collection or global read', () => {
    const globalsOnly = resolveAdminViewCapture(
      {
        collections: { defaults: false },
        globals: { defaults: false, overrides: { settings: { events: { versionRead: true } } } },
      },
      ['posts'],
      ['settings']
    )
    expect(hasAdminReadCapture(globalsOnly)).toBe(true)

    const disabled = resolveAdminViewCapture(
      { collections: { defaults: false }, globals: { defaults: false } },
      ['posts'],
      ['settings']
    )
    expect(hasAdminReadCapture(disabled)).toBe(false)
  })

  it('classifies list, document, global, and version routes without exposing version IDs', () => {
    expect(resolveAdminReadEvent('/collections/posts', capture)).toMatchObject({
      event: { name: 'collection_read' },
      resourceSlug: 'posts',
      resourceType: 'collection',
      view: 'list',
    })
    expect(resolveAdminReadEvent('/collections/posts/[id]', capture)).toMatchObject({
      event: { name: 'document_read' },
      resourceSlug: 'posts',
      resourceType: 'collection',
      view: 'document',
    })
    expect(resolveAdminReadEvent('/globals/settings', capture)).toMatchObject({
      event: { name: 'global_read' },
      resourceSlug: 'settings',
      resourceType: 'global',
      view: 'global',
    })
    expect(resolveAdminReadEvent('/collections/posts/[id]/versions', capture)).toMatchObject({
      event: { name: 'document_versions_read' },
      resourceSlug: 'posts',
      resourceType: 'collection',
      view: 'versions',
    })
    expect(
      resolveAdminReadEvent('/collections/posts/[id]/versions/[version_id]', capture)
    ).toMatchObject({
      event: { name: 'document_version_read' },
      resourceSlug: 'posts',
      resourceType: 'collection',
      view: 'version',
    })
    expect(resolveAdminReadEvent('/globals/settings/versions', capture)).toMatchObject({
      event: { name: 'global_versions_read' },
      resourceSlug: 'settings',
      resourceType: 'global',
      view: 'versions',
    })
    expect(resolveAdminReadEvent('/globals/settings/versions/[version_id]', capture)).toMatchObject(
      {
        event: { name: 'global_version_read' },
        resourceSlug: 'settings',
        resourceType: 'global',
        view: 'version',
      }
    )
  })

  it('decodes only configured slugs and never returns a document ID', () => {
    expect(resolveAdminReadEvent('/collections/annual%20report', capture)).toMatchObject({
      resourceSlug: 'annual report',
      view: 'list',
    })
    expect(resolveAdminReadEvent('/collections/posts/secret-id', capture)).toBeNull()
  })

  it('rejects unknown resources, actions, nested routes, and malformed segments', () => {
    for (const route of [
      '/collections/unknown',
      '/collections/posts/create',
      '/collections/posts/[id]/versions/extra',
      '/collections/%ZZ',
      '/globals/settings/edit',
      '/custom-admin-route',
    ]) {
      expect(resolveAdminReadEvent(route, capture)).toBeNull()
    }
  })

  it('omits routes disabled by the resolved capture policy', () => {
    const disabled = resolveAdminViewCapture(
      {
        collections: { defaults: false },
        globals: { defaults: false },
      },
      ['posts'],
      ['settings']
    )
    expect(resolveAdminReadEvent('/collections/posts', disabled)).toBeNull()
    expect(resolveAdminReadEvent('/collections/posts/[id]', disabled)).toBeNull()
    expect(resolveAdminReadEvent('/globals/settings', disabled)).toBeNull()
  })

  it('samples consistently per identity, session, and route', () => {
    const sample = shouldSampleAdminRead(0.5, 'users:1', 'session-1', '/collections/posts/[id]')
    expect(sample).toBe(
      shouldSampleAdminRead(0.5, 'users:1', 'session-1', '/collections/posts/[id]')
    )
    expect(shouldSampleAdminRead(0, 'users:1', 'session-1', '/collections/posts')).toBe(false)
    expect(shouldSampleAdminRead(1, 'users:1', 'session-1', '/collections/posts')).toBe(true)
  })
})
