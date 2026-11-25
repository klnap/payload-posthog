# `@klnap/payload-posthog` maintainer rules

Public usage: [README.md](./README.md). Public exports live in `src/exports/` and are locked by `scripts/exports-snapshot.json`.

- Keep project identity, secrets, and business events in the host application. The plugin owns only its authenticated Support identity endpoint; other authentication endpoints remain host-owned.
- Keep browser code free of server SDKs and server credentials.
- Register no Admin provider when all features are disabled.
- Keep Support loading conditional; do not add an IAM dependency.
- Update the focused unit tests and run `check:exports` after changing public exports.
