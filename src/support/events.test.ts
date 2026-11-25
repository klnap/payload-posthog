import { afterEach, describe, expect, it } from 'bun:test'
import {
  getPostHogSupportLauncher,
  getPostHogSupportReady,
  getPostHogSupportStatus,
  POSTHOG_SUPPORT_READY_EVENT,
  POSTHOG_SUPPORT_STATUS_EVENT,
  setPostHogSupportLauncher,
  setPostHogSupportReady,
  setPostHogSupportStatus,
  subscribeToPostHogSupportReady,
  subscribeToPostHogSupportStatus,
} from './events'

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')

function installWindow() {
  const target = new EventTarget()
  Object.defineProperty(globalThis, 'window', { configurable: true, value: target })
  return target
}

function restoreWindow() {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
  else Reflect.deleteProperty(globalThis, 'window')
}

afterEach(restoreWindow)

describe('PostHog Support events', () => {
  it('stores status and notifies only when the status changes', () => {
    const target = installWindow()
    const statuses: unknown[] = []
    target.addEventListener(POSTHOG_SUPPORT_STATUS_EVENT, (event) => {
      statuses.push((event as CustomEvent).detail)
    })
    const loading = { state: 'loading', stage: 'sdk' } as const

    setPostHogSupportStatus(loading)
    setPostHogSupportStatus(loading)
    setPostHogSupportStatus({ state: 'ready' })

    expect(getPostHogSupportStatus()).toEqual({ state: 'ready' })
    expect(statuses).toEqual([loading, { state: 'ready' }])
  })

  it('subscribes to status changes and removes the listener on unsubscribe', () => {
    installWindow()
    let notifications = 0
    const unsubscribe = subscribeToPostHogSupportStatus(() => {
      notifications += 1
    })

    setPostHogSupportStatus({ state: 'ready' })
    unsubscribe()
    setPostHogSupportStatus({ state: 'disabled' })

    expect(notifications).toBe(1)
  })

  it('stores launcher and readiness for host-owned Support controls', () => {
    const target = installWindow()
    const readiness: unknown[] = []
    let notifications = 0
    target.addEventListener(POSTHOG_SUPPORT_READY_EVENT, (event) => {
      readiness.push((event as CustomEvent).detail)
    })
    const unsubscribe = subscribeToPostHogSupportReady(() => {
      notifications += 1
    })

    expect(getPostHogSupportLauncher()).toBe('visible')
    expect(getPostHogSupportReady()).toBe(false)
    setPostHogSupportLauncher('hidden')
    setPostHogSupportReady(true)

    expect(getPostHogSupportLauncher()).toBe('hidden')
    expect(getPostHogSupportReady()).toBe(true)
    expect(readiness).toEqual([true])
    unsubscribe()
    setPostHogSupportReady(false)
    expect(notifications).toBe(1)
  })

  it('keeps server rendering safe without a window', () => {
    restoreWindow()

    expect(getPostHogSupportStatus()).toEqual({ state: 'disabled' })
    expect(getPostHogSupportLauncher()).toBe('visible')
    expect(getPostHogSupportReady()).toBe(false)
    expect(() => {
      setPostHogSupportStatus({ state: 'ready' })
      setPostHogSupportLauncher('hidden')
      setPostHogSupportReady(true)
      subscribeToPostHogSupportStatus(() => {})()
      subscribeToPostHogSupportReady(() => {})()
    }).not.toThrow()
  })
})
