/**
 * dsh-rewind 非可视化冒烟测试。
 *
 * 在 Node 里用 `node:vm` 造一个假的浏览器环境，把**真实构建产物** lib/client.js
 * 跑起来，验证五件事：
 *   1. ModuleLoader 信封语法正确、factory 能执行，并返回 { inject, apply }；
 *   2. inject 清单与插件体注册的槽位/键/命名空间完全符合设计；
 *   3. 组件逻辑：复用内置渲染器、**动作行是横向的内联布局（回归：第一版竖排）**、
 *      能力探测兜底、首条/插话分支、
 *      **撤回锚点真的落到 fork 的 atSeq 上、且拿不到权威锚点时宁可不给按钮**；
 *   4. cut 原语（fork 参数 / 空白会话的 workspace 归属 / 归档顺序 / 提示状态）；
 *   5. 改写内容投送**不依赖 slot 挂载**（用 conversation.input.for(binding.ctx) +
 *      state.draft 读回核对 + autoSend 才 submit），以及投送失败时不留半成品。
 *      加上影子覆盖的顺序自愈（抢不到就重注册，抢到就停）。
 *
 * 它**不能**替代浏览器里的可视化验收（真实 React 渲染、内置 DOM 结构、
 * 与真实 ui-chat 的注册顺序竞争），那些必须人工在 dsh web 里点。
 *
 * 用法：node scripts/smoke-require.mjs
 */

import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const failures = []
let passed = 0

function check(name, ok, detail) {
  if (ok) {
    passed += 1
    process.stdout.write(`  ok   ${name}\n`)
  } else {
    failures.push(detail === undefined ? name : `${name} — ${detail}`)
    process.stdout.write(`  FAIL ${name}${detail === undefined ? '' : ` — ${detail}`}\n`)
  }
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

const delay = (ms) => new Promise((done) => setTimeout(done, ms))

// ── 假 React ────────────────────────────────────────────────────────────────
// 只提供本插件用到的那几个 API；目的是让组件的**结构**可断言，不模拟渲染。
const FakeFragment = Symbol('Fragment')

const fakeReact = {
  Fragment: FakeFragment,
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useMemo: (factory) => factory(),
  useCallback: (fn) => fn,
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useLayoutEffect: () => {},
  useRef: (initial) => ({ current: initial }),
  // 只为了让 ShadowBoundary 能 `extends React.Component`；这里不模拟真正的错误边界。
  Component: class FakeComponent {
    constructor(props) {
      this.props = props ?? {}
      this.state = {}
    }

    setState(next) {
      this.state = { ...this.state, ...(typeof next === 'function' ? next(this.state) : next) }
    }
  },
}

// ── 假 react-dom（只用到 createPortal）───────────────────────────────────────
const fakeReactDom = {
  createPortal: (children, container) => ({ __portal: true, children, container }),
}

// ── 假 primitives ───────────────────────────────────────────────────────────
// 导出名对齐 **dsh 0.1.7 的真实形状**：图标是 IconXxxRegular / IconXxxMedium 且接收
// `{ size }`；旧版的 IconXxx16 在 0.1.7 里已不存在 —— 那正是让按钮整体消失的变更，
// 所以这里刻意**不放旧名**，逼着解析回落链真的按新名字走通。
const fakePrimitives = {
  Button: function FakeButton() {},
  IconEditOutlineRegular: function FakeIconEditRegular() {},
  IconEditOutlineMedium: function FakeIconEditMedium() {},
  IconRefreshOutlineRegular: function FakeIconRefreshRegular() {},
  IconRefreshOutlineMedium: function FakeIconRefreshMedium() {},
  Modal: function FakeModal() {},
  Tooltip: function FakeTooltip() {},
}

const modules = {
  react: fakeReact,
  'react/jsx-runtime': { jsx: fakeReact.createElement, jsxs: fakeReact.createElement, Fragment: FakeFragment },
  'react-dom': fakeReactDom,
  '@deepseek-ai/dsh-client-ui-primitives': fakePrimitives,
}

function fakeRequire(spec) {
  if (Object.prototype.hasOwnProperty.call(modules, spec)) return modules[spec]
  throw new Error(`smoke: 未预期的 require("${spec}")`)
}

// ── 加载真实产物 ────────────────────────────────────────────────────────────
const code = await readFile(resolve(ROOT, 'lib/client.js'), 'utf8')

const loaded = []
const sandboxWindow = {
  __ModuleLoader__: {
    load(spec) {
      loaded.push(spec)
    },
  },
  // 计时器默认是**空实现**（永不触发），让前面的断言完全确定性；
  // 只有影子自愈那一段才换成真实计时器。
  setTimeout: () => 0,
  clearTimeout: () => {},
}
const context = vm.createContext({
  window: sandboxWindow,
  console,
  // 假 getComputedStyle：读元素上的 __style，用于验证「portal 目标必须是横向行」这道闸门
  // （内置 userRow 是 flex-direction:column，正是第一版把按钮变成单独一行的地方）。
  getComputedStyle: (element) =>
    (element !== null && element !== undefined && element.__style) || { display: 'block', flexDirection: '' },
})
vm.runInContext(code, context, { filename: 'lib/client.js' })

check('ModuleLoader.load 被调用一次', loaded.length === 1, `实际 ${loaded.length}`)
const spec = loaded[0] ?? {}
check('ModuleLoader id 是 dsh-rewind', spec.id === 'dsh-rewind', String(spec.id))
check('factory 是函数', typeof spec.factory === 'function')

const mod = spec.factory(fakeRequire)
check('factory 返回对象', typeof mod === 'object' && mod !== null)
check('导出 apply 是函数', typeof mod.apply === 'function')
check(
  'inject 清单正确（含 conversation：投送改写内容要用）',
  deepEqual(mod.inject, ['slots', 'locale', 'sessions', 'uiWorkspace', 'workspaces', 'conversation']),
  JSON.stringify(mod.inject)
)

// ── 假 ctx ──────────────────────────────────────────────────────────────────
const registrations = []
const injectedSlots = []
const dictionaries = []
let originalEntries = []
let workspaceViews = []

const ctx = {
  effect(fn) {
    fn()
    return () => {}
  },
  locale: {
    // 与真实 LocaleRuntime.register(ns, localeOrDicts, dict) 同名同形，
    // 两种重载都要支持：多语言对象形式与单语言 (ns, locale, dict) 形式。
    register(ns, localeOrDicts, dict) {
      const pairs = typeof localeOrDicts === 'string' ? [[localeOrDicts, dict]] : Object.entries(localeOrDicts)
      for (const [locale, entries] of pairs) {
        dictionaries.push({ ns, locale, keys: Object.keys(entries).sort() })
      }
      return () => {}
    },
    bind() {
      return (key) => key
    },
  },
  slots: {
    inject(slotKey, callback) {
      injectedSlots.push(slotKey)
      callback()
      return () => {}
    },
    register(options, component) {
      registrations.push({ options, component })
      return () => {}
    },
    entries(slotKey) {
      return slotKey === 'conversation.chat.node' ? originalEntries : []
    },
  },
  sessions: {
    fork: async () => 'session-child',
    create: async () => 'session-blank',
    binding: () => undefined,
    list: { getSnapshot: () => ({ byId: { 'session-original': { cwd: 'D:\\demo' } } }) },
  },
  workspaces: { list: { getSnapshot: () => ({ items: workspaceViews }) } },
  uiWorkspace: {
    openSession() {},
    archiveSession: async () => {},
    unarchiveSession: async () => {},
  },
  conversation: {
    input: {
      for() {
        return { setDraft() {}, submit() {}, state: { getSnapshot: () => ({ draft: '' }) } }
      },
    },
  },
}

mod.apply(ctx)

// ── 断言注册 ────────────────────────────────────────────────────────────────
const byId = (id) => registrations.find((entry) => entry.options.id === id)
const byKey = (key) => registrations.find((entry) => entry.options.key === key)

check('注册了 3 个槽位贡献（2 个 chat.node 影子 + 1 个 shell.overlay）', registrations.length === 3, `实际 ${registrations.length}`)
check(
  'inject 的槽位 key 正确',
  deepEqual(injectedSlots, ['conversation.chat.node', 'conversation.chat.node', 'shell.overlay']),
  JSON.stringify(injectedSlots)
)
check('注册了 zh 与 en 两套字典', deepEqual(dictionaries.map((d) => d.locale), ['zh', 'en']))
check(
  '字典命名空间是 rewind，且 zh/en key 集合一致',
  dictionaries.length === 2
    && dictionaries[0].ns === 'rewind'
    && dictionaries[1].ns === 'rewind'
    && deepEqual(dictionaries[0].keys, dictionaries[1].keys)
)
check('chat.node 的 user 键注册声明 locale=chat（为了转发给内置渲染器）', byKey('user')?.options.locale === 'chat')
check('chat.node 的 steering 键也被覆盖', byKey('steering') !== undefined)
check('shell.overlay 注册 id=rewind-notice', byId('rewind-notice')?.options.order === 40)
check('不再注册 composer.dock（投送已改为与视图无关的 input facade）', byId('rewind-draft') === undefined)

// ── 断言纯工具 ──────────────────────────────────────────────────────────────
const internals = mod.__internals
check('导出 __internals（供冒烟使用）', typeof internals === 'object' && internals !== null)

check('turnOf: turn 位置', internals.turnOf({ location: { kind: 'turn', turn: { turn: 3 } } }) === 3)
check('turnOf: step 位置', internals.turnOf({ location: { kind: 'step', turn: { turn: 5 }, step: {} } }) === 5)
check('turnOf: session 位置 → undefined', internals.turnOf({ location: { kind: 'session' } }) === undefined)
check('turnOf: 缺 location → undefined', internals.turnOf({}) === undefined)

check(
  'plainTextOf: 抽取 text 块并以换行连接',
  internals.plainTextOf([
    { type: 'text', text: '你好' },
    { type: 'image', attachment: {} },
    { type: 'text', text: '世界' },
  ]) === '你好\n世界'
)
check('plainTextOf: 非数组 → 空串', internals.plainTextOf(undefined) === '')

// ── 断言「定位内置动作行」的纯逻辑（真 DOM 里靠它把按钮 portal 到复制同一行）──
// 假 DOM 按**真实层级**搭（两个子代理各自逐行核实过）：
//   flowItem[data-chat-flow-kind] > div[data-slot="conversation.chat.node"][display:contents]
//   > userRow(column) > div.actions(row) > button[aria-label=复制] > svg > path
// 我们的 Fragment 输出（内置渲染器 → 锚点 → 我们的行）落在那个 data-slot 包装层里。
// 上一版就是漏了这层包装：把「包装层的最后一个子」（= 我们自己的行）当成了动作行。
{
  /** 迷你 DOM：支持 children / first|lastElementChild / querySelector(All) / closest / hasAttribute。 */
  const matchesSelector = (element, selector) => {
    const labelled = /^button\[aria-label="(.*)"\]$/.exec(selector)
    if (selector === 'button') return element.tagName === 'BUTTON'
    if (selector === 'svg > path') return element.tagName === 'PATH' && element.parentElement?.tagName === 'SVG'
    if (labelled !== null) return element.tagName === 'BUTTON' && element.getAttribute('aria-label') === labelled[1]
    if (selector.startsWith('[') && selector.endsWith(']')) return element.hasAttribute(selector.slice(1, -1))
    const slot = /^div\[data-slot="(.*)"\]$/.exec(selector)
    if (slot !== null) return element.tagName === 'DIV' && element.getAttribute('data-slot') === slot[1]
    return false
  }

  const el = (tagName, attrs = {}, style = { display: 'block', flexDirection: '' }) => {
    const node = {
      tagName,
      className: attrs.class ?? '',
      attrs,
      children: [],
      parentElement: null,
      isConnected: true,
      __style: style,
      getAttribute: (name) => (Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null),
      hasAttribute: (name) => Object.prototype.hasOwnProperty.call(attrs, name),
      closest(selector) {
        let current = node
        while (current !== null && current !== undefined) {
          if (matchesSelector(current, selector)) return current
          current = current.parentElement
        }
        return null
      },
      querySelector(selector) {
        const scoped = selector.startsWith(':scope > ')
        const rest = scoped ? selector.slice(':scope > '.length) : selector
        for (const child of node.children) {
          if (matchesSelector(child, rest)) return child
          if (scoped) continue
          const hit = child.querySelector(selector)
          if (hit !== null) return hit
        }
        return null
      },
      querySelectorAll(selector) {
        const found = []
        for (const child of node.children) {
          if (matchesSelector(child, selector)) found.push(child)
          found.push(...child.querySelectorAll(selector))
        }
        return found
      },
      append(...nodes) {
        for (const child of nodes) {
          child.parentElement = node
          node.children.push(child)
        }
        return node
      },
    }
    Object.defineProperty(node, 'firstElementChild', { get: () => node.children[0] ?? null })
    Object.defineProperty(node, 'lastElementChild', {
      get: () => node.children[node.children.length - 1] ?? null,
    })
    return node
  }

  const ROW = { display: 'flex', flexDirection: 'row' }
  const COLUMN = { display: 'flex', flexDirection: 'column' }
  // 复制图标在 0.1.6 与 0.1.7 是两种画法（0.1.7 改成 rect + fill path）——
  // 两代前缀都必须认得，否则升级后会静默丢掉「语言无关」这条定位路径。
  const COPY_PATH_017 = 'M11.9792 1.53296C13.36 1.53296 14.4792 2.5 14.4792 3.8Z'
  const COPY_PATH_016 = 'M6.14929 4.02032Z'

  const buildCopyButton = (label, path = COPY_PATH_017) => {
    const button = el('BUTTON', label === undefined ? {} : { 'aria-label': label })
    const svg = el('SVG')
    svg.append(el('PATH', { d: path }))
    button.append(svg)
    return button
  }

  const flow = el('DIV', { 'data-chat-flow-kind': 'user' })
  const outlet = el('DIV', { 'data-slot': 'conversation.chat.node' }, { display: 'contents', flexDirection: '' })
  const userRow = el('DIV', { class: 'userRow' }, COLUMN)
  const userStack = el('DIV', { class: 'userStack' }, COLUMN)
  const bubble = el('DIV', { class: 'bubble' })
  const actionsRow = el('DIV', { class: 'actions' }, ROW)
  const copyButton = buildCopyButton('复制')
  const anchor = el('SPAN', { 'data-dsh-rewind-anchor': '', hidden: '' })
  const ourRow = el('DIV', { 'data-dsh-rewind-row': '' }, ROW)
  flow.append(outlet)
  outlet.append(userRow, anchor, ourRow) // Fragment 顺序：内置渲染器 → 锚点 → 我们的行
  userRow.append(userStack, actionsRow)
  userStack.append(bubble)
  actionsRow.append(el('SPAN', { class: 'timeStart' }), copyButton)

  const t = (key) => (key === 'copy' ? '复制' : key === 'copied' ? '复制成功' : key)

  check('directChildOf: 爬到指定祖先的直接子', internals.directChildOf(copyButton, actionsRow) === copyButton)
  check('directChildOf: 祖先不在链上时返回 undefined', internals.directChildOf(copyButton, el('DIV')) === undefined)
  check('outletOf: 认准 div[data-slot="conversation.chat.node"]', internals.outletOf(flow) === outlet)
  check(
    'builtinRootOf: 穿过 data-slot 包装层拿到内置渲染器根（回归：差了这一层就是那个 bug）',
    internals.builtinRootOf(flow) === userRow
  )
  check('actionsRowByStructure: 返回动作行', internals.actionsRowByStructure(userRow) === actionsRow)
  check(
    'isPortalTargetOk: 动作行可进；userRow（列方向）与我们的行一律拒绝（两个失败模式的闸门）',
    internals.isPortalTargetOk(actionsRow) === true &&
      internals.isPortalTargetOk(userRow) === false &&
      internals.isPortalTargetOk(ourRow) === false &&
      internals.isPortalTargetOk(outlet) === false
  )
  const located = internals.locateActionsRow(flow, t)
  check(
    'locateActionsRow: 端到端定位到内置动作行（via structure），**不是**我们自己的行',
    located?.row === actionsRow && located?.via === 'structure',
    JSON.stringify(located?.via)
  )
  check('locateActionsRow: 拿不到就返回 undefined（退化成自己一行，绝不 portal 到自己身上）', internals.locateActionsRow(null, t) === undefined)

  check('findCopyButton: 图标 path 优先，且父父元素就是内置根', internals.findCopyButton(flow, userRow, t) === copyButton)
  check(
    'actionsRowByCopyButton: 复制按钮的父元素就是动作行（Tooltip 不插层）',
    internals.actionsRowByCopyButton(flow, userRow, t) === actionsRow
  )

  // 气泡里可能有 JsonBlock 的同款复制图标按钮 → 必须被排除
  const jsonRow = el('DIV', { class: 'jsonHeader' }, ROW)
  jsonRow.append(buildCopyButton('复制'))
  bubble.append(jsonRow)
  check('findCopyButton: 排除气泡里 JsonBlock 的同款复制图标按钮', internals.findCopyButton(flow, userRow, t) === copyButton)

  // 去掉 aria-label 后仍能靠图标找到（语言无关）
  copyButton.attrs = {}
  check('findCopyButton: 没有 aria-label 也能靠图标找到（语言无关）', internals.findCopyButton(flow, userRow, t) === copyButton)

  // 老版本（≤0.1.6）的复制图标 path 也必须认得（dsh 0.1.7 换了画法）
  actionsRow.append(buildCopyButton('旧版复制', COPY_PATH_016))
  check(
    'copyIconButtons: 0.1.6 与 0.1.7 两代复制图标 path 都认得',
    internals.copyIconButtons(flow).length === 3,
    `实际 ${internals.copyIconButtons(flow).length}`
  )

  // 诊断信息不能在失败路径上抛错，且要带够线索
  const noDom = internals.describeLocateFailure(undefined, undefined)
  check(
    'describeLocateFailure: 无 DOM 时不炸且标明 flowItemFound=false',
    noDom?.flowItemFound === false && typeof noDom?.createPortal === 'string'
  )
  const withDom = internals.describeLocateFailure(flow, t)
  check(
    'describeLocateFailure: 带出 flowKind / 包装层 / 候选子元素 / 文案线索',
    withDom?.flowItemFound === true &&
      withDom?.flowKind === 'user' &&
      withDom?.firstChildIsSlotWrap === true &&
      withDom?.copyLabel === '复制' &&
      withDom?.builtinRootChildren?.length === 2,
    JSON.stringify(withDom)
  )
}

// ── 断言组件结构 ────────────────────────────────────────────────────────────
/** 递归收集树里的 button 元素（按钮被 Tooltip 包着，不能只看直接子节点）。 */
function collectButtons(node, out = []) {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (node.type === 'button') out.push(node)
  for (const child of node.children ?? []) collectButtons(child, out)
  return out
}

const FakeOriginal = function FakeOriginal() {}
originalEntries = [
  { options: { key: 'user' }, component: FakeOriginal, registrant: '@deepseek-ai/dsh-client-ui-chat' },
  { options: { key: 'user' }, component: registrations[0].component, registrant: 'dsh-rewind' },
]

const userNode = {
  kind: 'user',
  key: 'user:1',
  anchorSeq: 7,
  location: { kind: 'turn', turn: { turn: 2, start: { seq: 141 }, end: { seq: 200 } } },
  data: { kind: 'user', seq: 144, time: 1, content: [{ type: 'text', text: '原始问题' }], source: {} },
}
/** 真实日志里 turn=2 的 turn/end seq 是 139（见 docs/plan.md 的实测表）。 */
const TURN_ENDS_TWO = new Map([[1, 139], [2, 200]])
const sessionProps = {
  node: userNode,
  sessionId: 'session-original',
  useChat: (selector) => selector({ legacy: { turnEnds: TURN_ENDS_TWO } }),
  t: (key) => key,
  renderMessageImages: () => null,
  openFile() {},
  openSkill() {},
  forkAt() {},
}

const probe = internals.MessageActions(sessionProps)
check('entry 组件外面套了自兜错边界（渲染抛错不冒泡给宿主）', probe?.type === internals.ShadowBoundary)
check('边界内才是真正的实现 MessageActionsInner', probe?.children?.[0]?.type === internals.MessageActionsInner)

const tree = internals.MessageActionsInner(sessionProps)
check('组件返回 Fragment 树', Array.isArray(tree?.children))
check('第一个孩子是内置渲染器（原样复用，不重画气泡）', tree?.children?.[0]?.type === FakeOriginal)

const anchorElement = (tree?.children ?? []).find((child) => child?.props?.['data-dsh-rewind-anchor'] !== undefined)
check('渲染了隐藏锚点（供 portal 定位内置动作行）', anchorElement !== undefined && anchorElement.props.hidden === true)

const rowElement = (tree?.children ?? []).find((child) => child?.props?.['data-dsh-rewind-row'] !== undefined)
const rowProps = rowElement?.props ?? {}
check('找到我们的动作行（未定位到内置行时就在本地渲染，作为兜底）', rowProps['data-dsh-rewind-row'] === '')
// ↓ 这一组是「第一版竖排」那个 bug 的回归断言：布局必须在**内联样式**里。
check('动作行用内联 display:flex（不依赖样式表）', rowProps.style?.display === 'flex', JSON.stringify(rowProps.style))
check('动作行内联 flexDirection:row（横向排列，回归点）', rowProps.style?.flexDirection === 'row')
check('动作行内联 justifyContent:flex-end（靠右）', rowProps.style?.justifyContent === 'flex-end')
check('动作行内联 alignItems:center', rowProps.style?.alignItems === 'center')

const buttons = collectButtons(tree)
check('动作行有 2 个按钮（撤回 + 编辑）', buttons.length === 2, `实际 ${buttons.length}`)
check(
  '两个按钮都有内联布局（inline-flex）',
  buttons.every((button) => button.props.style?.display === 'inline-flex')
)
check(
  '两个按钮都可点（有 onClick、无 aria-disabled/data-unavailable）',
  buttons.every((button) => typeof button.props.onClick === 'function')
    && buttons.every((button) => button.props['aria-disabled'] === undefined)
    && buttons.every((button) => button.props['data-unavailable'] === undefined)
)
// 回归：图标尺寸由 ICON_SIZE 显式传入（0.1.5–0.1.7 的图标组件都吃 `size`），
// 视觉重量再靠外面包一层内联 transform 拉齐。
check(
  '图标包了一层内联 transform 放大（与内置实心复制图标的视觉重量对齐）',
  buttons.every((button) => {
    const wrapper = button.children?.[0]
    return typeof wrapper?.props?.style?.transform === 'string' && wrapper.props.style.transform.startsWith('scale(')
  }),
  JSON.stringify(buttons.map((button) => button.children?.[0]?.props?.style?.transform))
)
check(
  '图标拿到显式 size（0.1.7 的图标按它定盒子，而不是靠 CSS 默认值）',
  buttons.every((button) => button.children?.[0]?.children?.[0]?.props?.size === 16),
  JSON.stringify(buttons.map((button) => button.children?.[0]?.children?.[0]?.props))
)
check('默认不渲染弹窗', tree?.children?.[tree.children.length - 1] === null)

// 能力探测兜底：没有 useChat 时只渲染内置渲染器，不炸。
check(
  '缺 useChat 时退化为只渲染内置渲染器',
  internals.MessageActions({ node: userNode, t: (key) => key })?.type === FakeOriginal
)

// 首条消息：不提供「撤回」，只提供「编辑」。
const firstTree = internals.MessageActionsInner({
  ...sessionProps,
  node: {
    ...userNode,
    location: { kind: 'turn', turn: { turn: 1, start: { seq: 7 }, end: { seq: 84 } } },
  },
})
check('首条消息只有「编辑」一个按钮', collectButtons(firstTree).length === 1, `实际 ${collectButtons(firstTree).length}`)

// 中途插话（steering）：两个按钮都不可点（aria-disabled，不是 disabled，否则 tooltip 弹不出来）。
const steeringButtons = collectButtons(
  internals.MessageActionsInner({
    ...sessionProps,
    node: { ...userNode, kind: 'steering', data: { ...userNode.data, kind: 'steering' } },
  })
)
check(
  'steering 消息的两个按钮都标记为不可用且没有 onClick',
  steeringButtons.length === 2
    && steeringButtons.every((button) => button.props['aria-disabled'] === true)
    && steeringButtons.every((button) => button.props['data-unavailable'] === true)
    && steeringButtons.every((button) => button.props.onClick === undefined),
  `按钮数 ${steeringButtons.length}`
)

// 权威锚点缺失时（只看加载窗口里的 turnEnds）：**不给按钮**，绝不用 seq-1 之类推断。
const noAnchorButtons = collectButtons(
  internals.MessageActionsInner({
    ...sessionProps,
    useChat: (selector) => selector({ legacy: { turnEnds: new Map() } }),
  })
)
check(
  '拿不到权威锚点时撤回按钮不可用（不做危险推断）',
  noAnchorButtons.length === 2
    && noAnchorButtons.every((button) => button.props.onClick === undefined)
    && noAnchorButtons.every((button) => button.props['aria-disabled'] === true),
  `按钮数 ${noAnchorButtons.length}`
)

// ── 假 cut 环境：记录 fork/create/open/archive + 草稿与发送 ─────────────────
function makeCutEnv(options = {}) {
  const calls = []
  const drafts = []
  const submits = []
  const state = { draft: '' }
  const env = {
    calls,
    drafts,
    submits,
    ctx: {
      ...ctx,
      sessions: {
        fork: async (forkOptions) => {
          calls.push(['fork', forkOptions])
          return 'session-child'
        },
        create: async (createOptions) => {
          calls.push(['create', createOptions])
          return 'session-blank'
        },
        binding: (id) =>
          typeof id === 'string' && id.indexOf('session-') === 0 ? { sessionId: id, ctx: { scopedSession: id } } : undefined,
        list: { getSnapshot: () => ({ byId: { 'session-original': { cwd: 'D:\\demo' } } }) },
      },
      workspaces: { list: { getSnapshot: () => ({ items: workspaceViews }) } },
      uiWorkspace: {
        openSession: (id) => calls.push(['open', id]),
        archiveSession: async (id) => calls.push(['archive', id]),
        unarchiveSession: async (id) => calls.push(['unarchive', id]),
      },
      conversation: {
        input: {
          for: (actx) => {
            if (options.rejectInput === true) throw new Error('模拟：输入作用域未就绪')
            return {
              setDraft: (text) => {
                drafts.push([actx.scopedSession, text])
                state.draft = text
              },
              // 真实输入机提交成功会把草稿清掉（commit-draft），这里照同语义模拟。
              submit: () => {
                submits.push(state.draft)
                if (options.submitRefused !== true) state.draft = ''
              },
              state: { getSnapshot: () => state },
            }
          },
        },
      },
    },
  }
  return env
}

// ── 撤回：fork 锚点 + 归档顺序 + 不投送 ─────────────────────────────────────
{
  const env = makeCutEnv()
  mod.apply(env.ctx)
  buttons[0].props.onClick()
  await delay(20)
  check(
    '点「撤回」→ fork 的 atSeq = 上一回合的 turn/end seq（139），且**不改标题**（无 increaseTitle）',
    deepEqual(env.calls[0], ['fork', { sessionId: 'session-original', atSeq: 139 }]),
    JSON.stringify(env.calls[0])
  )
  check('撤回：切到子会话', deepEqual(env.calls[1], ['open', 'session-child']), JSON.stringify(env.calls[1]))
  check('撤回：归档原会话（在切会话之后）', deepEqual(env.calls[2], ['archive', 'session-original']), JSON.stringify(env.calls[2]))
  check('撤回：不投送任何草稿', env.drafts.length === 0)
  check('撤回：不自动发送', env.submits.length === 0)
  check(
    '撤回：成功时**不弹任何提示**（用户要求去掉归档提醒）',
    internals.getNotice() === null,
    JSON.stringify(internals.getNotice())
  )
}

// ── 中间消息编辑：fork + 归档 + 投送到**子会话** + 自动发送 ──────────────────
{
  const env = makeCutEnv()
  mod.apply(env.ctx)
  await internals.cutAndSwitch({
    sessionId: 'session-original',
    atSeq: 139,
    draftText: '改写后的中间问题',
    autoSend: true,
  })
  check('编辑：先 fork（同撤回的锚点语义，且不改标题）', deepEqual(env.calls[0], ['fork', { sessionId: 'session-original', atSeq: 139 }]), JSON.stringify(env.calls[0]))
  check('编辑：切到子会话', deepEqual(env.calls[1], ['open', 'session-child']), JSON.stringify(env.calls[1]))
  check('编辑：归档原会话', deepEqual(env.calls[2], ['archive', 'session-original']), JSON.stringify(env.calls[2]))
  check('编辑：改写内容投送到子会话（不是原会话）', deepEqual(env.drafts, [['session-child', '改写后的中间问题']]), JSON.stringify(env.drafts))
  check('编辑：autoSend 真的发送了（且发的是改写后的文本）', deepEqual(env.submits, ['改写后的中间问题']), JSON.stringify(env.submits))
  check(
    '编辑：成功时**不弹任何提示**',
    internals.getNotice() === null,
    JSON.stringify(internals.getNotice())
  )
}

// ── 首条编辑：空白会话优先 workspaceId + 投送 + 自动发送 ────────────────────
{
  workspaceViews = [{ workspaceId: 'ws-1', path: 'D:\\demo', title: 'demo', sessionIds: ['session-original'] }]
  const env = makeCutEnv()
  mod.apply(env.ctx)
  await internals.cutAndSwitch({
    sessionId: 'session-original',
    atSeq: undefined,
    draftText: '改写后的第一句',
    autoSend: true,
  })
  check(
    '编辑首条：优先用 workspaceId 建空白会话（保证挂在同一个 Workspace 下）',
    deepEqual(env.calls[0], ['create', { workspaceId: 'ws-1' }]),
    JSON.stringify(env.calls[0])
  )
  check('编辑首条：走空白会话而非 fork', env.calls[0][0] === 'create')
  check('编辑首条：切到空白会话', deepEqual(env.calls[1], ['open', 'session-blank']), JSON.stringify(env.calls[1]))
  check('编辑首条：投送到空白会话并自动发送', deepEqual(env.drafts, [['session-blank', '改写后的第一句']]) && deepEqual(env.submits, ['改写后的第一句']))

  // 找不到 Workspace 归属时回退 cwd；不投送（draftText=null）时不 setDraft/submit。
  workspaceViews = []
  const env2 = makeCutEnv()
  mod.apply(env2.ctx)
  await internals.cutAndSwitch({ sessionId: 'session-original', atSeq: undefined, draftText: null, autoSend: false })
  check('找不到 Workspace 归属时回退到 cwd', deepEqual(env2.calls[0], ['create', { cwd: 'D:\\demo' }]), JSON.stringify(env2.calls[0]))
  check('draftText=null 时不 setDraft / 不 submit', env2.drafts.length === 0 && env2.submits.length === 0)
}

// ── 投送失败：不抛穿、不丢撤销入口 ─────────────────────────────────────────
{
  workspaceViews = [{ workspaceId: 'ws-1', path: 'D:\\demo', title: 'demo', sessionIds: ['session-original'] }]
  const env = makeCutEnv({ rejectInput: true })
  mod.apply(env.ctx)
  let threw = false
  try {
    await internals.cutAndSwitch({ sessionId: 'session-original', atSeq: 139, draftText: '送不进去的文本', autoSend: true })
  } catch {
    threw = true
  }
  check('投送失败不会把异常抛给调用方', threw === false)
  const notice = internals.getNotice()
  check(
    '投送失败时提示里带上「请手动发送」并**保留撤销入口**',
    notice !== null && typeof notice.text === 'string' && notice.text.indexOf('toast.deliverFailed') === 0 && notice.canUndo === true,
    JSON.stringify(notice)
  )
  check('投送失败时不发送', env.submits.length === 0)
}

// ── 发送被静默拒绝（草稿没被清空）：要能识别出来，别让用户以为发了 ────────────
// 这一段开始需要真实计时器（投送/发送的等待与轮询都是 window.setTimeout 驱动的）；
// 前面的断言刻意用空计时器保证确定性。
sandboxWindow.setTimeout = (fn, ms) => setTimeout(fn, ms)
sandboxWindow.clearTimeout = (handle) => clearTimeout(handle)
{
  workspaceViews = [{ workspaceId: 'ws-1', path: 'D:\\demo', title: 'demo', sessionIds: ['session-original'] }]
  const env = makeCutEnv({ submitRefused: true })
  mod.apply(env.ctx)
  const startedAt = Date.now()
  await internals.cutAndSwitch({ sessionId: 'session-original', atSeq: 139, draftText: '被拒绝的文本', autoSend: true })
  const notice = internals.getNotice()
  check('发送被拒时照样 submit 了一次', deepEqual(env.submits, ['被拒绝的文本']), JSON.stringify(env.submits))
  check(
    '发送被拒（草稿没被清空）时给出「请按回车」提示并保留撤销入口',
    notice !== null
      && typeof notice.text === 'string'
      && notice.text.indexOf('toast.deliverFailed') === 0
      && notice.text.indexOf('发送没被接受') !== -1
      && notice.canUndo === true,
    JSON.stringify(notice)
  )
  check('发送被拒的判定不是瞬时的（确实等过一轮）', Date.now() - startedAt >= 200, `${Date.now() - startedAt}ms`)
}

// ── 断言影子覆盖的顺序自愈 ──────────────────────────────────────────────────
// 内置条目一开始"更低"（赢），我们每重注册一次都会拿到更低的 priority；
// 到第 4 次时我们反超内置 → 自愈应当停止。
const shadowRegisters = new Map()
const shadowOwners = new Map()
const FakeBuiltinShadow = function FakeBuiltinShadow() {}
const BUILTIN_PRIORITY = -3
const shadowKeys = ['user', 'steering']

const shadowCtx = {
  ...ctx,
  slots: {
    inject(slotKey, callback) {
      callback()
      return () => {}
    },
    register(options, component) {
      const count = (shadowRegisters.get(options.key) ?? 0) + 1
      shadowRegisters.set(options.key, count)
      shadowOwners.set(options.key, component)
      return () => {}
    },
    entries() {
      const out = []
      for (const key of shadowKeys) {
        out.push({ options: { key, priority: BUILTIN_PRIORITY }, component: FakeBuiltinShadow, registrant: '@deepseek-ai/dsh-client-ui-chat' })
        const owner = shadowOwners.get(key)
        if (owner !== undefined) {
          out.push({
            options: { key, priority: -(shadowRegisters.get(key) ?? 0) },
            component: owner,
            registrant: 'dsh-rewind',
          })
        }
      }
      return out
    },
  },
}

sandboxWindow.setTimeout = (fn, ms) => setTimeout(fn, ms)
sandboxWindow.clearTimeout = (handle) => clearTimeout(handle)
mod.apply(shadowCtx)
await delay(700)
check(
  '影子自愈：抢不过内置时反复重注册（每 key 4 次后反超）',
  shadowRegisters.get('user') === 4 && shadowRegisters.get('steering') === 4,
  `user=${shadowRegisters.get('user')} steering=${shadowRegisters.get('steering')}`
)
const settled = shadowRegisters.get('user')
await delay(400)
check('影子自愈：抢到之后停止重注册（不无限抖动）', shadowRegisters.get('user') === settled, `${settled} → ${shadowRegisters.get('user')}`)

// ── 回归①：图标解析走 dsh 0.1.7 的新导出名 ──────────────────────────────────
// dsh 0.1.7 把 primitives 的图标从 IconXxx16 改名成 IconXxxRegular / IconXxxMedium；
// 静态绑定旧名会拿到 undefined，createElement(undefined) 抛错后宿主的错误边界会把整个
// entry 一次性退休 —— 表现就是「按钮整体消失且刷新无效」。这里钉住解析结果。
check(
  '图标解析命中 0.1.7 的 Regular 导出（不再是 undefined 的旧名）',
  mod.__internals.RewindIcon === fakePrimitives.IconRefreshOutlineRegular
    && mod.__internals.EditIcon === fakePrimitives.IconEditOutlineRegular
)

// ── 回归①-b：ShadowBoundary 的三级退化 ───────────────────────────────────────
// 边界必须（a）正常时原样渲染子树；（b）抛错后退化为渲染内置渲染器而不是空白；
// （c）二次崩溃时渲染 null —— 绝不把错误再放出去（那正是让宿主退休整个 entry 的路径）。
mod.apply(ctx) // 让 clientCtx 指回「带内置条目」的 ctx，originalRendererFor 才拿得到内置渲染器
const boundaryProbe = new internals.ShadowBoundary({
  nodeKind: 'user',
  nodeKey: 'user:1',
  originalProps: sessionProps,
  children: 'CHILD-MARKER',
})
check('ShadowBoundary：正常时原样渲染子树', boundaryProbe.render() === 'CHILD-MARKER')
boundaryProbe.state = {
  ...boundaryProbe.state,
  ...internals.ShadowBoundary.getDerivedStateFromError(new Error('boom')),
}
check(
  'ShadowBoundary：抛错后退化为渲染内置渲染器（而不是渲染成空白）',
  boundaryProbe.render()?.type === FakeOriginal
)
boundaryProbe.state = { ...boundaryProbe.state, fatal: true }
check(
  'ShadowBoundary：二次崩溃时渲染 null（宁可这条消息不显示，也不让错误换掉整个 entry）',
  boundaryProbe.render() === null
)

// ── 回归②：entry 被宿主退休后，自愈必须继续重注册 ────────────────────────────
// 「刷新也救不回来」的直接原因是 raw entries() 在 entry 被退休(abdicate)后**仍然**列出它，
// 拿它判「我赢了吗」永远得到「是」。这里让 entriesOfSlot() 永远只返回内置条目
// （等价于我们已被退休），断言自愈仍会一路重试到上限。
const retiredRegisters = new Map()
const retiredCtx = {
  ...ctx,
  slots: {
    inject(slotKey, callback) {
      callback()
      return () => {}
    },
    register(options) {
      retiredRegisters.set(options.key, (retiredRegisters.get(options.key) ?? 0) + 1)
      return () => {}
    },
    /** raw ledger：被退休的 entry 依然在这里 —— 所以它不能用来判赢。 */
    entries() {
      return shadowKeys.map((key) => ({
        options: { key, priority: -999 },
        component: mod.__internals.MessageActions,
        registrant: 'dsh-rewind',
      }))
    },
    /** 赢家投影：我们已经不在台上，这里只剩内置条目。 */
    entriesOfSlot() {
      return shadowKeys.map((key) => ({
        options: { key, priority: 0 },
        component: FakeBuiltinShadow,
        registrant: '@deepseek-ai/dsh-client-ui-chat',
      }))
    },
  },
}
mod.apply(retiredCtx)
await delay(1300)
check(
  '影子自愈：entriesOfSlot 显示我们已被退休时仍会重注册（不误判为「已经赢了」）',
  retiredRegisters.get('user') === 12 && retiredRegisters.get('steering') === 12,
  `user=${retiredRegisters.get('user')} steering=${retiredRegisters.get('steering')}`
)

// ── 回归③：图标候选链的两端 ────────────────────────────────────────────────
// 用不同的 primitives 形状**各重新加载一份产物**，验证候选链真的按级回落，
// 并且任何一级都不会把 undefined 递给 React。
async function loadBundleWith(primitives) {
  const bundleCode = await readFile(resolve(ROOT, 'lib/client.js'), 'utf8')
  const loadedSpecs = []
  const sandbox = {
    __ModuleLoader__: {
      load(spec) {
        loadedSpecs.push(spec)
      },
    },
    setTimeout: () => 0,
    clearTimeout: () => {},
  }
  vm.runInContext(
    bundleCode,
    vm.createContext({
      window: sandbox,
      console,
      getComputedStyle: (element) =>
        (element !== null && element !== undefined && element.__style) || { display: 'block', flexDirection: '' },
    }),
    { filename: 'lib/client.js（备用 primitives）' }
  )
  return loadedSpecs[0].factory((target) => {
    if (target === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    if (Object.prototype.hasOwnProperty.call(modules, target)) return modules[target]
    throw new Error(`smoke: 未预期的 require("${target}")`)
  })
}

const barePrimitives = {
  Button: fakePrimitives.Button,
  Modal: fakePrimitives.Modal,
  Tooltip: fakePrimitives.Tooltip,
}

// ③-a 一个图标都没有 → 自绘兜底（仍是组件，永不 undefined）
const noIconMod = await loadBundleWith(barePrimitives)
check(
  'primitives 没有任何图标导出时图标回落到自绘组件（仍是组件，永不 undefined）',
  typeof noIconMod.__internals.RewindIcon === 'function' && typeof noIconMod.__internals.EditIcon === 'function'
)

// ③-b 只有 dsh ≤0.1.6 的旧名 → 走候选链的最后一级（而不是掉到自绘兜底）
const LegacyRefresh = function LegacyRefresh() {}
const LegacyEdit = function LegacyEdit() {}
const legacyMod = await loadBundleWith({
  ...barePrimitives,
  IconRefreshOutline16: LegacyRefresh,
  IconEditOutline16: LegacyEdit,
})
check(
  '只有 0.1.6 旧图标名时也解析得到（候选链最后一级，而不是退到自绘兜底）',
  legacyMod.__internals.RewindIcon === LegacyRefresh && legacyMod.__internals.EditIcon === LegacyEdit
)

// ── 报告 ────────────────────────────────────────────────────────────────────
if (failures.length > 0) {
  process.stdout.write(`\n${failures.length} 项未通过：\n`)
  for (const line of failures) process.stdout.write(`  FAIL ${line}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`\n全部 ${passed} 项冒烟断言通过\n`)
}
