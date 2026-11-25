# Contributing

```sh
bun install
bun run lint
bun run typecheck
bun run knip
bun test src tests/unit
bun run check:exports
bun run build
```

Public exports are locked by `scripts/exports-snapshot.json`. Update the snapshot and the focused tests when you change an export. Read `AGENTS.md` before changing the plugin.
