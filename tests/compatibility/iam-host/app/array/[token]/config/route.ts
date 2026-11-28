export async function GET() {
  return Response.json({
    hasFeatureFlags: true,
    // Real projects send this boolean; without it posthog-js keeps autocapture disabled at startup.
    autocapture_opt_out: false,
    // Synthetic Conversations enablement: the SDK loads the real widget module from /static.
    conversations: { enabled: true, token: 'synthetic-conversations-token' },
    sessionRecording: {
      endpoint: '/s/',
      sampleRate: 1,
      minimumDurationMilliseconds: 0,
    },
  })
}
