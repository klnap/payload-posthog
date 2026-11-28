# @klnap/payload-posthog: technical specification

Native PostHog integration for Payload CMS. The plugin implements what is specific to Payload. Everything else is PostHog's native SDK behavior.

## 1. Versions verified

Payload and `@payloadcms/ui` 3.94.1, `@posthog/next` 0.11.1 (`@posthog/react`, `@posthog/core` as bundled), `posthog-js` 1.455.4, `posthog-node` 6.2.0, `@posthog/nextjs-config` 1.12.2, Next.js 16.4.5 (the fixture's declared version; `next dev` runs used 16.4.6).

## 2. Scope

- Telemetry runs inside the Payload Admin provider (`admin.components.providers`) for every Admin view, independent of authentication state and of the route. Custom Admin base paths and nested custom views are inside this scope.
- Arbitrary Next.js routes outside the Admin provider are not instrumented.
- The package does not classify routes, does not gate telemetry by route or authentication flow, and does not start or stop Replay or autocapture.

## 3. Provider and SDK ownership

- One `PostHogProvider` from `@posthog/next` (`PostHogAdminProvider`). `usePostHog()` returns the single browser instance.
- `clientOptions` are passed to the provider. Initialization, sessions, persistence, consent, remote configuration, Replay, autocapture, and exception capture belong to posthog-js.
- Defaults the plugin sets, each overridable by an explicit host value:
  - `capture_pageview: false` (the pageview owner is the plugin's `PostHogPageView`; see §5).
  - `save_referrer: false`, `save_campaign_params: false`: referrers and campaign values can carry a previous page's query values.
  - `disable_capture_url_hashes: true`.
  - `session_recording.maskAllInputs: false` and `session_recording.maskInputOptions.password: true`. The password setting is forced even when the host overrides other masking options. Host keys such as `maskTextSelector` are preserved.
  - `disable_conversations: true` unless `payload.conversations` is configured.
- Not set by the plugin: `autocapture`, `disable_session_recording`, `capture_exceptions`. These keep posthog-js and project defaults.
- `serverOptions` and `bootstrapFlags` pass to `@posthog/next`. Function-valued options are rejected at configuration time because they cannot cross Payload's serialized provider props.

## 4. Identity

- Canonical distinct ID: `<collection>:<id>`, from the authenticated Payload user returned by `useAuth()`. The collection must be one of the configured auth collections. Identity is independent of the authentication implementation and login routes.
- Analytics identity (`src/identity/analytics-identity.ts`): `identify(id, mappedProperties)` for the signed-in user. `reset()` before identifying a different user, on logout, and for a persisted Payload identity without a signed-in user. Nothing repeats when identity and mapped properties are unchanged.
- Person properties (`src/identity/person-properties.ts`): dotted paths, `[]` projection, own-property traversal only, prototype keys rejected, primitives and primitive arrays, and credential-like paths rejected at configuration. Relationships are never populated or queried.
- Conversations identity (`src/plugin/posthog-identity.tsx`, `src/conversations/verify-identity.ts`): runs after analytics identity, fetches the server-signed identity, applies it only when the request was not aborted, consent still allows capture, and the analytics distinct ID equals the signed one.
- Consent: `consented` is read at render and rechecked before applying a Conversations identity. Consent changes take effect on the next render. posthog-js 1.454.2 exposes no public opt-out event, so no subscription is possible.
- Session expiry: a session that expires without a React render or auth-state change is not detected until the next render or reload. The endpoint checks the session only on a new request.

### Verified in packed consumer runtimes

- Login, logout, account switching, custom authentication views, and stale identity responses were exercised with synthetic users. Identity used `<auth-collection>:<id>` and only the active user's mapped properties.
- The browser uses the same `resolvePersonProperties` resolver as server diagnostics. Payload's `/me` response and `useAuth()` provide the mapped user data; missing and unsupported fields are omitted.

Session expiry without a subsequent render or reload remains unobserved until the next identity check.

## 5. Pageviews

- Default (`capture_pageview` omitted): the plugin mounts `PostHogPageView` from `@posthog/next` with `captureRouteTemplate`. It captures `$pageview` on load and on client navigation, with `$route` (for example `/admin/[...segments]/`) and `$current_url` (full URL).
- `capture_pageview: true`: posthog-js captures pageviews; the plugin mounts nothing.
- `capture_pageview: false`: no pageviews.
- Observed: one `$pageview` per navigation in the packed production build.

Native URL behavior: `$current_url` includes the path and query. Password-reset tokens in the path reach the pageview event (see §8).

## 6. Session Replay and autocapture

- Native. The plugin does not start or stop recording. Recording and autocapture follow the SDK, the project settings, and the host's options.
- Observed in the packed production build: decoded replay snapshots contained the text, textarea, and rich-text canaries (defaults permit them), and did not contain the password-input canaries; masked `*` runs were present.
- Observed in the packed production fixture after correcting its deterministic remote-config response: trusted clicks produced `$autocapture` events. This verifies the SDK path in the fixture, not a live PostHog project.

## 7. Error tracking

- Browser: native `capture_exceptions`. Observed: an uncaught exception's message reached the sink (`$exception`).
- Server: `payload.afterError` hook with `posthog-node`. Expected HTTP 4xx errors are not sent. `shouldCapture` runs after that check. The hook's errors are caught and do not change the response. The actor is the trusted `req.user` collection and ID, falling back to the Admin user collection. Sanitization (`src/plugin/error-privacy.ts`) keeps an allowlist of event properties and redacts exception values.
- Next.js: `registerPostHog` and `capturePostHogError` wrap `@posthog/next` `createOnRequestError` with the same sanitization. The host composes them into its instrumentation.
- Not implemented: correlation of server errors with browser session IDs. The package has no verified transport for a session ID.

## 8. URL privacy

### Contract

- Every query parameter value is replaced with `[REDACTED]`; names and order are kept, and repeated names are kept.
- Fragments are removed. Username and password in the authority are removed.
- Native Payload credential paths are redacted: the segment after `<admin>/<admin.routes.reset>/` (`forgotPassword.js` builds `${admin.routes.reset}/${token}`) and after `<admin>/<collection>/verify/` (`sendVerificationEmail.js`). The Admin route and reset route names come from the server config (`routes.admin`, `admin.routes.reset`) and are passed to the client as serializable props.
- Document IDs (ASCII) and ordinary ASCII paths are unchanged. Paths are re-serialized by the WHATWG URL parser, so spaces and non-ASCII characters are percent-encoded (`/docs/a b` becomes `/docs/a%20b`), and dot segments are resolved (`/a/../b` becomes `/b`). No UUID, length, or entropy heuristics are used.
- Unparseable URL values are dropped, never passed through.
- Redaction is idempotent and never mutates the original event.

Implementation: `src/redaction/url-redaction.ts` (URL), `src/redaction/event-redaction.ts` (events), `src/redaction/install.ts` (installation).

### Installation

`installNativeUrlRedaction` runs during the render of the plugin's client component, inside the provider. `@posthog/next` initializes the SDK during its own render, and children render after it, so the handler is set before any child effect. `maskAttributeFn` is set in the same `set_config` call. A host `maskAttributeFn` set earlier through `set_config` still runs, on the redacted value. The handler is set with `posthog.set_config({ before_send })`. posthog-js reads `before_send` at capture time (`this.config.before_send` in `Ds()`), so the handler applies to every later capture and to `$set_once` properties. The serialized provider props carry no function.

### Coverage

| Surface | Source | Covered by | Verified |
| --- | --- | --- | --- |
| `$current_url`, `$pathname` | pageview, identify, feature flags | `before_send`, URL keys | Canary navigations: reset token, verify token, query values, fragment absent from every decoded event. |
| `$referrer`, `$initial_referrer`, `$session_entry_url` | referrer attribution | `before_send`, URL keys | Pageviews after credential navigation carry no canary. |
| `$set`, `$set_once` | identify, first-visit attribution | `before_send`, nested | Scanned in the same sink data. |
| `$elements[].attr__href`, `attr__src`, `attr__action`, `attr__formaction`, `attr__poster` | autocapture element chains | `before_send` | Unit-tested. Autocapture did not fire in the fixture, so no runtime evidence. Other attributes are not rewritten. |
| Replay meta `data.href` (type 4) | `$snapshot_data` | `before_send` | Replay meta hrefs are `[REDACTED]` in the sink. |
| Replay custom `$url_changed` (type 5) | `$snapshot_data` | `before_send` | Caught and fixed during verification: the login redirect carried the query canary before this rule existed. Absent after the fix. |
| Replay network timing (type 6, `rrweb/network@1`) | `$snapshot_data` | `before_send` | Unit-tested. Not exercised by the fixture's traffic. |
| Replay incremental DOM mutations (type 3) | plain objects in `$snapshot_data` | `before_send`, URL attributes | Unit-tested. A live probe saw type 3 items as plain objects at `before_send`. |
| Replay full snapshots (type 2): URL attributes (`href`, `src`, `action`, `formaction`, `poster`) | gzip-compressed string inside each `$snapshot_data` item | native `maskAttributeFn` | Verified: fresh load and returning load (persisted remote config). A reset-token link decoded to `…/reset/[REDACTED]`; no raw canary in either. Recordings that start before the plugin installs are not covered (see limitations). |
| Replay full snapshots (type 2): other DOM content | same | not rewritten | Text, input values (per masking options), and other attributes are recorded as configured by the host. |
| Exception messages | `$exception_list` | none | Sent as thrown. Documented. |
| Local SDK persistence | `$client_session_props`, `$initial_person_info` | not rewritten | Raw values observed locally. See limitations. |
| Campaign values (`$initial_utm_*`, `$session_entry_utm_*`) | only with host `save_campaign_params: true` | not rewritten | Default `false`. Flattened keys match no URL key. |
| Logs pipeline | separate `beforeSend` | not covered | The plugin does not enable logs; not verified. |

### Native masking (`mask_personal_data_properties`, `custom_personal_data_properties`)

- Defaults: `mask_personal_data_properties: true`, `disable_capture_url_hashes: true`, and `custom_personal_data_properties` merged from the built-in list and host names (host names first, deduplicated, host array not mutated).
- Matching in posthog-js 1.454.2 (`co()`): exact, case-sensitive comparison of the text before `=`. No normalization, wildcards, or substring matching. Only listed names are masked, as `<masked>`. Verified in the fresh profile: `token=<masked>` in persisted attribution, while an unlisted `search` value was stored raw.
- Built-in list: canonical snake_case names (`src/redaction/sensitive-parameters.ts`) expanded to snake, camel, Pascal, kebab, SCREAMING_SNAKE, and SCREAMING-KEBAB spellings. Mixed-case spellings such as `Access_TOKEN` are not derived and not covered natively.
- Plugin-owned redaction does not depend on names: every query value is redacted, so case and separator handling does not change the outcome. Name normalization would only matter for a decision that does not redact all values, and none exists.
- Surfaces that honor this option: persisted initial attribution (`$initial_person_info` and the session props built from it). It does not change event `$current_url`, which the plugin redacts.
- This is URL parameter masking only. It does not sanitize arbitrary event properties, person properties, exception messages, request or response bodies, or Replay DOM content.

### Upstream limitations

- Local persistence: the SDK stores the entry URL of the session, and the first-visit attribution, in local storage. Values are stored before `before_send` runs. The raw reset token and unlisted query values were found in local storage. This is the class of issue reported as https://github.com/PostHog/posthog-js/issues/5362; the local observation is in posthog-js 1.454.2. Browsers with that storage can expose these values to local scripts. The plugin does not patch storage.
- Parameter names are retained by design, so a name can reveal the kind of value that was sent.
- Fragment, path, and query redaction cover PostHog's own URL properties. URLs inside custom events sent through `posthog.capture` are not rewritten. Exception messages, element text, element attributes other than `href`, and request bodies are not covered.
- A host `posthog.set_config({ before_send })` replaces the handler array, which removes the plugin's redaction. posthog-js's `set_config` replacement semantics were read from the source, not exercised at runtime.
- Recordings that start before the plugin's render-time installation (for example a recorder started during `posthog.init` from persisted state) may not apply `maskAttributeFn` to their full snapshots. Not reproduced on the returning load tested here; the start-timing path is not exhaustively verified.
- With host `clientOptions.capture_pageview: true`, posthog-js schedules its own pageview after init. If React yields before the plugin's render-time installation, that pageview is not redacted. The default (plugin-owned pageview) is not affected.
- Full snapshots keep their non-URL DOM content. Text, input values, and other attributes are recorded according to the host's masking options.
- Next.js `basePath` is handled by matching the Admin prefix at any offset. A path that does not contain the Admin route is not redacted.

## 9. Conversations

- Launcher: `visible` (default) renders the native widget after verified identity. `hidden` never shows the launcher; `open()` opens the panel.
- Launcher gating is CSS on `html[data-payload-posthog-launcher="visible"]` (`src/conversations/launcher.ts`). The selector targets the parent of `button[aria-label^="Open chat"]` inside `#ph-conversations-widget-container`, verified in posthog-js 1.454.2's conversations bundle. The panel is not matched.
- `hide()` removes the widget and cancels a queued open. `open()` before SDK readiness is queued and applied once the SDK reports `ready`. There are no timers.
- `isAvailable` is SDK availability. `canOpen` is verified identity and consent.
- Verified against the real posthog-js widget, loaded through a deterministic local remote-config response (`conversations.enabled`, `token`) and the SDK's own `conversations.js` module. This is local SDK evidence, not a live PostHog project:
  - Visible: after verification the launcher shows (`#ph-conversations-widget-container` and the `Open chat` button); a custom button opens the panel; close keeps the launcher; reopen opens the panel; hide removes the widget and the launcher. The `ready` state requires the SDK to be available.
  - Hidden: no launcher on load or while the panel is open. After close the launcher wrapper stays `display: none`. Reopen and hide behave as in visible mode.
  - Before the fix in this round, a fresh visible load never showed the launcher: identity verified before the SDK loaded, and `show()` was a no-op. The plugin now shows the widget once the SDK reports ready.
- Not verified: a live PostHog project (remote configuration, HMAC acceptance, the hosted Conversations backend).

## 10. Public API

| Entry | Exports |
| --- | --- |
| `.` | `postHog`, `payloadDistinctId`, type `PayloadPostHogOptions` |
| `./admin` | `PostHogAdminProvider`, type `PostHogAdminProviderProps` |
| `./client` | `usePostHogConversations`, types `PostHogConversationsControls`, `PostHogConversationsStatus` |
| `./next-config` | `withPostHogConfig`, type `PostHogNextConfigOptions` |
| `./instrumentation` | `capturePostHogError`, `registerPostHog` |

`scripts/check-exports.mjs` and `scripts/exports-snapshot.json` lock the surface.

## 11. Verification

- Unit tests: `bun test src` (person properties, analytics identity, Conversations endpoint, Conversations policy and flush, client option defaults, plugin configuration, error tracking, error privacy, instrumentation).
- Quality gates: `tsc --noEmit`, `biome check .`, `oxlint`, `knip`, `bun run build`, `check:exports`, `publint`, `attw`.
- Runtime: `tests/compatibility/bootstrap-runtime.test.ts` (Next.js `next dev`, bootstrap variants).
- Packed production consumer: `tests/compatibility/payload-production/scripts/run.mjs` packs the package, installs it into an isolated Payload + Next app, and builds production variants. The `omit` variant was served with `next start`; the browser checks above used a headless Chromium over the DevTools protocol against the synthetic sink in the same app.
- Pre-existing fixture issue: React error #418 (hydration mismatch) also occurs in the baseline build without the plugin. It is not introduced by the plugin.

## 12. Limitations

- Server bootstrap has no Payload user, so flag bootstrap cannot use mapped person properties. Set `bootstrapFlags.personProperties` explicitly when needed.
- Consent changes take effect on the next React render; the installed SDK exposes no public opt-out event for immediate subscription.
- Session expiry without a subsequent render or reload is not detected until the next identity check.
- Browser-local session-entry and first-visit URL persistence can retain raw values before outbound redaction. This accepted PostHog SDK limitation is described in §8.
- A host-owned `capture_pageview: true` may capture before the plugin installs its redaction callback. A recording started before plugin initialization may also miss the plugin's masking callback.
- Redaction does not sanitize arbitrary custom-event data, mapped person-property values, exception messages, request bodies, or ordinary Replay text and inputs.
- The launcher CSS depends on posthog-js's current markup. Verify it on each posthog-js upgrade.
- No live hosted PostHog project was used. Hosted ingestion, HMAC acceptance, remote configuration, Conversations backend, and symbolication remain unverified.

## 13. Packed runtime evidence

The packed production fixture used synthetic users, synthetic canaries, a local PostHog sink, and headless Chromium. The production runtime checks covered:

- Login, logout, account switching, and stale identity responses. The active Payload user's namespaced ID and mapped properties were used; previous-user properties did not remain after switching.
- Native pageviews, autocapture, Session Replay, browser exceptions, and Payload REST errors. Text and rich text remained visible by default; password values were masked.
- Query-value, fragment, reset-token, verification-token, configurable Admin/reset route, and Next.js `basePath` redaction in outbound PostHog URL properties and Replay URL attributes.
- Replay full and incremental snapshots, URL-change events, and a synthetic unreachable PostHog host. Payload pages and error responses remained available when capture failed.
- Conversations signing and lifecycle with the real `posthog-js` widget and deterministic local remote configuration. Visible and hidden launchers, custom-button open, close/reopen, hide, logout, and delayed identity-response handling were exercised.
- Debug off, keyed debug, keyless debug, and keyless operation without debug. Keyless runs installed no provider and made no PostHog requests on a fresh browser profile.

The bootstrap runtime matrix passed all four variants. These are local fixture results, not verification against a hosted PostHog project. See §8-§9 for coverage details and limitations.

## 14. Integration with @klnap/payload-iam (disposable host)

Harness: `tests/compatibility/iam-host` (reproducible fixture and runner `run.sh`). The fixture is a copy of payload-iam's own `admin-host` fixture with `postHog({ apiKey, clientOptions, serverOptions, payload: { identify, conversations } })` added to `plugins`, a synthetic Conversations secret, a dashboard custom-button component, and the sink and remote-config routes from the production fixture. `payload-iam` is packed from its existing `dist` (its `prepack` is not run, so its tree is not modified). Its tree was checked after the run: no file changed. Database: a disposable PostgreSQL 16.16 cluster (embedded-postgres binaries in a scratch directory outside the repository, not Docker). Synthetic accounts from the fixture seed (`e2e-*@stolbek.test`). Browser: headless Chromium over the DevTools protocol. Sink: the host's own `/e`, `/s`, `/batch`, `/flags` routes.

Deviation: OTP sign-in is disabled in the host config (`otp: { enabled: false }`), so password sign-in is used. The OTP code did not reach the email capture log in this harness, and that path was not investigated further. The default payload-iam flow with OTP is not verified here.

Verified:

- Login and automatic identification: sign-in as the writer account identifies `users:<uuid>` with `email` and mapped `name` (from `fullName`). The dashboard pageview carries the signed-in ID; the login-page pageview before sign-in is anonymous.
- Mapped identity properties: `name` is mapped from `fullName`, `email` is the default mapping. Both appear in `$identify` and `$set`.
- Logout and identity reset: both sign-out forms were checked against payload-iam's route (`/sign-out`, not `/logout`). In-app navigation to `/sign-out/` (the Next client router) and a full-page load of `/sign-out/` both lead to an anonymous `/login` pageview. The in-app `/sign-out` pageview itself carries the signed-in ID, because it is sent before the logout completes.
- Account switching: after sign-out, the reader signs in. The reader's `$identify` carries only the reader's properties and the reader's distinct ID. The writer's properties do not reappear.
- Custom authentication views: payload-iam's sign-in and sign-out views render and report pageviews. The `/login` pageview is anonymous; the Conversations launcher attribute is absent; the signing endpoint returns 401 without a session.
- Anonymous custom Admin view: the host's custom view `/fixture-help` renders without a session. Its pageview is anonymous (`01a22220-…`), and no identity is set.
- Conversations identity verification: the signed-in endpoint returns 200 with `{distinctId, hash}`. The hash equals HMAC-SHA256 of the distinct ID under the synthetic secret, computed independently. The endpoint's distinct ID matches the `$identify` distinct ID for the same reader account.
- Conversations launcher: visible launcher `ready` after verification; the custom button (`#support-open`) opens the panel; close keeps the launcher; reopen opens the panel; hide removes the widget. After sign-out the launcher attribute is absent, the status is loading/unavailable, and the endpoint returns 401.
- Stale identity across logout: covered by the earlier production-fixture check (held identity request, sign-out, release; no late application). Not repeated here.

Note on the signed-in account for the Conversations run: the browser session was still the reader's from the previous step, so the form sign-in redirected to the dashboard. The verified identity in that run is therefore the reader's. The writer's endpoint result was verified separately.

Not verified in this harness: the hidden launcher on payload-iam (verified on the production fixture in §9), the default OTP flow of payload-iam (see deviation), and any live PostHog project.

Changes to the fixtures needed to make this run possible (not to the package): the sink routes accept raw base64 bodies in addition to `data=` form bodies (the SDK's base64 mode was rejected before); the production fixture's static route serves `conversations.js` (the widget module); the production fixture's remote config enables Conversations with a synthetic token.

## 15. Debug diagnostics

Public option: `debug?: boolean` (default `false`). `apiKey` is optional; without it, `debug: true` runs keyless. Outside debug mode the existing semantics are unchanged: `enabled: false` or a missing key registers nothing.

Design:

- Server-side only. Output goes to the Payload process terminal through `console.log` and `console.table`. Nothing is sent to a browser-to-server endpoint, and nothing is sent to PostHog by the diagnostics.
- Keyless mode (`apiKey` missing): no `PostHogAdminProvider`, no `afterError` capture, no Conversations endpoint, and no SDK initialization. The plugin adds only identity diagnostics to each auth collection's `afterMe` hook. Payload runs `afterMe` on `/me`; the hook reads the user returned for that request, so Payload read access applies.
- Keyed debug: the same identity diagnostics, plus a startup mode line, the configured mapping table, and Conversations status. The signing endpoint logs its outcome per request.
- Mapped values use the same `resolvePersonProperties` resolver as browser identification. Arrays retain their value types; missing or unsupported values are shown as `omitted (missing or unsupported)`.
- Diagnostics append to existing consumer `afterMe` hooks and return no replacement response. Diagnostic exceptions are swallowed so they cannot break authentication responses.
- Repeated output is suppressed. Deduplication state lives on `globalThis` for cross-chunk consistency, stores only SHA-256 digests, and is capped at 64 entries.
- Resolved and transmitted identity are distinct messages. Keyless: `Not transmitted: keyless mode.` Keyed: `Identified in the browser when consent allows.` The server cannot see consent or the browser's anonymous ID, and says so.
- The `/me` response describes values available to browser identification. It does not prove that consent allowed a capture or that PostHog received it.

Security:

- Never printed: credentials, tokens, HMAC values or signatures, authorization headers, the Conversations secret, and complete user objects. Tests assert absence of canary values and of 64-hex strings in endpoint logs.
- Printed: explicitly mapped person properties, including email by default. Output can contain personal data; the README warns against shared logs.
- The sensitive-data policy from the URL and identity work still applies: credential-like mapping paths are rejected at configuration time, and only mapped properties are read.

Verified (packed production fixture, synthetic accounts, local sink):

| Mode | Terminal | Telemetry | PostHog in page |
| --- | --- | --- | --- |
| Debug off | no `[payload-posthog]` lines | 7 events | yes |
| Debug on, key | mode line once; mapping table; resolved identity table with `email` and `name` resolved and `roles` omitted; Conversations status; no signature | 7 events | yes |
| Keyless debug (`PH_KEYLESS=1 PH_DEBUG=1`) | mode line once; resolved identity table marked `Not transmitted: keyless mode.` | 0 events; no `/e`, `/s`, `/array`, or `/flags` requests on a fresh profile | no |
| Keyless, no debug | no `[payload-posthog]` lines; page works | 0 events | no |

Notes from the runs:

- The `new Date()` prerender message in the server log also appears with debug off and in the baseline. It is not produced by this change.
- One replay batch reached the sink during a keyless run that reused the browser profile of the previous keyed session. It was not reproduced on a fresh profile, so it is attributed to the earlier page's queued data, not to the keyless integration.
- `afterMe` is the Payload hook that runs on `/me`. Anonymous visitors produce no per-user identity line; the server reports the anonymous state once, and the browser SDK holds the anonymous ID.
- The Conversations signing endpoint reports each distinct ID/status state once while it remains in the bounded deduplication cache.

Limits:

- Output is per process and in memory. Log rotation and retention are the host's responsibility.
- The dedupe cache holds at most 64 digest pairs; eviction may cause an unchanged identity or Conversations status to be logged again.
- The packed production fixture did not populate its `roles` mapping. Populated array, nested, and omitted-value behavior has unit coverage, not packed-browser runtime coverage.
- The server cannot observe PostHog's acceptance of a transmission. Diagnostics report what the plugin resolved and what the browser is configured to send, not delivery.
