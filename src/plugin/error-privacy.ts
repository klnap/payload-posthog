import type { EventMessage } from 'posthog-node'

const safePropertyNames = new Set([
  '$exception_level',
  '$exception_list',
  '$http_method',
  '$request_method',
  '$session_id',
  '$window_id',
  'collection',
  'nextjs_error_digest',
  'nextjs_revalidate_reason',
  'nextjs_render_source',
  'nextjs_route_type',
  'nextjs_router_kind',
  'source',
  'status_code',
])

const safeIdentifier = /^[\w.$<>[\]#-]{1,128}$/
const safeHttpMethod = /^[A-Z]{1,16}$/
const safeRouteSegment = /^[\w[\].$-]{1,128}$/

export function sanitizeExceptionProperties(
  properties: Record<string | number, unknown>
): Record<string | number, unknown> {
  const safe: Record<string | number, unknown> = {}
  for (const [key, value] of Object.entries(properties)) {
    if (!safePropertyNames.has(key)) continue
    if (key === '$exception_list') {
      safe[key] = Array.isArray(value) ? value.slice(0, 50).map(sanitizeException) : []
    } else if (key === '$exception_level') {
      safe[key] = value === 'fatal' ? 'fatal' : 'error'
    } else if (key === 'source') {
      if (value === 'payload') safe[key] = value
    } else if (key === 'status_code') {
      if (typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599) {
        safe[key] = value
      }
    } else if (key === 'collection') {
      if (typeof value === 'string' && safeIdentifier.test(value)) safe[key] = value
    } else if (key === '$http_method' || key === '$request_method') {
      if (typeof value === 'string' && safeHttpMethod.test(value)) safe[key] = value
    } else if (typeof value === 'string' && safeIdentifier.test(value)) {
      safe[key] = value
    }
  }
  return safe
}

/** Appends the exception sanitizer to host handlers, preserving their order. */
type BeforeSendHandler<T, K extends 'beforeSend' | 'before_send'> = K extends keyof T
  ? NonNullable<T[K]> extends infer Value
    ? Value extends (infer Handler)[]
      ? Handler
      : Value
    : never
  : never

export function withSanitizedBeforeSend<T extends object, K extends 'beforeSend' | 'before_send'>(
  options: T | undefined,
  key: K
): Omit<T, K> & Record<K, BeforeSendHandler<T, K>[]> {
  const handlers = (options as (Record<K, unknown> & T) | undefined)?.[key]
  const host = handlers ? (Array.isArray(handlers) ? handlers : [handlers]) : []
  return { ...options, [key]: [...host, sanitizeExceptionEvent] } as Omit<T, K> &
    Record<K, BeforeSendHandler<T, K>[]>
}

export function sanitizeExceptionEvent(event: EventMessage): EventMessage | null {
  if (event.event !== '$exception') return event
  return {
    ...event,
    properties: sanitizeExceptionProperties(event.properties ?? {}),
  }
}

function sanitizeException(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object')
    return { type: 'Error', value: 'Exception details redacted' }
  const exception = value as Record<string, unknown>
  const type =
    typeof exception.type === 'string' && safeIdentifier.test(exception.type)
      ? exception.type
      : 'Error'
  const safe: Record<string, unknown> = {
    type,
    value: 'Exception details redacted',
  }
  if (exception.mechanism && typeof exception.mechanism === 'object') {
    const mechanism = exception.mechanism as Record<string, unknown>
    safe.mechanism = {
      ...(typeof mechanism.type === 'string' && safeIdentifier.test(mechanism.type)
        ? { type: mechanism.type }
        : {}),
      ...(typeof mechanism.handled === 'boolean' ? { handled: mechanism.handled } : {}),
    }
  }
  if (exception.stacktrace && typeof exception.stacktrace === 'object') {
    const stacktrace = exception.stacktrace as Record<string, unknown>
    const frames = Array.isArray(stacktrace.frames)
      ? stacktrace.frames.slice(0, 100).flatMap((frame) => {
          if (!frame || typeof frame !== 'object') return []
          const item = frame as Record<string, unknown>
          const sanitized: Record<string, unknown> = {}
          if (item.platform === 'node:javascript' || item.platform === 'web:javascript') {
            sanitized.platform = item.platform
          }
          if (typeof item.function === 'string' && safeIdentifier.test(item.function)) {
            sanitized.function = item.function
          }
          if (typeof item.filename === 'string') {
            const filename = item.filename.split(/[\\/]/).at(-1)
            if (filename && safeRouteSegment.test(filename)) sanitized.filename = filename
          }
          if (typeof item.lineno === 'number' && Number.isInteger(item.lineno) && item.lineno > 0) {
            sanitized.lineno = item.lineno
          }
          if (typeof item.colno === 'number' && Number.isInteger(item.colno) && item.colno > 0) {
            sanitized.colno = item.colno
          }
          if (typeof item.in_app === 'boolean') sanitized.in_app = item.in_app
          return [sanitized]
        })
      : []
    safe.stacktrace = { type: 'raw', frames }
  }
  return safe
}
