import { describe, expect, it } from 'bun:test'
import {
  normalizeCaptureConfiguration,
  resolveAdminViewCapture,
  resolveCollectionCapture,
  resolveGlobalCapture,
} from './capture-config'

describe('capture configuration resolution', () => {
  it('enables only reliable Admin read-view events by default', () => {
    const collection = resolveCollectionCapture(undefined, 'posts')
    const global = resolveGlobalCapture(undefined, 'settings')

    expect(collection.operations).toEqual(['listRead', 'read'])
    expect(collection.events.listRead).toMatchObject({
      enabled: true,
      name: 'collection_read',
      sampleRate: 1,
    })
    expect(collection.events.read).toMatchObject({
      enabled: true,
      name: 'document_read',
      sampleRate: 1,
    })
    expect(global.operations).toEqual(['read'])
    expect(global.events.read).toMatchObject({ enabled: true, name: 'global_read' })
  })

  it('uses literal prefixes only for generated names and keeps custom names final', () => {
    const resolved = resolveCollectionCapture(
      {
        prefix: 'cms-',
        collections: {
          defaults: { events: { read: 'editor_opened' } },
          overrides: { articles: { events: { listRead: { name: 'custom_list' } } } },
        },
      },
      'articles'
    )

    expect(resolved.events.read.name).toBe('editor_opened')
    expect(resolved.events.listRead.name).toBe('custom_list')
    expect(resolveCollectionCapture({ prefix: 'cms-' }, 'posts').events.read.name).toBe(
      'cms-document_read'
    )
  })

  it('applies category defaults, resource overrides, operation arrays, and explicit disablement', () => {
    const resolved = resolveCollectionCapture(
      {
        collections: {
          defaults: { operations: ['read'] },
          overrides: {
            articles: { operations: ['listRead'], events: { listRead: true } },
          },
        },
      },
      'articles'
    )

    expect(resolved.operations).toEqual(['listRead'])
    expect(resolved.events.listRead.enabled).toBe(true)
    expect(resolved.events.read.enabled).toBe(false)
    expect(
      resolveCollectionCapture(
        { collections: { defaults: false, overrides: { articles: { events: { read: true } } } } },
        'articles'
      ).events.read.enabled
    ).toBe(true)
    expect(
      resolveCollectionCapture(
        { collections: { defaults: { enabled: false }, overrides: { articles: true } } },
        'articles'
      ).events.read.enabled
    ).toBe(false)
  })

  it('keeps autosave and every unsupported operation outside the public event contract', () => {
    expect(() =>
      normalizeCaptureConfiguration({
        collections: {
          defaults: { operations: ['autosave'] as never },
        },
      })
    ).toThrow('contains unsupported operation "autosave"')
    expect(() =>
      normalizeCaptureConfiguration({
        globals: { defaults: { events: { update: true } as never } },
      })
    ).toThrow('contains unsupported event "update"')
  })

  it('validates event names and sample rates', () => {
    expect(() =>
      normalizeCaptureConfiguration({
        globals: { defaults: { events: { read: '$pageview' } } },
      })
    ).toThrow('non-reserved snake_case event name')
    expect(() =>
      normalizeCaptureConfiguration({
        collections: { defaults: { events: { read: { sampleRate: 2 } } } },
      })
    ).toThrow('must be between 0 and 1')
    expect(() =>
      normalizeCaptureConfiguration({
        collections: {
          defaults: { events: { read: { properties: { reset_token: 'synthetic' } } } },
        },
      })
    ).toThrow('properties.reset_token is reserved or sensitive')
    expect(() =>
      normalizeCaptureConfiguration({
        collections: {
          defaults: { events: { read: { properties: { source: 'override' } } } },
        },
      })
    ).toThrow('properties.source is reserved or sensitive')
    expect(() =>
      normalizeCaptureConfiguration({
        collections: {
          defaults: {
            events: { read: { properties: { profile: { password: 'synthetic' } } } },
          },
        },
      })
    ).toThrow('properties.profile.password is reserved or sensitive')
  })

  it('resolves serializable capture settings for discovered resources only', () => {
    const resolved = resolveAdminViewCapture(
      {
        prefix: 'cms_',
        collections: {
          overrides: {
            posts: {
              events: {
                read: { name: 'post_opened', sampleRate: 0.25, properties: { area: 'cms' } },
              },
            },
          },
        },
      },
      ['posts'],
      ['settings']
    )

    expect(resolved.collections.posts.read).toEqual({
      enabled: true,
      name: 'post_opened',
      properties: { area: 'cms' },
      sampleRate: 0.25,
    })
    expect(resolved.collections.posts.listRead.name).toBe('cms_collection_read')
    expect(resolved.globals.settings.read.name).toBe('cms_global_read')
    expect(resolved.collections).not.toHaveProperty('unknown')
  })

  it('rejects invalid configuration at plugin setup', () => {
    expect(() =>
      normalizeCaptureConfiguration({
        collections: { defaults: { events: { read: 'Not Snake Case' } } },
      })
    ).toThrow('non-reserved snake_case event name')
  })
})
