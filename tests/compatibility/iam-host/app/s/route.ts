import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'

export async function POST(request: Request) {
  const bytes = Buffer.from(await request.arrayBuffer())
  const raw =
    bytes[0] === 0x1f && bytes[1] === 0x8b
      ? gunzipSync(bytes).toString('utf8')
      : bytes.toString('utf8')
  // Accepts `data=` form bodies and raw base64 bodies (the SDK's base64 compression mode).
  const encoded = raw.startsWith('data=')
    ? new URLSearchParams(raw).get('data')
    : /^[A-Za-z0-9+/=]+$/.test(raw)
      ? raw
      : null
  const body = JSON.parse(encoded ? Buffer.from(encoded, 'base64').toString('utf8') : raw)
  const output = process.env.PH_EVENTS_LOG ?? '/tmp/payload-posthog-events'
  await writeFile(`${output}.${randomUUID()}.json`, JSON.stringify({ endpoint: 's', body }))
  return Response.json({ status: 'ok' })
}
