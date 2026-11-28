'use client'

import { usePostHogConversations } from '@klnap/payload-posthog/client'

export function SupportButton() {
  const { status, canOpen, isAvailable, open, close, show, hide } = usePostHogConversations()
  return (
    <section aria-label='Synthetic support controls'>
      <p id='support-status'>{`status=${status} canOpen=${canOpen} isAvailable=${isAvailable}`}</p>
      <button id='support-open' type='button' onClick={open}>
        Open support
      </button>
      <button id='support-close' type='button' onClick={close}>
        Close support
      </button>
      <button id='support-show' type='button' onClick={show}>
        Show support
      </button>
      <button id='support-hide' type='button' onClick={hide}>
        Hide support
      </button>
    </section>
  )
}
