'use client'

import { usePostHog } from '@posthog/next'
import { useEffect, useState } from 'react'
import { SupportButton } from './SupportButton'

export function PostHogProbe() {
  const posthog = usePostHog()
  const [passwordType, setPasswordType] = useState<'password' | 'text'>('password')

  useEffect(() => {
    Object.assign(window, { __payloadPosthogProbe: posthog })
  }, [posthog])

  return (
    <section aria-label='Synthetic telemetry probe'>
      <SupportButton />
      <a href='/admin/reset/synthetic-snapshot-token-canary-1234567890' id='synthetic-initial-link'>synthetic initial link</a>
      <input aria-label='Synthetic text' defaultValue='synthetic-editorial-canary' />
      <textarea aria-label='Synthetic textarea' defaultValue='synthetic-textarea-canary' />
      <div aria-label='Synthetic rich text' contentEditable suppressContentEditableWarning>
        synthetic-rich-text-canary
      </div>
      <input
        aria-label='Synthetic password'
        type='password'
        defaultValue='synthetic-password-canary'
      />
      <input
        aria-label='Synthetic toggle password'
        type={passwordType}
        defaultValue='synthetic-toggle-password-canary'
      />
      <button
        onClick={() => setPasswordType((current) => (current === 'password' ? 'text' : 'password'))}
        type='button'
      >
        Toggle synthetic password
      </button>
    </section>
  )
}
