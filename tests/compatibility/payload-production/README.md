# Packed Payload production compatibility fixture

Run from the package root:

```sh
bun run test:payload-production
```

The runner packs this package, installs the tarball into an isolated temporary app, creates a fresh SQLite database per build, then builds the three `bootstrapFlags` modes and a no-plugin baseline. It keeps build output, logs, and the fixture copy under `.test-output/payload-production/`.

The app uses Payload `3.94.1`, Next `16.4.5`, Cache Components, Partial Prefetching, UUID resource IDs, synthetic credentials, and local `/flags/`, `/e/`, `/batch/`, and `/s/` endpoints. Collection autosave capture is explicitly enabled for `posts`; the global fixture also opts in. Collection and global schedule drawers are enabled for manual success-event checks. The telemetry endpoints store synthetic requests in unique JSON files using `PH_EVENTS_LOG` or `/tmp/payload-posthog-events` as the filename prefix. The fixture also serves the installed PostHog SDK's optional browser assets. It does not add a layout workaround. Before each server run, use the matching `payload-<mode>.sqlite` database. Start the selected build with `NODE_ENV=production`, `PAYLOAD_CACHE_COMPONENTS_ENABLED=true`, `PH_PLUGIN=1`, `PH_BOOTSTRAP=<omit|false|true>`, `PH_LOCAL_HOST=http://127.0.0.1:4179`, `NEXT_DIST_DIR=.next-<mode>`, and `DATABASE_URL=file:<absolute-path>/payload-<mode>.sqlite`, then run `bunx next start -p 4179`.

The root page's `next/link` gives the browser a real Next.js navigation into Admin for checking Partial Prefetching. The Admin itself remains Payload's generated route and layout. A synthetic dashboard probe exposes the native PostHog client and provides inputs for checking Error Tracking and Replay masking; do not put real user data in this fixture.
