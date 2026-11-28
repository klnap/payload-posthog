import { Buffer } from 'node:buffer'
import { appendFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'

export async function POST(request: Request) {
  const bytes = Buffer.from(await request.arrayBuffer())
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b
  const raw = isGzip ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8')
  const encoded = raw.startsWith('data=') ? new URLSearchParams(raw).get('data') : null
  const body = JSON.parse(encoded ? Buffer.from(encoded, 'base64').toString('utf8') : raw)
  const distinctID = body.distinct_id ?? body.distinctID ?? 'anonymous'
  const variant = distinctID === 'users:1' ? 'account-a' : 'anonymous'
  const payload = { identity: distinctID, cohort: variant }
  await appendFile(
    process.env.PH_FLAGS_LOG ?? '/tmp/payload-posthog-flags.jsonl',
    `${JSON.stringify({
      distinctID,
      source: raw.startsWith('data=') ? 'browser' : 'server',
      propertyKeys: Object.keys(body.person_properties ?? body.personProperties ?? {}),
    })}\n`
  )
  return Response.json({
    flags: {
      'render-flag': {
        key: 'render-flag',
        enabled: true,
        variant,
        metadata: { payload },
      },
    },
    featureFlags: { 'render-flag': variant },
    featureFlagPayloads: { 'render-flag': payload },
  })
}
