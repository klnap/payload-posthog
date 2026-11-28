'use client'

import { useAuth } from '@payloadcms/ui'
import { usePostHog } from '@posthog/next'
import { useEffect, useRef } from 'react'
import { flushRequestedOpen } from '../conversations/flush'
import { LAUNCHER_ATTRIBUTE } from '../conversations/launcher'
import { conversationsSdkState } from '../conversations/sdk-state'
import { getConversationsState, setConversationsState } from '../conversations/state'
import { fetchConversationsIdentity } from '../conversations/verify-identity'
import {
  ANONYMOUS_IDENTITY,
  type AnalyticsIdentityState,
  syncAnalyticsIdentity,
} from '../identity/analytics-identity'
import { payloadDistinctId } from '../identity/payload-distinct-id'
import { resolvePersonProperties } from '../identity/person-properties'

type Props = {
  identityCollections: readonly string[]
  identify: { properties: Record<string, string> } | null
  conversations: { endpoint: string; launcher: 'visible' | 'hidden' } | null
}

/**
 * Keeps PostHog identity aligned with the authenticated Payload user. It runs on every Admin
 * route, independent of route and authentication-flow classification. Analytics identity is
 * established first; the Conversations signature is requested only for that same distinct ID.
 */
export function PostHogIdentity({ identityCollections, identify, conversations }: Props) {
  const posthog = usePostHog()
  const { user } = useAuth()
  const consented =
    (posthog?.is_capturing() ?? false) && !(posthog?.has_opted_out_capturing() ?? true)
  // The trusted collection comes from Payload's authenticated user, so a user of any auth collection
  // is identified under its own collection. Unknown collections fail closed.
  const collection = (user as { collection?: string } | null)?.collection
  const distinctId =
    user?.id != null && collection && identityCollections.includes(collection)
      ? payloadDistinctId(collection, user.id)
      : null
  // Stable key: the collection list is fixed per provider, so its array identity must not drive effects.
  const collectionsKey = identityCollections.join(',')
  const properties = identify ? resolvePersonProperties(user, identify.properties) : {}
  const propertiesKey = JSON.stringify(properties)
  const analytics = useRef<AnalyticsIdentityState>(ANONYMOUS_IDENTITY)
  // Primitive keys keep effects stable across RSC refreshes that re-create prop objects.
  const identifyOn = identify !== null
  const conversationsOn = conversations !== null
  const conversationsEndpoint = conversations?.endpoint ?? ''
  const conversationsLauncher = conversations?.launcher ?? 'visible'

  useEffect(() => {
    if (!posthog || !identifyOn) return
    const target =
      consented && distinctId ? { distinctId, properties: JSON.parse(propertiesKey) } : null
    analytics.current = syncAnalyticsIdentity(
      {
        identify: (id, props) => posthog.identify(id, props),
        reset: () => posthog.reset(),
        get_distinct_id: () => posthog.get_distinct_id(),
      },
      analytics.current,
      target,
      collectionsKey.split(',')
    )
  }, [collectionsKey, consented, distinctId, identifyOn, posthog, propertiesKey])

  useEffect(() => {
    if (!posthog || !conversationsOn) return
    const sdk = posthog.conversations
    const allowed = distinctId !== null && consented
    const controller = new AbortController()
    const documentElement = document.documentElement

    setConversationsState({
      configured: true,
      consented: consented,
      identity: allowed ? 'pending' : 'none',
    })

    // Runs on every dependency change and on unmount: nothing from a previous user survives.
    const clear = () => {
      controller.abort()
      posthog.clearIdentity()
      sdk.hide()
      documentElement.removeAttribute(LAUNCHER_ATTRIBUTE)
      setConversationsState({ identity: 'none', openRequested: false })
    }

    if (allowed) {
      void (async () => {
        try {
          const identity = await fetchConversationsIdentity({
            endpoint: conversationsEndpoint,
            expectedDistinctId: distinctId,
            signal: controller.signal,
          })
          // Re-check at the async boundary: logout, account switch, or opt-out may have happened.
          if (
            !identity ||
            controller.signal.aborted ||
            !posthog.is_capturing() ||
            posthog.has_opted_out_capturing() ||
            posthog.get_distinct_id() !== identity.distinctId
          ) {
            throw new Error('identity rejected')
          }
          posthog.setIdentity(identity.distinctId, identity.hash)
          setConversationsState({ identity: 'verified' })
          if (conversationsLauncher === 'visible') {
            sdk.show()
            documentElement.setAttribute(LAUNCHER_ATTRIBUTE, 'visible')
          }
          flushRequestedOpen(sdk)
        } catch {
          // Identity failure leaves the CMS and every other PostHog feature usable.
          if (controller.signal.aborted) return
          clear()
          setConversationsState({ identity: 'failed' })
        }
      })()
    }

    const syncSdk = () => {
      const sdkState = conversationsSdkState(sdk)
      setConversationsState({ sdk: sdkState })
      // Identity can verify before the SDK loads, when show() is a no-op: show once it is ready.
      if (
        sdkState === 'ready' &&
        conversationsLauncher === 'visible' &&
        getConversationsState().identity === 'verified' &&
        !sdk.isVisible()
      ) {
        sdk.show()
      }
      flushRequestedOpen(sdk)
    }
    syncSdk()
    const unsubscribeFlags = posthog.onFeatureFlags(syncSdk)
    const unsubscribeEvents = posthog.on('eventCaptured', (event) => {
      if (
        event.event === '$conversations_loaded' ||
        event.event === '$conversations_widget_loaded'
      ) {
        syncSdk()
      }
    })

    return () => {
      unsubscribeFlags()
      unsubscribeEvents()
      clear()
    }
  }, [
    consented,
    conversationsEndpoint,
    conversationsLauncher,
    conversationsOn,
    distinctId,
    posthog,
  ])

  return null
}
