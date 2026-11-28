/** Set on <html> only when the native launcher may be shown. Absent means hidden. */
export const LAUNCHER_ATTRIBUTE = 'data-payload-posthog-launcher'

/**
 * Hides the closed-state launcher: the button's direct parent (`buttonContainer`) inside
 * `#ph-conversations-widget-container`. The open panel renders no "Open chat" button, so the
 * selector does not match it. Verified against posthog-js 1.454.2 `conversations.js`.
 */
export const LAUNCHER_STYLESHEET = `html:not([${LAUNCHER_ATTRIBUTE}="visible"]) #ph-conversations-widget-container div:has(> button[aria-label^="Open chat"]) { display: none !important; }`
