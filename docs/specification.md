# `@klnap/payload-posthog` Product and Technical Specification

**Status:** Authoritative architecture; implementation status is tracked per capability below.
**Product:** Native PostHog integration for Payload CMS. Zero configuration. Meaningful defaults. Full control.

## 1. Product scope

The package connects Payload Admin to native PostHog products and adds Payload-specific identity, resource context, and administrative event semantics. It does not replace PostHog SDKs or products.

In scope:

- Native browser Product Analytics, pageviews, pageleave, autocapture, Web Vitals, Feature Flags, Experiments, Surveys, Heatmaps, Session Replay, and browser Error Tracking where supported by the installed SDK.
- Payload Admin identity, safe guest tracking, resource-view analytics, administrative activity where a supported observation point proves the action, and authentication lifecycle tracking where an outcome is observable.
- Payload and Next.js Error Tracking through supported server hooks and instrumentation.
- Authenticated PostHog Conversations Support and official PostHog source-map tooling.
- Native Payload plugin interoperability, resource-local customization, typed options, and diagnostics.
- Best-effort delivery through native SDKs.

Out of scope:

- Public website CRUD/read analytics, arbitrary REST/GraphQL/Local API analytics, background job attribution, or security auditing.
- A custom analytics SDK, event bus, event registry, delivery queue, transactional outbox, audit database, dashboard, CMP, Replay engine, feature-flag system, or source-map uploader.
- DOM scraping, undocumented React contexts, monkey-patching, request interception, and replacement of native Admin components to infer activity.
- IAM-specific dependencies, automatic collection of complete documents, raw diffs, credentials, or sensitive form values.

## 2. Verified architecture and runtime boundaries

### Payload

The supported baseline is Payload `3.94.1` and `@payloadcms/ui` `3.94.1`; package peer ranges are recorded in `package.json`.

- The plugin uses the public `admin.components.providers` slot and Payload's import map to mount a provider in the Admin React tree.
- The provider can use public `@payloadcms/ui` hooks for current Admin authentication state and public Next.js routing hooks for route changes.
- Payload collection hooks expose operation types, request context, and errors, but no installed public semantic Admin event bus or general Admin-versus-Local-API provenance.
- `req.transactionID` identifies a transaction; it does not confirm commit.
- `afterChange` and `afterOperation` are not commit callbacks. They cannot by themselves justify a successful analytics event.
- Auth hooks expose server-side lifecycle points, but the shared authentication endpoint does not establish that its caller is the Admin.
- Global and collection `afterError` hooks observe selected routed errors and can alter responses. Integration callbacks must preserve response behavior and must not throw.
- `definePlugin`, plugin ordering, and `RegisteredPlugins` exist in the installed API. `RegisteredPlugins` and cross-plugin typing are experimental; discovery only sees registered plugins.

Evidence: installed declarations and implementation under `node_modules/payload/dist/`, especially `config/types.d.ts`, `config/build.js`, `config/definePlugin.js`, `collections/config/types.d.ts`, `auth/operations/login.js`, and `utilities/routeError.js`; current provider wiring in `src/plugin/posthog-plugin.ts`.

### Runtime ownership

- Browser-only logic belongs in the Admin provider and client entrypoints. No server SDK or server secret may enter browser bundles.
- Server capture uses the native `posthog-node` client and remains independent of Admin Product Analytics eligibility. `@posthog/next` owns a separate cached server client for its provider/flag APIs; it does not accept an injected `posthog-node` client.
- Next.js instrumentation is host-owned: the host composes the package functions into its single instrumentation entrypoint.
- `clientOptions` and `serverOptions` retain native SDK types. `@posthog/next` accepts partial `PostHogConfig` and `PostHogOptions`, but Payload provider props cannot carry function-valued callbacks. No verified module-reference contract currently forwards these callbacks.
- PostHog product availability and behavior can depend on project settings, credentials, consent policy, SDK configuration, and plan availability. Plugin configuration alone does not activate every product.
- Installed versions are `@posthog/next` `0.11.1`, `posthog-js` `1.454.2`, `posthog-node` `5.74.0`, `@posthog/nextjs-config` `1.12.2`, Payload `3.94.1`, and Next `16.4.6`. The declared Next peer floor is `16.4.5`; that exact version was not inspected.
- `posthog-js` and `posthog-node` expose native `captureException`; `@posthog/next` exposes request-error capture helpers. Its request handler supports server-side `beforeCapture`, disablement, and cookie-based consent; local-storage-only opt-out is not visible server-side.
- Next `onRequestError` does not cover Proxy failures in the inspected Next 16 API. It does not capture build/type errors or every caught exception.
- Native Replay options support input masking. The package now defaults `maskAllInputs: true` and keeps password masking enabled even when the host changes other mask options. Hosts can explicitly set `maskAllInputs: false`; that weakens protection and requires application-level review. The provider API cannot accept client callbacks through serialized Payload props, so field-by-field unmasking is not currently supported.
- The native `@posthog/next` `PostHogPageView` captures the full current URL including query values. The default Admin tracker therefore emits the native `$pageview` name itself with a route template, strips query/hash and document IDs, and suppresses custom, auth, sensitive, and queried routes. It enables autocapture only on supported routes and disables it on unsafe routes. Explicit native `clientOptions.capture_pageview` opts out of this pageview guard.
- Replay starts only after route, identity, and guest eligibility checks pass. Initialization disables recording before the first client effect; safe routes also require empty query strings.
- Existing SDK consent checks gate browser identity and Support. Server error consent requires the relevant opt-out cookie and is independently configured.

Context7 documentation lookup was attempted but the service returned its monthly quota limit. These decisions use the installed package source/declarations and repository code; Next `16.4.5` itself remains unverified.

## 3. Public contract

The minimal integration remains:

```ts
import { PostHog } from '@klnap/payload-posthog'
import { buildConfig } from 'payload'

export default buildConfig({
  plugins: [
    PostHog({
      apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY!,
    }),
  ],
})
```

The intended top-level contract is:

```ts
PostHog({
  apiKey,
  enabled,
  debug,
  clientOptions,
  serverOptions,
  bootstrapFlags,
  clientConfig,
  payload: {
    identify,
    capture,
    guestTracking,
    privacy,
    support,
  },
})
```

Only `apiKey` is required. Server-only secrets and options remain server-only. Runtime validation must reject invalid effective config with actionable messages and no secret values.

### Intended defaults

- Plugin, Product Analytics, pageviews/pageleave, autocapture with protection, eligible resource reads, authentication, and administrative activity are enabled.
- Autosave is supported but disabled for every collection/global unless opted in.
- Error Tracking, guest tracking, Feature Flag bootstrap, and Replay are enabled where SDK, runtime, consent, and privacy policy support them.
- Native Support is disabled unless its identity secret is configured.
- Event sampling is `1`, prefix is empty, diagnostics are off.
- Native product controls remain native SDK options; a plugin default does not guarantee PostHog project activation.

### Configuration inheritance

Supported configuration must use explicit per-field resolution, not an arbitrary deep merge. The precedence is:

1. Library defaults.
2. Category defaults.
3. Resource-local configuration.
4. Centralized resource overrides.
5. Event-specific settings resolved within the effective resource.
6. Runtime suppression and consent.
7. Mandatory privacy restrictions.

Semantics:

- `undefined` inherits; `false` disables its scope; `true` enables eligible defaults.
- Empty arrays select no operations. Operation arrays select exactly those operations.
- Empty objects preserve inherited values. Partial event maps change only named events.
- A custom event-name string enables that event and sets its final name.
- Event options enable and configure the event unless explicitly disabled.
- A disabled parent category cannot be re-enabled by child event config. `defaults: false` still permits explicit resource overrides.
- Predicates, property callbacks, and transforms are isolated: callback failure cannot affect a CMS operation.
- Sampling defaults to `1`; valid range is `[0, 1]`; disabled events stay disabled and sampling never bypasses privacy or consent.

The implementation and tests must confirm these rules before the public API is documented as final.

### Guest routes

`paths` replaces defaults; `addPaths` extends the effective list; `excludePaths` removes matches afterward. Normalize slashes and route bases from Payload config, support nested paths, and compare decoded path segments safely. Guest-route exclusions do not imply Replay permission. Sensitive routes and URL/query values must be sanitized independently.

## 4. Event naming, payload, and delivery

- Plugin-generated defaults use stable readable `snake_case`, with no mandatory `payload_` prefix.
- Optional `payload.capture.prefix` concatenates literally and applies only to default plugin event names.
- An explicit custom event name is final and receives no global prefix.
- Native PostHog event names and application-captured events are unchanged.
- No old/new duplicate event names are emitted.
- Reserved native event names are rejected for plugin event overrides where collision is ambiguous.
- Event names remain low-cardinality and never include resource IDs, user IDs, or dynamic slugs by default.
- Plugin-generated events include `{ source: 'payload' }`. Reserved identity, session, resource, and native properties cannot be overwritten by user properties or transforms.
- Event properties include only semantically available and safe values. No full documents, raw diffs, credential values, or private file paths are sent by default.
- SDK delivery is asynchronous/batched and best effort. Analytics failure never changes CMS operation success, failure, or exception propagation.
- No durable delivery, tamper-proof record, or transaction coupling is promised.

## 5. Event catalogue and verification state

Names below are the target default names. A name is not implemented merely because Payload exposes a hook. The implementation must have reliable semantics, provenance, and outcome evidence; unsupported automatic events remain absent and are called out in the final status.

### Collections

| Event | Meaning and gate |
|---|---|
| `collection_read` | One intentional Admin list view, not per returned document. |
| `document_read` | One intentional Admin document view, not a query, prefetch, relationship population, drawer duplicate, or rerender. |
| `document_created` | Confirmed Admin creation only. |
| `document_updated` | Confirmed Admin update only; never duplicates autosave. |
| `document_deleted` | Confirmed Admin deletion; permanent deletion uses metadata. |
| `document_duplicated` | Confirmed duplicate workflow. |
| `document_published` / `document_unpublished` | Explicit successful publication transition; status alone is insufficient. |
| `document_trashed` / `document_restored` | Confirmed trash/restore actions. |
| `document_versions_read` / `document_version_read` | Intentional version history and version views. |
| `document_version_restored` | Confirmed version restoration without redundant update event. |
| `document_draft_saved` / `document_autosaved` | Distinct manual save and autosave; autosave is opt-in. |
| `document_publish_scheduled` / `document_unpublish_scheduled` | Scheduling intent confirmed; execution is not attributed to the current Admin session. |
| `document_schedule_cancelled` | Confirmed schedule cancellation. |
| `document_reordered` | Confirmed reorder action, not generic update. |
| `document_drawer_opened` | Only if a public view lifecycle distinguishes it meaningfully from `document_read`. |

### Globals

| Event | Meaning and gate |
|---|---|
| `global_read` | Intentional global Admin view. |
| `global_updated` | Confirmed Admin global update. |
| `global_published` / `global_unpublished` | Explicit successful publication transition. |
| `global_versions_read` / `global_version_read` / `global_version_restored` | Intentional version operations with confirmed restore. |
| `global_draft_saved` / `global_autosaved` | Distinct manual save and autosave; autosave is opt-in. |
| `global_publish_scheduled` / `global_unpublish_scheduled` / `global_schedule_cancelled` | Scheduling or cancellation action, not background execution. |

### Authentication

| Event | Meaning and gate |
|---|---|
| `auth_flow_started` | Observable Admin authentication flow start. |
| `auth_login_succeeded` | Confirmed identity transition correlated to a recent supported Admin flow. |
| `auth_login_failed` | Only if a public outcome callback exposes failure without reading form contents. |
| `auth_logout_completed` | Confirmed identity reset/logout completion. |
| `auth_account_switched` | Confirmed transition between distinct authenticated identities. |
| `auth_password_reset_requested` / `auth_password_reset_completed` | Only where public flow outcome is observable; never capture token/form data. |
| `auth_account_activated` / `auth_email_verified` | Host/custom authentication integration or native manual event unless a reliable public lifecycle hook exists. |
| `auth_session_expired` / `auth_session_refreshed` | Track only meaningful confirmed lifecycle transitions; omit technical refresh noise by default. |

### Administrative activity

Semantic interactions use the `activity` category, not `admin`. Candidate defaults:

`admin_custom_view_viewed`, `admin_locale_changed`, `admin_language_changed`, `admin_search_performed`, `admin_filter_applied`, `admin_sort_changed`, `admin_pagination_changed`, `admin_columns_changed`, `admin_saved_filter_applied`, `admin_preview_opened`, `admin_live_preview_opened`, `admin_bulk_operation_completed`, `admin_validation_failed`, `admin_editing_conflict_detected`, `admin_document_lock_encountered`, `admin_import_started`, `admin_import_completed`, `admin_import_failed`, `admin_export_started`, `admin_export_completed`, `admin_export_failed`.

Each event is enabled only when a documented public API supplies its semantic outcome. Do not infer activity by scraping DOM, intercepting clicks, or replacing native controls. Native pageviews/autocapture cover generic interactions; do not emit redundant view events.

### Native events

PostHog-owned pageviews, pageleave, autocapture, Web Vitals, exceptions, Feature Flags, Experiments, Surveys, Heatmaps, Replay, and Conversations retain native names and semantics. They are not part of the plugin event catalogue.

## 6. Resource discovery, reads, and provenance

- The plugin discovers host collections/globals from the final config it receives. Native plugin ordering can expose resources from earlier plugin transforms; late-added resources may be missed.
- Admin route observation may support intentional list/document/global views when route identity is established from public routing and Payload config.
- React rerenders and Strict Mode must not duplicate a single view. Revisiting can produce another read.
- Prefetch, background fetches, relationship population, and public Website/API operations must not become Admin reads.
- Generic CRUD hooks are not automatically Admin-scoped. `req.user`, referer, cookies, user agent, client headers, and caller-provided context alone do not prove Admin origin.
- When origin or commit outcome is unknown, suppress the automatic success event.
- Operation context may suppress analytics or provide untrusted enrichment; it cannot force eligibility, assert Admin provenance, override trusted identity/session, or bypass privacy/consent.
- Bulk aggregate and affected-resource events are separate only when both add meaning and share a reliable operation correlation ID.

## 7. Identity, properties, and sessions

- Stable distinct ID: `<auth-collection>:<id>` (for example `users:123`). Never use mutable email.
- Browser identity resets on logout/account switch and avoids unsafe guest/auth routes.
- Person properties are explicit mappings from PostHog property names to Payload fields or typed resolvers. Never serialize a full user object.
- Multiple auth collections must remain namespaced. Missing or unsupported values are omitted; callbacks cannot break Admin rendering.
- Property categories are distinct: person properties describe a person; event properties describe one event; super properties are native SDK event-wide properties; session properties and reserved native properties retain SDK semantics.
- Event metadata may include applicable `source`, `collection`, `global`, `document_id`, `version_id`, `locale`, `admin_language`, `operation`, `view`, `draft`, `duration_ms`, `affected_count`, `auth_collection`, `schema_version`, and `$session_id`.
- Do not issue extra database reads solely to enrich events. Changed-field metadata may include permitted field names, never old/new values.
- Session correlation uses native SDK/session behavior where available. It is not an authorization signal.

## 8. Privacy, Replay, and consent

Mandatory credential protection covers passwords (including revealed values), OTPs, API keys, access/refresh tokens, invitation/reset secrets, session credentials, authentication headers, and equivalent explicitly sensitive data.

- Apply protections before the first recording snapshot. Delayed effects do not protect initial capture.
- Unknown inputs and custom components use conservative recording treatment until explicitly classified.
- Ordinary editorial values may be visible only when the application permits recording and the supported native masking mechanism can reliably distinguish them.
- Sensitive route protection and guest route matching are separate controls. Sanitize URLs before any telemetry and never send credential query values or secret route segments.
- Review each native channel independently: pageviews/pageleave, autocapture, Replay snapshots, network/console recording, heatmaps, events, person properties, exceptions, Support, and diagnostics.
- Use native PostHog privacy classes/options and native opt-in/opt-out APIs. Payload-specific restrictions can add protection but cannot remove mandatory restrictions.
- Consent policy belongs to the host/CMP. Browser opt-out does not imply server capture, Replay, exceptions, flags, or Support are automatically disabled.
- Verify with synthetic canaries in actual outbound telemetry. Never use production secrets or personal data in tests.

## 9. Native SDKs, Support, source maps, and instrumentation

- Use `@posthog/next`, `posthog-js`, and `posthog-node` directly; avoid duplicate initialization and duplicate pageviews.
- Native callbacks require a supported module/import-map boundary; never serialize functions or use `eval`.
- Browser and server custom event access remains native SDK access. No proprietary capture DSL or registry.
- Support remains optional, lazy-loaded, and uses server-side HMAC identity verification. Native Conversations events are not duplicated or copied into plugin events.
- Source maps remain the official optional `@posthog/nextjs-config` integration; credentials stay build/server-only.
- The sole package instrumentation exports are `registerPostHog` and `capturePostHogError`. The host owns `instrumentation.ts` and composes them with other instrumentation.
- Error Tracking is independent of Admin Product Analytics scope. Capture unexpected errors through native request-error handlers and Payload `afterError` where safe; filter expected validation/access/not-found/business errors by default where context allows.
- Error capture must not alter responses, exception propagation, startup, or CMS outcomes. Coverage is limited to verified runtimes and paths; caught errors require native manual capture.
- Instrumentation uses explicit/environment-based configuration, idempotent initialization, and native bounded delivery. No OpenTelemetry or proprietary global registry.

The official host composition target is:

```ts
import type { Instrumentation } from 'next'
import {
  registerPostHog,
  capturePostHogError,
} from '@klnap/payload-posthog/instrumentation'

export async function register() {
  await registerPostHog()
}

export const onRequestError: Instrumentation.onRequestError =
  async (...args) => {
    await capturePostHogError(...args)
  }
```

`@posthog/next` owns its own cached server client and does not accept a host client instance. Error instrumentation and the Payload provider therefore require one documented source of API key, host, enablement, and privacy configuration to avoid silent drift.

### Verified limitations

- Payload exposes no generic semantic Admin event bus. DOM clicks, field edits, validation UI, and arbitrary custom views cannot be captured reliably through a public universal observer.
- Generic collection hooks cannot prove Admin provenance or transaction commit. Automatic mutation success events are suppressed unless a supported view/workflow integration establishes both.
- Browser callback functions cannot cross the Payload server/client provider props. The proposed `clientConfig` module-reference API is not part of the public contract until a real import-map/client initialization path is proven.
- Field-by-field Replay unmasking is not currently supported. The safe default masks all form inputs, so ordinary editable values are not visible in recordings unless a host explicitly weakens the native masking policy.
- Native Node SDK clients are separately owned by Payload's provider integration and Next instrumentation; no injected-client API was found. The design must avoid unnecessary third clients and disclose configuration ownership.
- Next 16 request-error instrumentation does not report Proxy failures through the inspected handler.
- Payload plugin order/`RegisteredPlugins` typing is experimental in the verified version. Ordering is a discovery convention, not a guarantee against later plugins.

## 10. Diagnostics and performance

`debug` defaults to `false`. When enabled, diagnostics may report initialization, discovered resources, registered integrations, effective feature states, route classification, identity/session availability, suppression reason codes, and callback failures.

Never log documents, raw events, user records, credentials, tokens, cookies, sensitive URLs, or secret values. Disabled mode has minimal overhead.

Requirements:

- No tables, extra queries, unbounded memory, custom queues, or blocking PostHog network calls in CMS mutation paths.
- Native SDK batching, bounded deduplication, deterministic sampling, one client per supported runtime ownership model.
- PostHog/network/SDK/callback failures do not change CMS operation results.
- Document best-effort delivery, sampling impact on funnels/activity completeness, retention limits, product settings, and high-volume tuning.

## 11. TypeScript and package surface

Use Payload's native plugin/config types and installed native PostHog option types. Type event contexts by runtime and operation; do not expose server documents or request objects to client callbacks. Resource-specific typing should use generated Payload types where practical without requiring duplicate slug declarations.

Planned public entrypoints:

- Root: `PostHog`, public config types, `payloadDistinctId`.
- `/client`: client hooks, including Support.
- `/admin`: import-map provider/components.
- `/instrumentation`: exactly `registerPostHog`, `capturePostHogError`.
- `/next-config`: native source-map integration.
- `/server`: only if native shared-client access is needed and proven not already provided.

Audit `/support` and `/support/server`; retain only real consumer contracts. Check packed package boundaries and prevent server modules/credentials from entering client bundles.

## 12. Acceptance and evidence

The final implementation must test config resolution, prefix/name behavior, resource/event defaults, sampling, callback isolation, privacy precedence, identity reset, duplicate read suppression, operation suppression, plugin interoperability, native option typing, exports, build, package packing, and documentation examples.

Runtime tests must inspect actual browser/server telemetry with synthetic canaries for the relevant privacy channels. Mocks alone do not establish runtime privacy or lifecycle behavior.

Every event and capability must be classified in the final coverage matrix as **verified**, **conditional**, **manual/native**, or **unsupported**, with evidence and trigger semantics. A Payload hook alone does not qualify as proof of a committed, Admin-originated action.

Product Analytics and PostHog Activity Logs are best-effort, mutable analytics with product retention/access policies. They are not formal Security Audit Logs, immutable records, or tamper-proof evidence.

### Initial implementation status

The repository currently implements native Admin provider setup, privacy-filtered native `$pageview` events, safe-route autocapture gating, authenticated identity, guest route/auth-flow tracking, Session Replay route gating, authenticated Support, source-map re-export, and opt-in Next.js request-error instrumentation. Replay masks all inputs by default and always masks password input types. The capture configuration types and resolver exist, but no resource/activity event emitter consumes them yet; configuring `payload.capture` emits no events. Automatic resource reads, mutations, broader Admin activity, and Payload `afterError` integration remain unsupported. The pageview/autocapture guards lack live outbound telemetry verification.
