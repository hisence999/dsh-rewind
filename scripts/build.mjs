/**
 * dsh-rewind 构建脚本。
 *
 * 两个产物：
 * - lib/index.js  宿主半（ESM，纯 UI 插件只有一个空的 apply()）。
 * - lib/client.js 浏览器半：esbuild 打成 CJS，再包一层 DSH 的 ModuleLoader 信封
 *                 （`window.__ModuleLoader__.load({ id, factory })`）。
 *
 * 关键约束：react / react-dom / cordis / dsh-client-store / dsh-client-ui-slots /
 * dsh-client-ui-primitives / dsh-client-ui-dockkit 必须保持 external —— 它们由
 * 客户端 shell 的静态共享模块表提供（见 dsh-web-frontend 的 index bundle 里的
 * 静态模块表）。把这些打进 bundle 会造出第二份 React / 第二份服务实例，
 * 直接导致 hooks 崩溃或跨实例不一致。
 *
 * 用法：node scripts/build.mjs（或 pnpm run bundle）
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

/** 仓库根目录。 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 客户端 shell 提供的静态共享模块表（跨包身份必须一致，务必保持 external）。 */
const SHARED_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

/** 给多行文本整体缩进，便于阅读产出的 client bundle。 */
function indent(text, spaces) {
  const pad = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((line) => (line === '' ? line : pad + line))
    .join('\n')
}

/** 把 CJS bundle 包成 DSH 的 ModuleLoader 信封。 */
function wrapInModuleLoader(packageName, body) {
  return [
    'window.__ModuleLoader__.load({',
    `\tid: ${JSON.stringify(packageName)},`,
    '\tfactory: (require) => {',
    '\t\t"use strict";',
    '\t\tvar module = { exports: {} };',
    '\t\tvar exports = module.exports;',
    '\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
    indent(body, 2),
    '\t\t// esbuild 的 CJS 产物会把 module.exports 换成 __toCommonJS 的新对象；',
    '\t\t// 无论哪种情况，返回的对象都要带上 Module 标记（官方 bundle 同款约定）。',
    '\t\tvar out = module.exports;',
    '\t\tif (out !== exports) Object.defineProperty(out, Symbol.toStringTag, { value: "Module" });',
    '\t\treturn out;',
    '\t}',
    '});',
    '',
  ].join('\n')
}

async function buildNodeHalf() {
  const result = await build({
    entryPoints: [resolve(ROOT, 'src/index.js')],
    absWorkingDir: ROOT,
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    legalComments: 'none',
  })
  return result.outputFiles[0].text
}

async function buildClientHalf(packageName) {
  const result = await build({
    entryPoints: [resolve(ROOT, 'src/client/index.jsx')],
    absWorkingDir: ROOT,
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'browser',
    target: 'es2020',
    jsx: 'automatic',
    external: SHARED_MODULES,
    legalComments: 'none',
  })
  return wrapInModuleLoader(packageName, result.outputFiles[0].text)
}

async function main() {
  const pkg = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8'))
  const outDir = resolve(ROOT, 'lib')
  await mkdir(outDir, { recursive: true })

  const nodeHalf = await buildNodeHalf()
  const clientHalf = await buildClientHalf(pkg.name)

  await writeFile(resolve(outDir, 'index.js'), nodeHalf, 'utf8')
  await writeFile(resolve(outDir, 'client.js'), clientHalf, 'utf8')

  process.stdout.write(
    `built ${pkg.name}: lib/index.js (${nodeHalf.length}B), lib/client.js (${clientHalf.length}B)\n`
  )
}

await main()
