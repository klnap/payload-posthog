# Changelog

## 0.3.0

### Minor Changes

- 0ec417b: Require `posthog-node` 6 and use its current exception-capture API. Update outdated PostHog SDK and development dependency versions.

## 0.2.1

### Patch Changes

- 74a11c9: Improve the README with clearer feature coverage, simpler installation and configuration examples, composable Next.js instrumentation, production source-map upload guidance, separate ingestion and management API hosts, and consistent environment examples.

## 0.2.0

### Minor Changes

- 26c5af3: Replace the original API with a native-first Payload Admin integration for PostHog. The release adds authenticated identity mapping, browser and Payload Error Tracking, native Feature Flags with optional bootstrap, Session Replay privacy defaults, authenticated Conversations, and keyed or keyless diagnostics.

  This release renames `PostHog()` to `postHog()`, replaces `payload.support` and `usePostHogSupport()` with the Conversations API, and removes guest tracking, authentication lifecycle events, Admin read tracking, and support-specific subpaths. Review the migration guide before upgrading.

## [0.1.1] - 2026-11-25

Released through GitHub Actions with npm provenance. The code is unchanged from 0.1.0.

## [0.1.0] - 2026-11-25

- Initial release: native PostHog integration for Payload Admin, built on `@posthog/next`. Covers identity, authentication lifecycle events, guest routes, Session Replay rules for guests, authenticated Support, and source-map upload.
