# Security

Report vulnerabilities privately through GitHub Security Advisories on this repository. Do not open a public issue for a security problem.

Keep `payload.conversations.secret`, PostHog personal API keys, and other server credentials out of client code. The Conversations secret is server-only; the PostHog project API key is public by design.

The plugin redacts supported URLs before outbound telemetry, but it does not sanitize arbitrary event properties, exception messages, application content, or browser-local SDK storage. Password inputs are masked in Replay; other inputs and text are visible by default. The host owns consent and recording policy. See [Session Replay and privacy](docs/session-replay-and-privacy.md) for data boundaries and the accepted upstream storage limitation.
