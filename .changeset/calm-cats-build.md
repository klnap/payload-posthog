---
'@klnap/payload-posthog': minor
---

Replace the original API with a native-first Payload Admin integration for PostHog. The release adds authenticated identity mapping, browser and Payload Error Tracking, native Feature Flags with optional bootstrap, Session Replay privacy defaults, authenticated Conversations, and keyed or keyless diagnostics.

This release renames `PostHog()` to `postHog()`, replaces `payload.support` and `usePostHogSupport()` with the Conversations API, and removes guest tracking, authentication lifecycle events, Admin read tracking, and support-specific subpaths. Review the migration guide before upgrading.
