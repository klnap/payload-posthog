import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const sdkAssets = new Set([
  'conversations.js',
  'exception-autocapture.js',
  'lazy-recorder.js',
  'tracing-headers.js',
])

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assets: string[] }> }
) {
  const { assets } = await params
  const filename = assets.at(-1)
  if (!filename || !sdkAssets.has(filename)) return new Response(null, { status: 404 })

  const source = await readFile(resolve(process.cwd(), 'node_modules/posthog-js/dist', filename))
  return new Response(source, {
    headers: { 'content-type': 'application/javascript; charset=utf-8' },
  })
}
