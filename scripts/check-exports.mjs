import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const { runtime: runtimeSnapshot, types: typeSnapshot } = JSON.parse(
  readFileSync(join(root, 'scripts/exports-snapshot.json'), 'utf8')
)
const failures = []
const targets = new Set()

function collect(value) {
  if (typeof value === 'string' && value.startsWith('./')) targets.add(value)
  else if (value && typeof value === 'object') Object.values(value).forEach(collect)
}

collect(pkg.exports)
for (const field of ['main', 'module', 'types']) if (pkg[field]) targets.add(pkg[field])

for (const [subpath, expected] of Object.entries(runtimeSnapshot)) {
  const entry = pkg.exports[subpath]
  const target = entry && typeof entry === 'object' ? entry.import : entry
  if (typeof target !== 'string' || !target.startsWith('./dist/')) {
    failures.push(`missing built import target for public export: ${subpath}`)
    continue
  }

  const file = join(root, target)
  if (!existsSync(file)) continue
  const code = readFileSync(file, 'utf8')
  const actual = new Set()
  for (const match of code.matchAll(/\bexport\s*\{([^}]+)\}(?:\s*from\s*['"][^'"]+['"])?/gs)) {
    for (const item of match[1].split(',')) {
      const names = item.trim().split(/\s+as\s+/)
      if (names[0]) actual.add(names[1] ?? names[0])
    }
  }
  for (const match of code.matchAll(/\bexport\s+(?:const|function|class)\s+([\w$]+)/g)) {
    actual.add(match[1])
  }
  if (/\bexport\s*\*/.test(code)) {
    failures.push(`${subpath} uses an export-star declaration; list names explicitly`)
  }
  if (/\bexport\s+default\b/.test(code)) actual.add('default')

  const missing = expected.filter((name) => !actual.has(name))
  const unexpected = [...actual].filter((name) => !expected.includes(name))
  if (missing.length || unexpected.length) {
    failures.push(
      `${subpath} export mismatch: ${missing.length ? `missing ${missing.join(', ')}` : ''}${missing.length && unexpected.length ? '; ' : ''}${unexpected.length ? `unexpected ${unexpected.join(', ')}` : ''}`
    )
  }
}

for (const [subpath, expected] of Object.entries(typeSnapshot)) {
  const expectedDeclarations = [...runtimeSnapshot[subpath], ...expected]
  const entry = pkg.exports[subpath]
  const target = entry && typeof entry === 'object' ? entry.types : undefined
  if (typeof target !== 'string' || !target.startsWith('./dist/')) {
    failures.push(`missing declaration target for public export: ${subpath}`)
    continue
  }

  const file = join(root, target)
  if (!existsSync(file)) continue
  const declaration = readFileSync(file, 'utf8')
  const actual = new Set()
  for (const match of declaration.matchAll(
    /\bexport\s+(?:type\s+)?\{([^}]+)\}(?:\s*from\s*['"][^'"]+['"])?/gs
  )) {
    for (const item of match[1].split(',')) {
      const names = item.trim().split(/\s+as\s+/)
      if (names[0]) actual.add(names[1] ?? names[0])
    }
  }
  for (const match of declaration.matchAll(
    /\bexport\s+(?:declare\s+)?(?:type|interface|class|const|function)\s+([\w$]+)/g
  )) {
    actual.add(match[1])
  }

  const missing = expectedDeclarations.filter((name) => !actual.has(name))
  const unexpected = [...actual].filter((name) => !expectedDeclarations.includes(name))
  if (missing.length || unexpected.length) {
    failures.push(
      `${subpath} declaration export mismatch: ${missing.length ? `missing ${missing.join(', ')}` : ''}${missing.length && unexpected.length ? '; ' : ''}${unexpected.length ? `unexpected ${unexpected.join(', ')}` : ''}`
    )
  }
}

for (const subpath of Object.keys(pkg.exports)) {
  if (!(subpath in runtimeSnapshot) || !(subpath in typeSnapshot)) {
    failures.push(`public export missing from snapshot: ${subpath}`)
  }
}
for (const target of targets) {
  if (!existsSync(join(root, target))) failures.push(`missing package target: ${target}`)
}

function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) inspect(file)
    else if (/\.(?:js|mjs|cjs)$/.test(file)) {
      const code = readFileSync(file, 'utf8')
      if (/(?:from\s*|import\s*\(|require\s*\()\s*['"](?:@\/|#)/.test(code)) {
        failures.push(`unresolved internal alias: ${file.slice(root.length + 1)}`)
      }
    } else if (file.endsWith('.map')) {
      const map = JSON.parse(readFileSync(file, 'utf8'))
      map.sources?.forEach((source, index) => {
        const embedded = map.sourcesContent?.[index]
        const sourcePath = resolve(dirname(file), map.sourceRoot ?? '', source)
        if (!embedded && !existsSync(sourcePath)) {
          failures.push(`source map target missing: ${file.slice(root.length + 1)} -> ${source}`)
        }
      })
    }
  }
}

const dist = join(root, 'dist')
// Every built module must come from a source file; stale output from removed sources must fail.
function checkStaleOutput(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) checkStaleOutput(file)
    else if (entry.name.endsWith('.js')) {
      const relative = file.slice(dist.length + 1, -'.js'.length)
      if (
        !existsSync(join(root, 'src', `${relative}.ts`)) &&
        !existsSync(join(root, 'src', `${relative}.tsx`))
      ) {
        failures.push(`stale build output without source: dist/${relative}.js`)
      }
    }
  }
}
if (existsSync(dist)) checkStaleOutput(dist)
if (existsSync(dist)) inspect(dist)
else failures.push('missing dist directory; run build first')

if (failures.length) {
  console.error(failures.join('\n'))
  process.exitCode = 1
} else {
  console.log(`Validated ${targets.size} package targets and dist aliases/maps.`)
}
