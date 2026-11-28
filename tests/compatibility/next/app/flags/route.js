export async function POST(request) {
  const body = await request.json()

  if (body.distinct_id === 'service-error') {
    return Response.json({ detail: 'fixture unavailable' }, { status: 503 })
  }
  if (body.distinct_id === 'invalid-response') {
    return new Response('invalid JSON', { status: 200 })
  }
  if (body.distinct_id === 'slow-service') {
    await new Promise((resolve) => setTimeout(resolve, 1_500))
  }

  const variant = body.distinct_id === 'user-b' ? 'variant-b' : 'variant-a'

  return Response.json({
    featureFlags: { 'server-flag': variant },
    featureFlagPayloads: { 'server-flag': { identity: body.distinct_id, plan: 'enterprise' } },
  })
}
