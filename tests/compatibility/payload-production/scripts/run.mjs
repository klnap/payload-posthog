import { spawn } from 'node:child_process'
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const fixtureRoot = resolve(packageRoot, 'tests/compatibility/payload-production')
const outputRoot = resolve(
  process.env.PAYLOAD_PRODUCTION_OUTPUT ?? resolve(packageRoot, '.test-output/payload-production')
)
const appRoot = resolve(outputRoot, 'app')
const templatePackage = JSON.parse(await Bun.file(resolve(fixtureRoot, 'package.json')).text())

async function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? packageRoot,
    env: { ...process.env, ...options.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk) => (output += chunk))
  child.stderr.on('data', (chunk) => (output += chunk))
  const exitCode = await new Promise((resolveExit, reject) => {
    child.once('error', reject)
    child.once('close', resolveExit)
  })
  await writeFile(resolve(outputRoot, `${options.name ?? 'command'}.log`), output)
  if (exitCode !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${exitCode}); see ${resolve(outputRoot, `${options.name ?? 'command'}.log`)}`
    )
  }
  return output
}

await rm(outputRoot, { recursive: true, force: true })
await mkdir(outputRoot, { recursive: true })
await cp(fixtureRoot, appRoot, {
  recursive: true,
  filter: (source) => source !== resolve(fixtureRoot, 'scripts/run.mjs'),
})

await run('bun', ['run', 'build'], { name: 'package-build' })
const tarball = await run(
  'bun',
  ['pm', 'pack', '--filename', resolve(outputRoot, 'payload-posthog.tgz'), '--quiet'],
  { name: 'pack' }
)
await cp(resolve(outputRoot, 'payload-posthog.tgz'), resolve(appRoot, 'payload-posthog.tgz'))

templatePackage.scripts['generate:importmap'] = 'payload generate:importmap'
await writeFile(resolve(appRoot, 'package.json'), JSON.stringify(templatePackage, null, 2))
await run('bun', ['install'], { cwd: appRoot, name: 'install' })

for (const [name, bootstrap, plugin] of [
  ['omit', 'omit', '1'],
  ['false', 'false', '1'],
  ['true', 'true', '1'],
  ['baseline', 'omit', '0'],
]) {
  const env = {
    ...process.env,
    PH_BOOTSTRAP: bootstrap,
    PH_PLUGIN: plugin,
    PH_LOCAL_HOST: 'http://127.0.0.1:4179',
    NEXT_DIST_DIR: `.next-${name}`,
    NEXT_TELEMETRY_DISABLED: '1',
    PAYLOAD_SECRET: 'payload-production-fixture-secret-at-least-32-characters',
    DATABASE_URL: `file:${resolve(outputRoot, `payload-${name}.sqlite`)}`,
    PAYLOAD_CACHE_COMPONENTS_ENABLED: 'true',
  }
  await run('bunx', ['payload', 'generate:importmap'], {
    cwd: appRoot,
    env,
    name: `${name}-importmap`,
  })
  const importMap = await Bun.file(resolve(appRoot, 'app/(payload)/admin/importMap.js')).text()
  const providerEntries =
    importMap.match(/"@klnap\/payload-posthog\/admin#PostHogAdminProvider"/g)?.length ?? 0
  if (providerEntries !== (plugin === '1' ? 1 : 0)) {
    throw new Error(
      `${name}: expected ${plugin === '1' ? 1 : 0} plugin provider entries, found ${providerEntries}`
    )
  }
  await writeFile(resolve(outputRoot, `${name}-importMap.js`), importMap)
  await run('bunx', ['next', 'build'], {
    cwd: appRoot,
    env,
    name: `${name}-build`,
  })
  await run('bun', ['scripts/seed.ts'], {
    cwd: appRoot,
    env: { ...env, NODE_ENV: 'development' },
    name: `${name}-seed`,
  })
  console.log(`${name}: production build passed`)
}

await writeFile(
  resolve(outputRoot, 'fixture-state.json'),
  JSON.stringify(
    {
      appRoot,
      modes: ['omit', 'false', 'true', 'baseline'],
      tarball: `${tarball}`.trim(),
    },
    null,
    2
  )
)
