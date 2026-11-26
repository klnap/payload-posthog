import { describe, expect, it } from 'bun:test'
import {
  normalizeCaptureConfiguration,
  resolveCollectionCapture,
  resolveGlobalCapture,
} from './capture-config'

describe('capture configuration resolution', () => {
  it.each([
    ['plugin defaults are enabled without a prefix', undefined, 'posts', 'document_read'],
    ['prefix is literal on generated names', { prefix: 'app-' }, 'posts', 'app-document_read'],
  ])('%s', (_label, config, slug, expectedName) => {
    expect(resolveCollectionCapture(config, slug).events.read.name).toBe(expectedName)
  })

  it('keeps collection list reads and document reads separate', () => {
    const resolved = resolveCollectionCapture(undefined, 'posts')
    expect(resolved.events.listRead.name).toBe('collection_read')
    expect(resolved.events.read.name).toBe('document_read')
  })

  it('uses global event names and rejects collection-only operations at the type boundary', () => {
    const resolved = resolveGlobalCapture(undefined, 'settings')
    expect(resolved.events.read.name).toBe('global_read')
    expect(resolved.events.update.name).toBe('global_updated')
  })

  it.each([
    [
      'undefined inherits',
      undefined,
      [
        'create',
        'listRead',
        'read',
        'update',
        'delete',
        'duplicate',
        'publish',
        'unpublish',
        'trash',
        'restore',
        'versionsRead',
        'versionRead',
        'versionRestore',
        'draftSave',
        'publishSchedule',
        'unpublishSchedule',
        'scheduleCancel',
        'reorder',
        'drawerOpen',
      ],
      true,
    ],
    ['false disables defaults', false, [], true],
    [
      'true enables defaults',
      true,
      [
        'create',
        'listRead',
        'read',
        'update',
        'delete',
        'duplicate',
        'publish',
        'unpublish',
        'trash',
        'restore',
        'versionsRead',
        'versionRead',
        'versionRestore',
        'draftSave',
        'publishSchedule',
        'unpublishSchedule',
        'scheduleCancel',
        'reorder',
        'drawerOpen',
      ],
      true,
    ],
    ['empty operation array selects none', [], [], true],
    ['operation array selects exactly those operations', ['update'], ['update'], true],
  ] as const)('%s', (_label, operations, expected, isEnabled) => {
    const resolved = resolveCollectionCapture(
      { collections: { defaults: { operations } } },
      'posts'
    )
    expect(resolved.operations).toEqual(expected)
    expect(resolved.enabled).toBe(isEnabled)
  })

  it('treats empty config objects as inheritance and partial event maps as local changes', () => {
    const resolved = resolveCollectionCapture(
      {
        collections: {
          defaults: {},
          overrides: { posts: { events: { update: false } } },
        },
      },
      'posts'
    )
    expect(resolved.events.read.enabled).toBe(true)
    expect(resolved.events.update.enabled).toBe(false)
    expect(resolved.events.create.enabled).toBe(true)
  })

  it('lets explicit slug configuration work when category defaults are false', () => {
    const resolved = resolveCollectionCapture(
      {
        collections: {
          defaults: false,
          overrides: {
            posts: {
              events: { create: 'custom_created' },
            },
          },
        },
      },
      'posts'
    )
    expect(resolved.enabled).toBe(true)
    expect(resolved.events.read.enabled).toBe(false)
    expect(resolved.events.create).toMatchObject({ enabled: true, name: 'custom_created' })
  })

  it('limits category-default events to an exact defaults.operations array', () => {
    const resolved = resolveCollectionCapture(
      { collections: { defaults: { operations: ['read'] } } },
      'posts'
    )
    expect(resolved.operations).toEqual(['read'])
    expect(resolved.events.read.enabled).toBe(true)
    expect(resolved.events.create.enabled).toBe(false)
  })

  it('does not let a same-level event map escape an exact resource operations array', () => {
    const resolved = resolveCollectionCapture(
      {
        collections: {
          overrides: { posts: { operations: [], events: { create: true } } },
        },
      },
      'posts'
    )
    expect(resolved.operations).toEqual([])
    expect(resolved.events.create.enabled).toBe(false)
  })

  it('allows autosave when an exact operation array selects it', () => {
    const resolved = resolveCollectionCapture(
      { collections: { defaults: { operations: ['autosave'] } } },
      'posts'
    )
    expect(resolved.operations).toEqual(['autosave'])
    expect(resolved.events.autosave.enabled).toBe(true)
    expect(resolved.events.create.enabled).toBe(false)
  })

  it.each([
    ['false disables a resource', false, false, [], false],
    ['true enables eligible defaults', true, true, ['read'], true],
    [
      'an operation array selects exactly those operations',
      ['create', 'read', 'delete'],
      true,
      ['create', 'read', 'delete'],
      true,
    ],
  ] as const)(
    'resolves resource override form: %s',
    (_label, override, enabled, operations, readEnabled) => {
      const resolved = resolveCollectionCapture(
        {
          collections: {
            defaults: false,
            overrides: { posts: override },
          },
        },
        'posts'
      )
      expect(resolved.enabled).toBe(enabled)
      if (Array.isArray(override)) {
        expect(resolved.operations).toEqual(operations)
        expect(resolved.events.create.enabled).toBe(true)
        expect(resolved.events.update.enabled).toBe(false)
      } else if (override === true) {
        expect(resolved.events.read.enabled).toBe(readEnabled)
      } else {
        expect(resolved.operations).toEqual([])
        expect(resolved.events.read.enabled).toBe(false)
      }
    }
  )

  it('keeps a disabled parent category from being re-enabled by a resource', () => {
    const resolved = resolveCollectionCapture(
      {
        collections: {
          defaults: { enabled: false },
          overrides: { posts: true },
        },
      },
      'posts'
    )
    expect(resolved.enabled).toBe(false)
    expect(resolved.events.read.enabled).toBe(false)
  })

  it('keeps explicit event names unprefixed and resolves event options', () => {
    const resolved = resolveCollectionCapture(
      {
        prefix: 'payload_',
        collections: {
          overrides: {
            posts: {
              events: {
                update: {
                  name: 'host_document_changed',
                  properties: { source: 'admin' },
                  when: () => true,
                  sampleRate: 0.25,
                },
              },
            },
          },
        },
      },
      'posts'
    )
    expect(resolved.events.update).toMatchObject({
      enabled: true,
      name: 'host_document_changed',
      properties: { source: 'admin' },
      sampleRate: 0.25,
    })
  })

  it('inherits unspecified fields for the same event across category and slug settings', () => {
    const resolved = resolveCollectionCapture(
      {
        collections: {
          defaults: {
            events: { update: { sampleRate: 0.4, properties: { scope: 'category' } } },
          },
          overrides: {
            posts: { events: { update: { name: 'post_updated' } } },
          },
        },
      },
      'posts'
    )
    expect(resolved.events.update).toMatchObject({
      name: 'post_updated',
      sampleRate: 0.4,
      properties: { scope: 'category' },
    })
  })

  it('allows a resource event to re-enable a category event disabled by default', () => {
    const resolved = resolveCollectionCapture(
      {
        collections: {
          defaults: { events: { update: false } },
          overrides: { posts: { events: { update: true } } },
        },
      },
      'posts'
    )
    expect(resolved.events.update.enabled).toBe(true)
  })

  it('defaults autosave off while keeping other eligible defaults enabled', () => {
    const resolved = resolveGlobalCapture(undefined, 'settings')
    expect(resolved.events.autosave.enabled).toBe(false)
    expect(resolved.events.update.enabled).toBe(true)
  })

  it('allows an event boolean to enable an eligible default', () => {
    expect(
      resolveGlobalCapture(
        {
          globals: {
            overrides: { settings: { events: { autosave: true } } },
          },
        },
        'settings'
      ).events.autosave.enabled
    ).toBe(true)
  })

  it.each([
    ['invalid sample rate below zero', { sampleRate: -0.1 }, RangeError],
    ['invalid sample rate above one', { sampleRate: 1.1 }, RangeError],
    ['invalid event name', { name: 'not-valid' }, TypeError],
  ])('rejects %s', (_label, options, error) => {
    expect(() =>
      normalizeCaptureConfiguration({
        collections: { overrides: { posts: { events: { update: options } } } },
      })
    ).toThrow(error)
  })

  it('rejects unsupported operations and collection-only global events', () => {
    expect(() =>
      normalizeCaptureConfiguration({
        globals: { overrides: { settings: { operations: ['listRead'] } } },
      } as never)
    ).toThrow('unsupported operation')
    expect(() =>
      normalizeCaptureConfiguration({
        globals: { overrides: { settings: ['listRead'] } },
      } as never)
    ).toThrow('unsupported operation')
    expect(() =>
      normalizeCaptureConfiguration({
        globals: { overrides: { settings: { events: { listRead: true } } } },
      } as never)
    ).toThrow('unsupported event')
  })
})
