/**
 * dsh-rewind 一致性门禁。
 *
 * 按 dsh-plugin-studio 的「名称一致性铁律」与 client 合同校验最终产物：
 *   package.json#name == cordis.patch.yml insert 的 id/name == client ModuleLoader id
 * 并额外证明 client bundle 只 require 客户端 shell 的静态共享模块表里的包
 * （否则会打进第二份 React / 第二份服务实例）。
 *
 * 用法：node scripts/gates.mjs（或 pnpm run gates）
 */

import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const SHARED_MODULES = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])

const failures = []
const passes = []

function check(name, ok, detail) {
  if (ok) passes.push(name)
  else failures.push(detail === undefined ? name : `${name} — ${detail}`)
}

async function readText(relative) {
  return readFile(resolve(ROOT, relative), 'utf8')
}

async function main() {
  // ── package.json 合同 ────────────────────────────────────────────────────
  const pkg = JSON.parse(await readText('package.json'))
  const name = pkg.name

  check('package.json: 名称是小写连字符形式', /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name), `name=${name}`)
  check('package.json: version 是合法 semver', typeof pkg.version === 'string' && /^\d+\.\d+\.\d+/.test(pkg.version), String(pkg.version))
  check('package.json: type=module', pkg.type === 'module')
  check('package.json: main=lib/index.js', pkg.main === 'lib/index.js')

  const exportsMap = pkg.exports ?? {}
  for (const key of ['.', './client', './cordis.patch.yml', './package.json']) {
    check(`package.json: exports["${key}"] 存在`, typeof exportsMap[key] === 'string', typeof exportsMap[key])
  }
  check('package.json: dsh.bundle.patch', pkg.dsh?.bundle?.patch === './cordis.patch.yml')
  check('package.json: dsh.client.platform=web', pkg.dsh?.client?.platform === 'web')

  const files = pkg.files ?? []
  for (const required of ['lib/index.js', 'lib/client.js', 'cordis.patch.yml', 'README.md']) {
    check(`package.json: files 含 ${required}`, files.includes(required))
  }

  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    const declared = Object.keys(pkg[field] ?? {})
    const forbidden = declared.filter((dep) => dep.startsWith('@deepseek-ai/'))
    check(`package.json: ${field} 未声明 @deepseek-ai/*`, forbidden.length === 0, forbidden.join(', '))
  }

  // ── cordis.patch.yml 合同 ────────────────────────────────────────────────
  const patch = await readText('cordis.patch.yml')
  const insertBlock = patch.split('- insert:')[1] ?? ''
  const idMatch = insertBlock.match(/^\s*-\s*id:\s*(\S+)\s*$/m)
  const nameMatch = insertBlock.match(/^\s*name:\s*(\S+)\s*$/m)
  check('cordis.patch.yml: insert id 等于包名', idMatch?.[1] === name, `id=${idMatch?.[1]}`)
  check('cordis.patch.yml: insert name 等于包名', nameMatch?.[1] === name, `name=${nameMatch?.[1]}`)

  // ── 宿主半产物 ───────────────────────────────────────────────────────────
  const nodeHalf = await readText('lib/index.js')
  check('lib/index.js: 导出 apply', /\bapply\b/.test(nodeHalf) && /\bexport\b/.test(nodeHalf))

  // ── 客户端半产物 ─────────────────────────────────────────────────────────
  const clientHalf = await readText('lib/client.js')
  check(
    'lib/client.js: 以 ModuleLoader 信封开头',
    clientHalf.startsWith('window.__ModuleLoader__.load({'),
    clientHalf.slice(0, 40)
  )
  check(
    'lib/client.js: ModuleLoader id 等于包名',
    clientHalf.includes(`id: ${JSON.stringify(name)}`),
    `期望 id: ${JSON.stringify(name)}`
  )
  check('lib/client.js: 导出 inject', /\binject\b/.test(clientHalf))
  check('lib/client.js: 导出 apply', /\bapply\b/.test(clientHalf))

  const requires = [...clientHalf.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map((hit) => hit[1])
  const uniqueRequires = [...new Set(requires)].sort()
  const foreign = uniqueRequires.filter((target) => !SHARED_MODULES.has(target))
  check(
    'lib/client.js: 只 require 静态共享模块表里的包',
    foreign.length === 0,
    foreign.length === 0 ? undefined : `越界: ${foreign.join(', ')}`
  )
  check(
    'lib/client.js: 未 require dsh-client-ui-chat / dsh-client-ui-conversation',
    !uniqueRequires.some((target) => target.includes('dsh-client-ui-chat') || target.includes('dsh-client-ui-conversation'))
  )
  check('lib/client.js: 未夹带第二份 React 实现', !clientHalf.includes('__SECRET_INTERNALS'))

  // ── 源码侧同样约束（防止只在产物上侥幸通过）────────────────────────────
  const clientSource = await readText('src/client/index.jsx')
  const sourceImports = [...clientSource.matchAll(/from\s+["']([^"']+)["']/g)].map((hit) => hit[1])
  const sourceForeign = sourceImports.filter(
    (target) => target.startsWith('@deepseek-ai/') && !SHARED_MODULES.has(target)
  )
  check(
    'src/client: 运行时只从共享模块表 import @deepseek-ai/*',
    sourceForeign.length === 0,
    sourceForeign.join(', ')
  )

  // ── 报告 ─────────────────────────────────────────────────────────────────
  for (const line of passes) process.stdout.write(`  ok   ${line}\n`)
  if (failures.length > 0) {
    process.stdout.write(`\n${failures.length} 项未通过：\n`)
    for (const line of failures) process.stdout.write(`  FAIL ${line}\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write(`\n全部 ${passes.length} 项门禁通过\n`)
}

await main()
