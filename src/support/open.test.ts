import { describe, expect, it } from 'bun:test'
import type { PostHog } from 'posthog-js'
import { getPostHogSupportStatus, setPostHogSupportStatus } from './events'
import type { PostHogSupportStatus } from './status'
import { openConversation } from './use-posthog-support'

async function withSupportWindow(run: () => Promise<void>): Promise<void> {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: new EventTarget(),
  })
  try {
    await run()
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor)
    else Reflect.deleteProperty(globalThis, 'window')
  }
}

function conversations({
  reason,
  available = false,
  visible = false,
  openSucceeds = true,
  onOpen,
}: {
  reason: ReturnType<PostHog['conversations']['getUnavailableReason']>
  available?: boolean
  visible?: boolean
  openSucceeds?: boolean
  onOpen?: () => void
}) {
  let isAvailable = available
  let isVisible = visible
  const api = {
    getUnavailableReason: () => (isAvailable ? null : reason),
    isAvailable: () => isAvailable,
    isVisible: () => isVisible,
    hide: () => {
      isVisible = false
    },
    open: () => {
      onOpen?.()
      if (openSucceeds) {
        isAvailable = true
        isVisible = true
      }
    },
  }
  return api as unknown as PostHog['conversations']
}

describe('openConversation', () => {
  it('blocks opening on a sensitive route', async () => {
    await withSupportWindow(async () => {
      setPostHogSupportStatus({ state: 'ready' })
      const sdk = conversations({ reason: 'initializing' })

      await expect(
        openConversation(sdk, { state: 'unavailable', reason: 'sensitive-route' }, () => false)
      ).resolves.toEqual({ state: 'unavailable', reason: 'sensitive-route' })
      expect(getPostHogSupportStatus()).toEqual({
        state: 'unavailable',
        reason: 'sensitive-route',
      })
    })
  })

  it('blocks Support immediately after consent revocation', async () => {
    await withSupportWindow(async () => {
      setPostHogSupportStatus({ state: 'ready' })
      let called = false
      const sdk = conversations({
        reason: 'initializing',
        onOpen: () => {
          called = true
        },
      })

      await expect(
        openConversation(
          sdk,
          { state: 'ready' },
          () => false,
          () => 'consent'
        )
      ).resolves.toEqual({ state: 'unavailable', reason: 'consent' })
      expect(called).toBe(false)
      expect(getPostHogSupportStatus()).toEqual({ state: 'unavailable', reason: 'consent' })
    })
  })

  it('cancels an open when navigation reaches a sensitive route', async () => {
    let routeIsSafe = true
    const sdk = conversations({
      reason: 'initializing',
      openSucceeds: false,
      onOpen: () => {
        routeIsSafe = false
      },
    })

    await expect(
      openConversation(
        sdk,
        { state: 'ready' },
        () => false,
        () => (routeIsSafe ? null : 'sensitive-route')
      )
    ).resolves.toEqual({ state: 'unavailable', reason: 'sensitive-route' })
  })

  it('blocks opening until identity is authorized', async () => {
    const sdk = conversations({ reason: 'initializing' })

    await expect(
      openConversation(sdk, { state: 'identity-pending' }, () => false)
    ).resolves.toEqual({ state: 'blocked', reason: 'identity-pending' })
    await expect(
      openConversation(sdk, { state: 'identity-required' }, () => false)
    ).resolves.toEqual({ state: 'blocked', reason: 'identity-required' })
    await expect(
      openConversation(sdk, { state: 'identity-error', reason: 'verification-failed' }, () => false)
    ).resolves.toEqual({ state: 'blocked', reason: 'identity-required' })
  })

  it('does not open when Conversations is disabled in the SDK config', async () => {
    await withSupportWindow(async () => {
      setPostHogSupportStatus({ state: 'ready' })
      let called = false
      const sdk = conversations({
        reason: 'disabled_by_config',
        onOpen: () => {
          called = true
        },
      })

      await expect(
        openConversation(sdk, { state: 'loading', stage: 'sdk' }, () => false)
      ).resolves.toEqual({
        state: 'blocked',
        reason: 'disabled',
      })
      expect(called).toBe(false)
      expect(getPostHogSupportStatus()).toEqual({ state: 'disabled' })
    })
  })

  it('starts opening while remote config is pending and reports success only when visible', async () => {
    let called = false
    const sdk = conversations({
      reason: 'remote_config_pending',
      onOpen: () => {
        called = true
      },
    })

    const result = await openConversation(
      sdk,
      { state: 'loading', stage: 'remote-config' },
      () => false
    )

    expect(called).toBe(true)
    expect(result).toEqual({ state: 'opened' })
  })

  it('does not open when remote configuration disables Support', async () => {
    let called = false
    const sdk = conversations({
      reason: 'disabled_in_project',
      onOpen: () => {
        called = true
      },
    })

    const result = await openConversation(
      sdk,
      { state: 'loading', stage: 'remote-config' },
      () => false
    )

    expect(called).toBe(false)
    expect(result).toEqual({ state: 'unavailable', reason: 'remote-disabled' })
  })

  it('reports domain-blocked widgets as unavailable instead of opened', async () => {
    const sdk = conversations({ reason: null, available: true, openSucceeds: false })

    const result = await openConversation(
      sdk,
      { state: 'ready' } satisfies PostHogSupportStatus,
      () => false
    )

    expect(result).toEqual({ state: 'unavailable', reason: 'widget-not-opened' })
  }, 5_000)

  it('rechecks the SDK instead of trusting a stale unavailable snapshot', async () => {
    const sdk = conversations({
      reason: 'load_failed',
      available: true,
    })

    const result = await openConversation(
      sdk,
      { state: 'unavailable', reason: 'sdk-failure' },
      () => false
    )

    expect(result).toEqual({ state: 'opened' })
  })

  it('observes readiness that changes after open starts', async () => {
    let available = false
    let visible = false
    const sdk = {
      getUnavailableReason: () => (available ? null : 'initializing'),
      isAvailable: () => available,
      isVisible: () => visible,
      open: () => {},
    } as unknown as PostHog['conversations']
    const readiness = setTimeout(() => {
      available = true
      visible = true
    }, 150)

    try {
      const result = await openConversation(sdk, { state: 'loading', stage: 'sdk' }, () => false)

      expect(result).toEqual({ state: 'opened' })
    } finally {
      clearTimeout(readiness)
    }
  })

  it('observes remote configuration disabling Conversations after pending', async () => {
    let reason: ReturnType<PostHog['conversations']['getUnavailableReason']> =
      'remote_config_pending'
    const sdk = {
      getUnavailableReason: () => reason,
      isAvailable: () => false,
      isVisible: () => false,
      open: () => {},
    } as unknown as PostHog['conversations']
    const remoteConfig = setTimeout(() => {
      reason = 'disabled_in_project'
    }, 150)

    try {
      const result = await openConversation(
        sdk,
        { state: 'loading', stage: 'remote-config' },
        () => false
      )

      expect(result).toEqual({ state: 'unavailable', reason: 'remote-disabled' })
    } finally {
      clearTimeout(remoteConfig)
    }
  })

  it('observes an SDK loading failure after initialization starts', async () => {
    let reason: ReturnType<PostHog['conversations']['getUnavailableReason']> = 'initializing'
    const sdk = {
      getUnavailableReason: () => reason,
      isAvailable: () => false,
      isVisible: () => false,
      open: () => {},
    } as unknown as PostHog['conversations']
    const loadFailure = setTimeout(() => {
      reason = 'load_failed'
    }, 150)

    try {
      const result = await openConversation(sdk, { state: 'loading', stage: 'sdk' }, () => false)

      expect(result).toEqual({ state: 'unavailable', reason: 'sdk-failure' })
    } finally {
      clearTimeout(loadFailure)
    }
  })

  it('stops waiting when the caller cancels an open operation', async () => {
    let checks = 0
    let hidden = false
    const sdk = {
      getUnavailableReason: () => 'initializing',
      isAvailable: () => false,
      isVisible: () => false,
      open: () => {},
      hide: () => {
        hidden = true
      },
    } as unknown as PostHog['conversations']

    await expect(
      openConversation(sdk, { state: 'loading', stage: 'sdk' }, () => ++checks > 1)
    ).resolves.toEqual({ state: 'loading' })
    expect(hidden).toBe(true)
  })
})
