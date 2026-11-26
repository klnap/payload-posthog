import type { AdminViewCaptureConfig, ResolvedAdminViewEvent } from './capture-config'

export type AdminReadEvent = {
  event: ResolvedAdminViewEvent
  resourceSlug: string
  resourceType: 'collection' | 'global'
  view: 'list' | 'document' | 'global'
}

export function resolveAdminReadEvent(
  routeTemplate: string,
  capture: AdminViewCaptureConfig
): AdminReadEvent | null {
  const segments = routeTemplate.split('/').filter(Boolean)

  if (segments[0] === 'collections' && (segments.length === 2 || segments.length === 3)) {
    const slug = decodeSegment(segments[1])
    if (!slug) return null
    const resource = capture.collections[slug]
    if (!resource) return null
    if (segments.length === 2) {
      return resource.listRead.enabled
        ? { event: resource.listRead, resourceSlug: slug, resourceType: 'collection', view: 'list' }
        : null
    }
    if (segments[2] !== '[id]') return null
    return resource.read.enabled
      ? { event: resource.read, resourceSlug: slug, resourceType: 'collection', view: 'document' }
      : null
  }

  if (segments[0] === 'globals' && segments.length === 2) {
    const slug = decodeSegment(segments[1])
    if (!slug) return null
    const event = capture.globals[slug]?.read
    return event?.enabled
      ? { event, resourceSlug: slug, resourceType: 'global', view: 'global' }
      : null
  }

  return null
}

export function shouldSampleAdminRead(
  sampleRate: number,
  distinctId: string,
  sessionId: string,
  routeKey: string
): boolean {
  if (sampleRate <= 0) return false
  if (sampleRate >= 1) return true
  let hash = 2166136261
  for (const character of `${distinctId}\0${sessionId}\0${routeKey}`) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  }
  return (hash >>> 0) / 0x1_0000_0000 < sampleRate
}

function decodeSegment(segment: string | undefined): string | null {
  if (!segment || segment === '[id]') return null
  try {
    const decoded = decodeURIComponent(segment)
    return decoded &&
      !/[/\\?#]/.test(decoded) &&
      ![...decoded].some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
      )
      ? decoded
      : null
  } catch {
    return null
  }
}
