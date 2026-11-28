# `@klnap/payload-posthog` maintainer rules

Public usage: [README.md](./README.md). Public exports live in `src/exports/` and are locked by `scripts/exports-snapshot.json`.

- Keep project identity, secrets, and business events in the host application. The plugin owns only its authenticated Conversations identity endpoint; other authentication endpoints remain host-owned.
- Keep browser code free of server SDKs and server credentials.
- Register no Admin provider when all features are disabled.
- Keep Conversations loading conditional on `payload.conversations`.
- Do not add route-based telemetry gating; telemetry runs across the Admin provider.
- Update the focused unit tests and run `check:exports` after changing public exports.

## Package development and release policy

The maintainer authorizes the agent to complete the package development and release lifecycle without repeated approval. This includes creating and managing task branches, implementing and verifying changes, creating Conventional Commits, pushing to GitHub, creating and updating pull requests, approving eligible GitHub Actions runs, merging verified pull requests, managing Changesets, reviewing and merging generated Release PRs, completing npm Trusted Publishing through GitHub Actions, verifying publication, synchronizing local branches, and cleaning up completed branches.

Use GitHub Flow with a protected `main` branch, short-lived task branches, Conventional Commits, and squash merges. Start new tasks from current `origin/main`; reuse existing branches and pull requests when continuing work. Preserve unrelated user changes. Keep repository protections enabled and preserve the build-once, verify, publish architecture.

For completed implementation work that warrants a package release:

1. Inspect the repository and existing work.
2. Implement the requested changes; complete focused tests, independent review, package validation, and documentation.
3. Add an appropriate Changeset based on SemVer and consumer impact.
4. Commit and push the task branch; create or update its pull request.
5. Wait for required checks and resolve material findings.
6. Merge the verified task pull request using the configured repository strategy.
7. Monitor `main` CI and the Changesets workflow; locate the generated Release PR.
8. Review the full Release PR, version bump, changelog, and scope. Approve eligible pending workflow runs.
9. Wait for required checks, then merge the Release PR.
10. Monitor artifact verification and npm Trusted Publishing.
11. Independently verify the expected npm version, dist-tag, provenance where supported, Git tag, and GitHub Release.
12. Synchronize local `main` and safely clean up completed branches.

Do not report a release as successful before verifying it against the npm registry. Do not stop midway because a routine PR or workflow approval is required.

Changesets are the only versioning and release-management mechanism. Never bump package versions manually, create release tags manually, publish locally, or add long-lived npm publishing tokens. Do not create releases for infrastructure-only changes. Inspect pending Changesets before release and keep the release within authorized scope. Use `~/code/packages/npm-package-template` as the source of truth for shared engineering and release infrastructure.

Research, investigations, design discussions, and unfinished implementations do not trigger releases. Follow explicit task limits such as local-only work, push-only, no merge, no release, or no publication for that task.

Stop only for genuine blockers: missing permissions or interactive authentication, unresolved security vulnerabilities or failing required checks, conflicting user changes, unexpected release content, architectural decisions requiring maintainer input, or platform restrictions that would require bypassing security. Do not manufacture blockers, repeat successful checks unnecessarily, or refactor endlessly.
