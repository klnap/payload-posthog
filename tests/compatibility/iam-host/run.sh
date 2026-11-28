#!/usr/bin/env bash
# Disposable Payload host for @klnap/payload-iam + @klnap/payload-posthog compatibility checks.
# Requires a disposable PostgreSQL database: PAYLOAD_RBAC_TEST_DATABASE_URL.
# payload-iam is packed from its existing dist (its prepack is not run, so its tree is not modified).
set -euo pipefail
umask 077
fixture="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$fixture/../../.." && pwd)"
iam_package="${IAM_PACKAGE_DIR:-$HOME/code/stolbek/packages/payload-iam}"
work="${IAM_HOST_WORK:-$repo/.test-output/iam-host}"
export DATABASE_URL="${PAYLOAD_RBAC_TEST_DATABASE_URL:?disposable PostgreSQL database required}"
export PAYLOAD_SECRET="${PAYLOAD_SECRET:-$(openssl rand -hex 32)}"
export AUTH_SECRET="${AUTH_SECRET:-$(openssl rand -hex 32)}"
export SERVER_URL="http://127.0.0.1:8010"
export PH_LOCAL_HOST="http://127.0.0.1:8010"

rm -rf "$work" && mkdir -p "$work/pack"
(cd "$iam_package" && tar -czf "$work/iam.tgz" --transform 's,^,package/,' package.json dist bin README.md LICENSE)
(cd "$repo" && bun pm pack --destination "$work/pack" --quiet >/dev/null)
mv "$work"/pack/klnap-payload-posthog-*.tgz "$work/posthog.tgz"
cp -R "$fixture"/{app,components,scripts,next.config.ts,payload.config.ts,tsconfig.json} "$work/"
cat > "$work/package.json" <<JSON
{
  "name": "iam-posthog-host-fixture",
  "private": true,
  "type": "module",
  "dependencies": {
    "@klnap/payload-iam": "file:./iam.tgz",
    "@klnap/payload-posthog": "file:./posthog.tgz",
    "@posthog/next": "0.11.1",
    "@payloadcms/db-postgres": "3.94.2",
    "@payloadcms/next": "3.94.2",
    "@payloadcms/richtext-lexical": "3.94.2",
    "@payloadcms/translations": "3.94.2",
    "@payloadcms/ui": "3.94.2",
    "drizzle-orm": "0.45.4",
    "next": "16.4.6",
    "payload": "3.94.2",
    "pg": "8.23.1",
    "posthog-js": "1.454.2",
    "posthog-node": "5.74.0",
    "react": "19.3.1",
    "react-dom": "19.3.1"
  },
  "devDependencies": {
    "@types/node": "26.6.6",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "typescript": "7.0.2"
  }
}
JSON
cd "$work"
bun install
bun -e 'import config from "./payload.config.ts"; import { generateImportMap } from "payload"; await generateImportMap(await config)'
NODE_ENV=development timeout 120s bun scripts/seed.ts
NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next build
echo "build complete: start with: cd $work && NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next start -p 8010"
