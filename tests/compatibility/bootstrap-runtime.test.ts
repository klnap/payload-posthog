import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { type ChildProcess, spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdirSync, rmdirSync, symlinkSync, unlinkSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const fixture = fileURLToPath(new URL('./next', import.meta.url))
const nextBin = resolve(fixture, '../../../node_modules/next/dist/bin/next')
const packageRoot = resolve(fixture, '../../..')
const packageLink = resolve(fixture, 'node_modules/@klnap/payload-posthog')
const apiKey = 'phc_fixture_key'
let server: ChildProcess
let port = 0
let output = ''

function cookie(distinctId: string, userState = 'identified') {
  return `ph_${apiKey}_posthog=${JSON.stringify({
    distinct_id: distinctId,
    $device_id: `device-${distinctId}`,
    $user_state: userState,
  })}`
}

async function getFreePort() {
  const listener = createServer()
  listener.listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const address = listener.address()
  if (!address || typeof address === 'string') throw new Error('Could not reserve a test port.')
  await new Promise<void>((resolveClose, reject) =>
    listener.close((error) => (error ? reject(error) : resolveClose()))
  )
  return address.port
}

async function waitForServer() {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Next exited early:\n${output}`)
    if (output.includes('Ready in')) return
    await Bun.sleep(250)
  }
  throw new Error(`Next did not become ready:\n${output}`)
}

async function startServer(cacheComponents: boolean, partialPrefetching: boolean) {
  port = await getFreePort()
  output = ''
  const url = `http://127.0.0.1:${port}`
  server = spawn(process.execPath, [nextBin, 'dev', '--turbopack', '--port', String(port)], {
    cwd: fixture,
    env: {
      ...process.env,
      POSTHOG_TEST_HOST: url,
      PH_CACHE_COMPONENTS: cacheComponents ? '1' : '0',
      PH_PARTIAL_PREFETCHING: partialPrefetching ? '1' : '0',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const collectOutput = (chunk: Buffer) => {
    output = `${output}${chunk.toString()}`.slice(-12_000)
  }
  server.stdout?.on('data', collectOutput)
  server.stderr?.on('data', collectOutput)
  await waitForServer()
  await fetch(`${url}/flags/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  return url
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  await Promise.race([once(server, 'exit'), Bun.sleep(5_000)])
  if (server.exitCode === null) server.kill('SIGKILL')
}

async function render(url: string, mode: string, distinctId?: string, userState?: string) {
  try {
    return await fetch(`${url}/${mode}/`, {
      headers: distinctId ? { cookie: cookie(distinctId, userState) } : {},
    })
  } catch (error) {
    throw new Error(`${error}\n${output.slice(-6000)}`)
  }
}

async function page(response: Response) {
  const html = await response.text()
  if (response.status !== 200) {
    throw new Error(`Expected HTTP 200, got ${response.status}.\n${output.slice(-6000)}\n${html}`)
  }
  return html
}

describe('Next Cache Components bootstrap compatibility', () => {
  beforeAll(async () => {
    mkdirSync(resolve(fixture, 'node_modules/@klnap'), { recursive: true })
    symlinkSync(packageRoot, packageLink, 'dir')
    await startServer(true, true)
  }, 150_000)

  afterAll(async () => {
    await stopServer()
    if (existsSync(packageLink)) unlinkSync(packageLink)
    rmdirSync(resolve(fixture, 'node_modules/@klnap'))
    rmdirSync(resolve(fixture, 'node_modules'))
  })

  it('leaves bootstrap omitted and false on the native client path', async () => {
    const url = `http://127.0.0.1:${port}`
    const omitted = await render(url, 'omit')
    const disabled = await render(url, 'false')
    const [omittedHtml, disabledHtml] = await Promise.all([page(omitted), page(disabled)])

    expect(omittedHtml).toContain('admin-ready')
    expect(disabledHtml).toContain('admin-ready')
  }, 30_000)

  it('bootstraps native flag variants and payloads per identified request', async () => {
    const url = `http://127.0.0.1:${port}`
    const [userA, userB, objectConfig, anonymous, noCookie] = await Promise.all([
      render(url, 'true', 'user-a'),
      render(url, 'true', 'user-b'),
      render(url, 'object', 'user-a'),
      render(url, 'true', 'anonymous-id', 'anonymous'),
      render(url, 'true'),
    ])
    const [htmlA, htmlB, htmlObject, anonymousHtml, noCookieHtml] = await Promise.all([
      page(userA),
      page(userB),
      page(objectConfig),
      page(anonymous),
      page(noCookie),
    ])

    expect(htmlA).toContain('variant-a')
    expect(htmlA).toContain('user-a')
    expect(htmlA).toContain('enterprise')
    expect(htmlA).not.toContain('user-b')
    expect(htmlB).toContain('variant-b')
    expect(htmlB).toContain('user-b')
    expect(htmlB).not.toContain('user-a')
    expect(htmlObject).toContain('variant-a')
    expect(htmlObject).toContain('user-a')
    expect(htmlObject).toContain('enterprise')
    expect(anonymousHtml).toContain('anonymous-id')
    expect(noCookieHtml).toContain('admin-ready')
  }, 30_000)

  it('keeps the route usable when flag evaluation fails, times out, or returns invalid JSON', async () => {
    const url = `http://127.0.0.1:${port}`
    const responses = await Promise.all(
      ['service-error', 'slow-service', 'invalid-response'].map((identity) =>
        render(url, 'true', identity)
      )
    )
    const pages = await Promise.all(responses.map(page))

    expect(pages.every((html) => html.includes('admin-ready'))).toBe(true)
  }, 30_000)

  it('works with Cache Components and Partial Prefetching disabled independently', async () => {
    await stopServer()

    for (const config of [
      { cacheComponents: false, partialPrefetching: false },
      { cacheComponents: true, partialPrefetching: false },
    ]) {
      const url = await startServer(config.cacheComponents, config.partialPrefetching)
      const [omitted, bootstrapped] = await Promise.all([
        render(url, 'omit'),
        render(url, 'true', 'user-a'),
      ])
      const [omittedHtml, bootstrappedHtml] = await Promise.all([page(omitted), page(bootstrapped)])

      expect(omittedHtml).toContain('admin-ready')
      expect(bootstrappedHtml).toContain('variant-a')
      await stopServer()
    }
  }, 120_000)
})
