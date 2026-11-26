const collectionEventNames = [
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
  'autosave',
  'publishSchedule',
  'unpublishSchedule',
  'scheduleCancel',
  'reorder',
  'drawerOpen',
] as const

const globalEventNames = [
  'read',
  'update',
  'publish',
  'unpublish',
  'versionsRead',
  'versionRead',
  'versionRestore',
  'draftSave',
  'autosave',
  'publishSchedule',
  'unpublishSchedule',
  'scheduleCancel',
] as const

export type CollectionEventName = (typeof collectionEventNames)[number]
export type GlobalEventName = (typeof globalEventNames)[number]
type CaptureResourceType = 'collection' | 'global'
export type CaptureEventContext = Readonly<Record<string, unknown>>
export type CaptureProperties =
  | Readonly<Record<string, unknown>>
  | ((context: CaptureEventContext) => Readonly<Record<string, unknown>>)

export type CaptureEventOptions = {
  enabled?: boolean
  name?: string
  properties?: CaptureProperties
  when?: (context: CaptureEventContext) => boolean
  sampleRate?: number
}

export type CaptureEventSetting = boolean | string | CaptureEventOptions
type CollectionOperation = CollectionEventName
type GlobalOperation = GlobalEventName

type ResourceSettings<EventName extends string, Operation extends string> = {
  enabled?: boolean
  operations?: boolean | readonly Operation[]
  events?: Partial<Record<EventName, CaptureEventSetting>>
}

export type CollectionCaptureSettings = ResourceSettings<CollectionEventName, CollectionOperation>
export type GlobalCaptureSettings = ResourceSettings<GlobalEventName, GlobalOperation>

export type CaptureCategoryConfig<Settings, Operation extends string> = {
  /** `false` disables generated defaults, but does not block explicit slug overrides. */
  defaults?: boolean | Settings
  overrides?: Readonly<Record<string, Settings | boolean | readonly Operation[]>>
}

export type CaptureConfiguration = {
  /** Prepended literally to plugin-generated default event names only. */
  prefix?: string
  collections?: CaptureCategoryConfig<CollectionCaptureSettings, CollectionOperation>
  globals?: CaptureCategoryConfig<GlobalCaptureSettings, GlobalOperation>
}

type ResolvedCaptureEvent = {
  enabled: boolean
  name: string
  properties?: CaptureProperties
  when?: (context: CaptureEventContext) => boolean
  sampleRate: number
}

type ResolvedCaptureResource<EventName extends string, Operation extends string> = {
  enabled: boolean
  operations: readonly Operation[]
  events: Readonly<Record<EventName, ResolvedCaptureEvent>>
}

type ResolvedCollectionCapture = ResolvedCaptureResource<CollectionEventName, CollectionOperation>
type ResolvedGlobalCapture = ResolvedCaptureResource<GlobalEventName, GlobalOperation>

const collectionDefaults = collectionEventNames.filter(
  (eventName): eventName is CollectionEventName => eventName !== 'autosave'
)
const globalDefaults = globalEventNames.filter(
  (eventName): eventName is GlobalEventName => eventName !== 'autosave'
)
const reservedEventNames = new Set([
  '$pageview',
  '$pageleave',
  '$autocapture',
  '$exception',
  '$feature_flag_called',
  '$identify',
  '$groupidentify',
  '$create_alias',
  '$set',
  '$set_once',
  '$unset',
  '$delete',
  '$opt_in',
  '$opt_out',
])
const validEventName = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/

function assertEventName(name: string, path: string): void {
  if (!validEventName.test(name) || reservedEventNames.has(name)) {
    throw new TypeError(`${path} must be a non-reserved snake_case event name`)
  }
}

function assertSampleRate(rate: number, path: string): void {
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new RangeError(`${path} must be between 0 and 1`)
  }
}

function normalizeOperations<Operation extends string>(
  defaultsEnabled: boolean,
  defaultOperations: readonly Operation[],
  legalOperations: readonly string[],
  value: boolean | readonly Operation[] | undefined,
  path: string
): readonly Operation[] {
  if (value === undefined) return defaultsEnabled ? defaultOperations : []
  if (typeof value === 'boolean') return value ? defaultOperations : []
  for (const operation of value) {
    if (!legalOperations.includes(operation)) {
      throw new TypeError(`${path} contains unsupported operation "${operation}"`)
    }
  }
  return [...new Set(value)]
}

function normalizeEvents<EventName extends string>(
  names: readonly EventName[],
  defaultNames: readonly EventName[],
  categoryOperations: readonly EventName[] | undefined,
  resourceOperations: readonly EventName[] | undefined,
  prefix: string,
  resourceType: CaptureResourceType,
  defaultsEnabled: boolean,
  inheritedSettings: Partial<Record<EventName, CaptureEventSetting>> | undefined,
  overrideSettings: Partial<Record<EventName, CaptureEventSetting>> | undefined,
  parentDisabled: boolean,
  path: string
): Readonly<Record<EventName, ResolvedCaptureEvent>> {
  const entries = names.map((eventName) => {
    const inheritedSetting =
      categoryOperations && !categoryOperations.includes(eventName)
        ? false
        : inheritedSettings?.[eventName]
    const overrideSetting =
      resourceOperations && !resourceOperations.includes(eventName)
        ? false
        : overrideSettings?.[eventName]
    const inheritedOptions =
      inheritedSetting && typeof inheritedSetting === 'object' ? inheritedSetting : undefined
    const overrideOptions =
      overrideSetting && typeof overrideSetting === 'object' ? overrideSetting : undefined
    const explicitlyDisabled = overrideSetting === false || overrideOptions?.enabled === false
    const baseEnabled =
      (defaultsEnabled && defaultNames.includes(eventName)) ||
      categoryOperations?.includes(eventName) === true ||
      resourceOperations?.includes(eventName) === true
    let enabled = baseEnabled
    let name = `${prefix}${eventNameToDefaultName(eventName, resourceType)}`
    let properties = inheritedOptions?.properties
    let when = inheritedOptions?.when
    let sampleRate = inheritedOptions?.sampleRate ?? 1
    if (typeof inheritedSetting === 'string') name = inheritedSetting
    else if (inheritedOptions?.name) name = inheritedOptions.name

    if (explicitlyDisabled || parentDisabled) enabled = false
    else if (overrideSetting === true) enabled = true
    else if (typeof overrideSetting === 'string') {
      enabled = true
      name = overrideSetting
    } else if (overrideSetting && typeof overrideSetting === 'object') {
      enabled = overrideOptions?.enabled ?? inheritedOptions?.enabled ?? true
      name = overrideOptions?.name ?? inheritedOptions?.name ?? name
      properties = overrideOptions?.properties ?? inheritedOptions?.properties
      when = overrideOptions?.when ?? inheritedOptions?.when
      sampleRate = overrideOptions?.sampleRate ?? inheritedOptions?.sampleRate ?? sampleRate
    } else if (overrideSetting === false || inheritedSetting === false) {
      enabled = false
    } else if (overrideSetting === undefined && inheritedSetting === true) {
      enabled = true
    } else if (overrideSetting === undefined && typeof inheritedSetting === 'string') {
      enabled = true
      name = inheritedSetting
    } else if (overrideSetting === undefined && inheritedOptions) {
      enabled = inheritedOptions.enabled ?? true
      name = inheritedOptions.name ?? name
      properties = inheritedOptions.properties
      when = inheritedOptions.when
      sampleRate = inheritedOptions.sampleRate ?? sampleRate
    }

    assertSampleRate(sampleRate, `${path}.events.${eventName}.sampleRate`)
    return [eventName, { enabled, name, properties, when, sampleRate }] as const
  })
  return Object.fromEntries(entries) as Record<EventName, ResolvedCaptureEvent>
}

function eventNameToDefaultName(eventName: string, resourceType: CaptureResourceType): string {
  const snakeCase = eventName.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
  const collectionNames: Readonly<Record<string, string>> = {
    create: 'document_created',
    list_read: 'collection_read',
    read: 'document_read',
    update: 'document_updated',
    delete: 'document_deleted',
    duplicate: 'document_duplicated',
    publish: 'document_published',
    unpublish: 'document_unpublished',
    trash: 'document_trashed',
    restore: 'document_restored',
    versions_read: 'document_versions_read',
    version_read: 'document_version_read',
    version_restore: 'document_version_restored',
    draft_save: 'document_draft_saved',
    autosave: 'document_autosaved',
    publish_schedule: 'document_publish_scheduled',
    unpublish_schedule: 'document_unpublish_scheduled',
    schedule_cancel: 'document_schedule_cancelled',
    reorder: 'document_reordered',
    drawer_open: 'document_drawer_opened',
  }
  if (resourceType === 'collection') return collectionNames[snakeCase] ?? snakeCase
  const globalNames: Readonly<Record<string, string>> = {
    read: 'read',
    update: 'updated',
    publish: 'published',
    unpublish: 'unpublished',
    versions_read: 'versions_read',
    version_read: 'version_read',
    version_restore: 'version_restored',
    draft_save: 'draft_saved',
    autosave: 'autosaved',
    publish_schedule: 'publish_scheduled',
    unpublish_schedule: 'unpublish_scheduled',
    schedule_cancel: 'schedule_cancelled',
  }
  return `global_${globalNames[snakeCase] ?? snakeCase}`
}

function resolveResource<EventName extends string, Operation extends string>(
  names: readonly EventName[],
  defaultNames: readonly EventName[],
  prefix: string,
  categoryDefaults: boolean | ResourceSettings<EventName, Operation> | undefined,
  rawOverride: ResourceSettings<EventName, Operation> | boolean | readonly Operation[] | undefined,
  path: string,
  defaultOperations: readonly Operation[]
): ResolvedCaptureResource<EventName, Operation> {
  const categorySetting = typeof categoryDefaults === 'object' ? categoryDefaults : undefined
  let override: ResourceSettings<EventName, Operation> | undefined
  if (rawOverride === true) override = { enabled: true }
  else if (rawOverride === false) override = { enabled: false }
  else if (Array.isArray(rawOverride)) {
    override = { enabled: true, operations: rawOverride as readonly Operation[] }
  } else override = rawOverride as ResourceSettings<EventName, Operation> | undefined
  const defaultsEnabled = categoryDefaults !== false && categorySetting?.enabled !== false
  const hasOverride = override !== undefined && Object.keys(override).length > 0
  const parentDisabled = categorySetting?.enabled === false
  const enabled = parentDisabled ? false : (override?.enabled ?? (defaultsEnabled || hasOverride))
  const effectiveDefaults = parentDisabled
    ? false
    : override?.enabled === false || categoryDefaults === false
      ? override?.enabled === true
      : true
  const categoryOperations =
    categorySetting?.operations === false
      ? []
      : Array.isArray(categorySetting?.operations)
        ? (categorySetting.operations as readonly EventName[])
        : undefined
  const resourceOperations = Array.isArray(rawOverride)
    ? (rawOverride as readonly EventName[])
    : override?.operations === false
      ? []
      : Array.isArray(override?.operations)
        ? (override.operations as readonly EventName[])
        : undefined
  const overrideDefaults = resourceOperations ?? categoryOperations ?? defaultNames
  const operations = normalizeOperations(
    effectiveDefaults,
    defaultOperations,
    names,
    override?.operations ?? categorySetting?.operations,
    `${path}.operations`
  )
  const events = normalizeEvents(
    names,
    overrideDefaults,
    categoryOperations,
    resourceOperations,
    prefix,
    path.includes('.globals.') ? 'global' : 'collection',
    effectiveDefaults,
    categorySetting?.events,
    override?.events,
    parentDisabled || override?.enabled === false,
    path
  )
  return { enabled, operations, events }
}

function resolveCategoryDefaults<Settings>(
  defaults: boolean | Settings | undefined
): boolean | Settings {
  return defaults ?? true
}

export function resolveCollectionCapture(
  config: CaptureConfiguration | undefined,
  slug: string
): ResolvedCollectionCapture {
  const normalized = normalizeCaptureConfiguration(config)
  const category = normalized.collections
  return resolveResource(
    collectionEventNames,
    collectionDefaults,
    normalized.prefix ?? '',
    resolveCategoryDefaults(category?.defaults),
    category?.overrides?.[slug],
    `payload.capture.collections.overrides.${slug}`,
    collectionDefaults
  )
}

export function resolveGlobalCapture(
  config: CaptureConfiguration | undefined,
  slug: string
): ResolvedGlobalCapture {
  const normalized = normalizeCaptureConfiguration(config)
  const category = normalized.globals
  return resolveResource(
    globalEventNames,
    globalDefaults,
    normalized.prefix ?? '',
    resolveCategoryDefaults(category?.defaults),
    category?.overrides?.[slug],
    `payload.capture.globals.overrides.${slug}`,
    globalDefaults
  )
}

/** Validates configured names and sampling values without changing the caller's config. */
export function normalizeCaptureConfiguration(
  config: CaptureConfiguration = {}
): CaptureConfiguration {
  if (config.prefix !== undefined && typeof config.prefix !== 'string') {
    throw new TypeError('payload.capture.prefix must be a string')
  }
  for (const [categoryName, category, names] of [
    ['collections', config.collections, collectionEventNames],
    ['globals', config.globals, globalEventNames],
  ] as const) {
    const defaults = category?.defaults
    const defaultSettings = typeof defaults === 'object' && defaults !== null ? defaults : undefined
    const resources = [
      ['defaults', defaultSettings],
      ...Object.entries(category?.overrides ?? {}),
    ] as const
    for (const [resourceName, rawSettings] of resources) {
      const path = `payload.capture.${categoryName}.${resourceName}`
      if (Array.isArray(rawSettings)) {
        for (const operation of rawSettings) {
          if (!names.includes(operation as never)) {
            throw new TypeError(`${path} contains unsupported operation "${operation}"`)
          }
        }
        continue
      }
      if (typeof rawSettings !== 'object' || rawSettings === null) continue
      const settings = rawSettings as ResourceSettings<string, string>
      const configuredEvents = settings.events as
        | Readonly<Record<string, CaptureEventSetting | undefined>>
        | undefined
      for (const eventName of Object.keys(configuredEvents ?? {})) {
        const setting = configuredEvents?.[eventName]
        if (!names.includes(eventName as never)) {
          throw new TypeError(`${path}.events contains unsupported event "${eventName}"`)
        }
        if (typeof setting === 'string') assertEventName(setting, `${path}.events.${eventName}`)
        if (setting && typeof setting === 'object') {
          if (setting.name !== undefined)
            assertEventName(setting.name, `${path}.events.${eventName}.name`)
          if (setting.sampleRate !== undefined) {
            assertSampleRate(setting.sampleRate, `${path}.events.${eventName}.sampleRate`)
          }
        }
      }
      if (Array.isArray(settings.operations)) {
        for (const operation of settings.operations) {
          if (!names.includes(operation as never)) {
            throw new TypeError(`${path}.operations contains unsupported operation "${operation}"`)
          }
        }
      }
    }
  }
  return config
}
