/**
 * dsh-rewind 浏览器半：在每条用户消息（含回合中途插话）下加「撤回 / 编辑」。
 *
 * 设计要点（依据见 docs/plan.md）：
 *
 * 1. 按钮落点：DSH 没有「用户消息动作」插槽（唯一的 per-message 动作槽
 *    `conversation.chat.assistant-actions` 是 assistant 专用的），所以走
 *    `conversation.chat.node` 这个 **keyed 槽的影子覆盖**。但**不重画气泡**——
 *    从 `ctx.slots.entries()` 里取出内置的同键渲染器，原样
 *    `React.createElement(Original, props)` 渲染，再把我们自己的一行按钮追加在它下面。
 *
 *    ⚠️ priority 的真实语义（本机源码实测，别被直觉骗了）：client runner 的
 *    `guardedSlots` 对**所有非 chain 槽无条件覆盖** `options.priority`
 *    （`priority = env.allocatePriority()`，`--nextPriority` 递减），
 *    而「同 cell 最低者渲染」+「后注册者拿到更低的值」⇒ **谁最后注册谁赢**。
 *    也就是说影子覆盖成立与否取决于插件加载顺序，不归我们决定，
 *    所以注册后用 `ctx.slots.entries()` 自查赢家、不是自己就重注册。见 registerShadow()。
 *
 * 2. 布局必须用**内联样式**：第一版把 `display:flex` 放在注入的样式表里，
 *    实测在宿主上两个按钮竖着堆叠了——说明那条 `.dsh-rewind-row` 规则没有生效
 *    （宿主 CSS 的层叠/优先级我们无法预判）。关键布局一律内联（内联样式优先级最高、
 *    且不依赖样式表是否注入成功），样式表只负责 :hover 显隐、textarea、toast 这些装饰。
 *
 * 3. 撤回语义：会话日志是**追加式**的，官方没有任何「原地删除/截断」原语。
 *    官方唯一的「回退到某条之前」是 fork：
 *      `ctx.sessions.fork({sessionId, atSeq})`，边界 = atSeq 之后（含）第一个 `turn/end`。
 *    所以要传「目标消息所属回合的**上一回合**的 turn/end seq」，seq 直接从 chat 快照的
 *    `legacy.turnEnds`（由 `turn.end.seq` 构建）取，**不做 seq-1 这类推断**
 *    （真实日志实测：turn/start(T) 与 turn/end(T-1) 之间还夹着 1~2 个事件）。
 *    首条消息没有可切的前置边界 → `ctx.sessions.create({workspaceId})` 建全新空白会话。
 *    切完会话后 `ctx.uiWorkspace.archiveSession(原会话)` 归档原会话（可撤销）。
 *
 * 4. 编辑：弹窗回填原文 → 确认后做同一套 cut → 把改好的文本送进**新会话**输入框并
 *    **自动发送**。投送**不能**依赖「composer 挂载时应用草稿」这类 slot 手法：
 *    全新空会话是 `variant: 'hero'`，`conversation.composer.dock` 根本不渲染
 *    （实测症状：草稿要等用户手动发出第一条消息才出现）。
 *    所以走与视图无关的 `ctx.conversation.input.for(binding.ctx)`：
 *    `setDraft(text)` → 用 `input.state.getSnapshot().draft` 确认真的进去了 → 再 `submit()`。
 *
 * 5. 回合中途插话（steering）：无法精确切到它之前，两个按钮一律置灰并给出原因，
 *    不做假承诺。
 *
 * 运行时只能 require 客户端 shell 的**静态共享模块表**里的包：
 * react / react/jsx-runtime / react-dom / react-dom/client / @deepseek-ai/cordis /
 * @deepseek-ai/dsh-client-store / @deepseek-ai/dsh-client-ui-slots /
 * @deepseek-ai/dsh-client-ui-primitives / @deepseek-ai/dsh-client-ui-dockkit。
 * 其它 @deepseek-ai/* 包（含 dsh-client-ui-chat、dsh-client-ui-conversation）只能
 * 类型引用，运行时 import 会打进第二份实例。本文件因此只 require primitives。
 *
 * @module dsh-rewind/client
 */

import * as React from 'react'
import { createPortal } from 'react-dom'

import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'

const { Button, Modal, Tooltip } = primitives

/**
 * ── 图标解析：跨 dsh 版本的安全取用 ─────────────────────────────────────────
 *
 * 教训（dsh 0.1.7 实测）：primitives 把图标导出**改名**了 ——
 * `IconRefreshOutline16` / `IconEditOutline16` → `IconRefreshOutlineRegular`（1px 描边）/
 * `IconRefreshOutlineMedium`（1.3px）/ `IconEditOutlineRegular` / `IconEditOutlineMedium`。
 * 旧名字在 0.1.7 上取到的是 `undefined`，而 `React.createElement(undefined)` 会抛
 * "Element type is invalid"：这个错发生在 `conversation.chat.node` 这个 slot entry 的
 * **渲染期**，宿主的错误边界会把整个 entry **一次性退休**（abdicate）并回落到内置渲染器 ——
 * 症状正是「消息一切正常、我们的按钮整体消失」，而且刷新页面也救不回来（宿主 raw
 * `entries()` 仍列出被退休的 entry，我们的顺序自愈因此误判「我已经赢了」）。
 *
 * 所以图标**不做静态绑定**：按候选名逐个探测，只认「渲染得起来的东西」；
 * 全都没有就回落到自绘文字符号 —— 永远不把 undefined 递给 React。
 */
function isRenderableIcon(value) {
  if (typeof value === 'function') return true
  return value !== null && typeof value === 'object' && typeof value.$$typeof === 'symbol'
}

/** 按候选顺序取第一个可用图标；全部不可用返回 undefined（调用方接兜底）。 */
function resolveIcon(candidates) {
  for (const name of candidates) {
    const value = primitives[name]
    if (isRenderableIcon(value)) return value
  }
  return undefined
}

/** 文字兜底符号的样式（内联，不依赖样式表注入）。 */
const FALLBACK_GLYPH_STYLE = {
  display: 'inline-block',
  fontSize: '15px',
  lineHeight: 1,
  fontStyle: 'normal',
}

/** 兜底：⟳（撤回）。只在 primitives 一个可用图标导出都没有时才用。 */
function FallbackRewindIcon() {
  return React.createElement('span', { style: FALLBACK_GLYPH_STYLE, 'aria-hidden': 'true' }, '⟳')
}

/** 兜底：✎（编辑）。 */
function FallbackEditIcon() {
  return React.createElement('span', { style: FALLBACK_GLYPH_STYLE, 'aria-hidden': 'true' }, '✎')
}

/**
 * 候选顺序的用意：`Regular`（1px 描边）与 0.1.6 的 `IconXxx16` 视觉最接近，
 * 所以它排第一 —— 升级不引入观感变化；`Medium`（1.3px）其次；旧名最后（兼容旧宿主）。
 */
const REWIND_ICON_CANDIDATES = ['IconRefreshOutlineRegular', 'IconRefreshOutlineMedium', 'IconRefreshOutline16']
const EDIT_ICON_CANDIDATES = ['IconEditOutlineRegular', 'IconEditOutlineMedium', 'IconEditOutline16']

const resolvedRewindIcon = resolveIcon(REWIND_ICON_CANDIDATES)
const resolvedEditIcon = resolveIcon(EDIT_ICON_CANDIDATES)

/** 图标用的是不是 primitives 的导出（false = 吃到自绘兜底，需要一次性诊断）。 */
const iconsResolvedFromPrimitives = resolvedRewindIcon !== undefined && resolvedEditIcon !== undefined

const RewindIcon = resolvedRewindIcon ?? FallbackRewindIcon
const EditIcon = resolvedEditIcon ?? FallbackEditIcon

/** 本插件自有的字典命名空间。 */
const NS = 'rewind'

/**
 * 影子覆盖的保险值。runner 会在非 chain 槽上无条件覆盖它（见文件头说明），
 * 所以它**不是**影子覆盖的依靠，只是在宿主未来不再覆盖 priority 时的保险；
 * 真正生效的是 registerShadow() 的顺序自愈。
 */
const SHADOW_PRIORITY = -1000000

/** 影子自愈的最大重注册次数与间隔（每次重注册都会拿到更低的 priority）。 */
const SHADOW_MAX_ATTEMPTS = 12
const SHADOW_RETRY_MS = 80

/** 把文本投送进新会话时的等待预算。 */
const DELIVER_TIMEOUT_MS = 4000
const DELIVER_POLL_MS = 40

/** 需要注入的客户端服务（严格注入：少一个 fiber 就会一直挂着不 apply）。 */
export const inject = ['slots', 'locale', 'sessions', 'uiWorkspace', 'workspaces', 'conversation']

/**
 * 优先用 useLayoutEffect（把按钮 portal 进内置动作行要赶在 paint 之前，
 * 否则会先闪一帧「自己一行」），退化到 useEffect。
 * 这个选择在模块加载时就固定，不会造成条件调用 hook。
 */
const useIsoLayoutEffect = typeof React.useLayoutEffect === 'function' ? React.useLayoutEffect : React.useEffect

/** 键位：内置用户消息渲染器注册在 `conversation.chat.node` 的这两个 key 上。 */
const USER_KEYS = ['user', 'steering']

/** 样式表的 tag id（只用来避免重复注入与自诊断）。 */
const STYLE_TAG_ID = 'dsh-rewind/client.css'

// ────────────────────────────────────────────────────────────────────────────
// 字典
// ────────────────────────────────────────────────────────────────────────────

const ZH = {
  'action.rewind': '撤回（回到这条消息之前）',
  'action.edit': '编辑后自动重新发送',
  'action.busy': '处理中…',
  'edit.title': '编辑这条消息',
  'edit.hint':
    '确认后会从这条消息之前分叉出新会话，原会话被归档；改好的内容会自动在新会话里发送。',
  'edit.confirm': '分叉并发送',
  'edit.cancel': '取消',
  'disabled.steering': '这是回合中途插话，无法精确回退到它之前',
  'disabled.unknownTurn': '无法定位这条消息所属的回合',
  'disabled.noBoundary': '该消息之前的回合边界还没加载，请先向上滚动加载更早的历史',
  // 成功路径**刻意不弹任何提示**（用户要求去掉归档提醒）；只有真出问题才提示。
  'toast.deliverFailed': '内容没能自动送进新会话，请在新会话输入框里手动发送',
  'toast.undo': '撤销',
  'toast.dismiss': '关闭',
  'error.generic': '操作失败，请重试',
}

const EN = {
  'action.rewind': 'Rewind (back to just before this message)',
  'action.edit': 'Edit and resend automatically',
  'action.busy': 'Working…',
  'edit.title': 'Edit this message',
  'edit.hint':
    'Confirming forks a new session from just before this message and archives the original. The edited text is sent automatically in the new session.',
  'edit.confirm': 'Fork & send',
  'edit.cancel': 'Cancel',
  'disabled.steering': 'Mid-turn interjection — there is no exact boundary before it',
  'disabled.unknownTurn': 'This message’s turn could not be resolved',
  'disabled.noBoundary': 'The turn boundary before this message is not loaded yet — scroll up to load older history',
  'toast.deliverFailed': 'The text could not be delivered to the new session — send it manually there',
  'toast.undo': 'Undo',
  'toast.dismiss': 'Dismiss',
  'error.generic': 'Something went wrong, please retry',
}

// ────────────────────────────────────────────────────────────────────────────
// 样式：**关键布局内联**（内联优先级最高、不依赖样式表注入成功）；
// 样式表只承担 :hover 显隐、textarea、toast 这些装饰。
// ────────────────────────────────────────────────────────────────────────────

/** 动作行：横向排列、靠右，与内置动作行同高。 */
const ROW_STYLE = {
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'flex-end',
  alignItems: 'center',
  flexWrap: 'nowrap',
  gap: 8,
  height: 'calc(28px + var(--dsh-content-font-delta, 0px))',
}

/** 单个图标按钮的基础外观（hover 与不可用态在渲染时叠加）。 */
const ACTION_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxSizing: 'border-box',
  width: 'calc(28px + var(--dsh-content-font-delta, 0px))',
  height: 'calc(28px + var(--dsh-content-font-delta, 0px))',
  padding: 6,
  border: 'none',
  borderRadius: '50%',
  background: 'transparent',
  color: 'var(--dsw-alias-label-tertiary)',
  cursor: 'pointer',
}

/**
 * 图标盒子边长与视觉放大系数——**想调大小只改这两个数**。
 *
 * `size` 是显式传的：0.1.5–0.1.7 的图标组件都接收 `IconProps { size = 16, className }`
 * （0.1.7 把旧名 `IconXxx16` 改成了 `IconXxxRegular`（1px 描边）/ `IconXxxMedium`（1.3px））。
 *
 * `ICON_SCALE` 的依据是**真机实测的渲染尺寸**，不是「16 × 1.15 比 16 大」这种算术直觉：
 * 内置复制按钮的 svg 写着 `width=16`，但在页面上实际渲染成 **18px**（被宿主 CSS 放大了）；
 * 我们 `size = 16` 再乘 1.15 ≈ **18.4px** —— 两者只差 2%，视觉重量基本一致，
 * 所以这个 1.15 是有依据的，别照着属性值去撤它。1.0 = 原尺寸。
 */
const ICON_SIZE = 16
const ICON_SCALE = 1.15

const CSS = `
.dsh-rewind-textarea{box-sizing:border-box;width:100%;min-height:132px;max-height:340px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l4);border-radius:16px;padding:12px 14px;font:inherit;font-size:14px;line-height:22px;resize:vertical;display:block}
.dsh-rewind-textarea:focus{border-color:var(--dsw-alias-border-l3);box-shadow:0 0 0 1px var(--dsw-alias-border-l3);outline:none}
.dsh-rewind-hint{color:var(--dsw-alias-label-caption);margin:10px 2px 0;font-size:12px;line-height:18px}
.dsh-rewind-error{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:20px;padding-left:4px}
.dsh-rewind-visuallyHidden{clip:rect(0 0 0 0);clip-path:inset(50%);width:1px;height:1px;white-space:nowrap;position:absolute;overflow:hidden}
.dsh-rewind-toastWrap{pointer-events:none;position:fixed;bottom:calc(var(--dsh-composer-height,152px) + 16px);left:0;right:0;display:flex;justify-content:center;z-index:60}
.dsh-rewind-toast{pointer-events:auto;display:inline-flex;align-items:center;gap:10px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-panel);border-radius:12px;padding:8px 10px 8px 14px;font-size:13px;line-height:20px}
.dsh-rewind-toastAction{color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border:.5px solid var(--dsw-alias-border-l3);border-radius:8px;padding:3px 10px;font:inherit;font-size:13px}
.dsh-rewind-toastAction:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-rewind-toastClose{color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:8px;padding:3px 8px;font:inherit;font-size:13px}
.dsh-rewind-toastClose:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
@media (hover:hover){
  :is([data-chat-flow-kind=user],[data-chat-flow-kind=steering]):has(~:is([data-chat-flow-kind=user],[data-chat-flow-kind=steering])) [data-dsh-rewind-row]{opacity:0;transition:opacity 80ms}
  :is([data-chat-flow-kind=user],[data-chat-flow-kind=steering]):has(~:is([data-chat-flow-kind=user],[data-chat-flow-kind=steering])):hover [data-dsh-rewind-row],
  :is([data-chat-flow-kind=user],[data-chat-flow-kind=steering]):has(~:is([data-chat-flow-kind=user],[data-chat-flow-kind=steering])):focus-within [data-dsh-rewind-row]{opacity:1}
}
`

/** 只注入一次样式表（与官方 client bundle 同一套 data-plugin-css 约定）。 */
function installStyles() {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_TAG_ID)}]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-rewind'
  tag.dataset.pluginCss = STYLE_TAG_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}

// ────────────────────────────────────────────────────────────────────────────
// 模块级共享状态
// ────────────────────────────────────────────────────────────────────────────

/** apply() 时捕获的客户端根 context（供非 hook 场景读取服务）。 */
let clientCtx

/** 本插件命名空间的翻译函数（读活动 locale）。 */
let translate = (key) => key

/** 布局自诊断只做一次。 */
let layoutProbed = false

/** 渲染期崩溃的自诊断只做一次（见 ShadowBoundary）。 */
let shadowCrashLogged = false

/** 图标兜底的自诊断只做一次。 */
let iconFallbackLogged = false

/** portal 定位的自诊断各只做一次（避免每条消息都刷屏）。 */
let portalProbeOkLogged = false
let portalProbeFailedLogged = false

/** 操作后的提示状态（挂在 root 作用域的 shell.overlay，跨会话切换存活）。 */
let noticeState = null
const noticeListeners = new Set()

function publishNotice(next) {
  noticeState = next
  for (const listener of noticeListeners) listener()
}

function subscribeNotice(listener) {
  noticeListeners.add(listener)
  return () => noticeListeners.delete(listener)
}

// ────────────────────────────────────────────────────────────────────────────
// 纯工具
// ────────────────────────────────────────────────────────────────────────────

/** 该消息所属回合号；不在回合内（location 未解析）返回 undefined。 */
function turnOf(node) {
  const location = node === undefined || node === null ? undefined : node.location
  if (location === undefined || location === null) return undefined
  if (location.kind === 'turn' || location.kind === 'step') {
    const turn = location.turn
    if (turn !== undefined && turn !== null && typeof turn.turn === 'number') return turn.turn
  }
  return undefined
}

/** 从 content blocks 里抽纯文本（编辑回填用）。 */
function plainTextOf(content) {
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    }
  }
  return parts.join('\n')
}

/** 把任意异常折叠成一句可展示的话。 */
function messageOf(error) {
  if (error === undefined || error === null) return translate('error.generic')
  if (typeof error === 'string' && error !== '') return error
  if (typeof error.message === 'string' && error.message !== '') return error.message
  return translate('error.generic')
}

/** 统一的问题上报（不抛，只留痕）。 */
function reportProblem(message, detail) {
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(`[dsh-rewind] ${message}`, detail)
  }
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/**
 * 布局自诊断：第一版把 `display:flex` 放在样式表里，实测仍然竖排，说明样式表没生效。
 * 这里在动作行首次挂载时实测一次 computed display 并留痕，方便直接定位。
 * 关键布局已内联，所以即使样式表缺失也只是「少了 :hover 显隐」而已。
 */
function probeLayout(rowElement) {
  if (layoutProbed) return
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return
  if (rowElement === undefined || rowElement === null) return
  layoutProbed = true
  let display
  try {
    display = getComputedStyle(rowElement).display
  } catch {
    return
  }
  const styleTag = document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_TAG_ID)}]`)
  if (display !== 'flex') {
    reportProblem('动作行布局异常（内联 display:flex 未生效）', { display })
    return
  }
  if (styleTag === null) {
    reportProblem('样式表未注入（装饰样式缺失，关键布局已内联）', { display })
    return
  }
  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info('[dsh-rewind] 动作行已就绪', { display })
  }
}

/**
 * 从 node 往上走，返回「祖先 ancestor 的那个直接子元素」——也就是 node 所在的那一层容器。
 * 找不到（ancestor 不在链上）返回 undefined。
 */
function directChildOf(node, ancestor) {
  let current = node
  while (current !== null && current !== undefined) {
    if (current.parentElement === ancestor) return current
    current = current.parentElement
  }
  return undefined
}

/** 我们自己的产物标记：定位时必须跳过，否则会把按钮 portal 到自己那一行上。 */
const OUR_ANCHOR_ATTR = 'data-dsh-rewind-anchor'
const OUR_ROW_ATTR = 'data-dsh-rewind-row'

/**
 * 内置复制按钮的图标 path 前缀 —— **与语言无关**的首选判据。
 *
 * 为什么是「多候选」：primitives 换大版本时会重画图标。
 * dsh ≤ 0.1.6 的 `IconCopyOutline16` 是单条 path（`M6.14929 4.02032…`）；
 * dsh 0.1.7 换成了 `rect` + `fill` path（path 从 `M11.9792 1.53296` 起，实测于真实 DOM）。
 * 只写一个前缀，换版本后会**静默失效** —— 0.1.7 实测就是恒空，只剩文案兜底可用。
 */
const COPY_ICON_PATH_PREFIXES = ['M11.9792', 'M6.14929 4.02032']

function hasAttribute(element, name) {
  return (
    element !== undefined &&
    element !== null &&
    typeof element.hasAttribute === 'function' &&
    element.hasAttribute(name)
  )
}

/** 是不是我们自己渲染出来的节点（锚点 / 动作行）。 */
function isOurNode(element) {
  return hasAttribute(element, OUR_ANCHOR_ATTR) || hasAttribute(element, OUR_ROW_ATTR)
}

/** 第一个「不是我们自己产物」的直接子元素。 */
function firstOwnChild(parent) {
  const children = parent === undefined || parent === null ? undefined : parent.children
  if (children === undefined || children === null) return undefined
  for (const child of children) if (!isOurNode(child)) return child
  return undefined
}

/** 取一个元素的 display / flex-direction（取不到就返回 null，不抛）。 */
function layoutOf(element) {
  if (element === undefined || element === null) return null
  if (typeof getComputedStyle !== 'function') return null
  try {
    const style = getComputedStyle(element)
    if (style === undefined || style === null) return null
    return { display: style.display, flexDirection: style.flexDirection }
  } catch {
    return null
  }
}

/**
 * 目标必须是**横向排列的容器**。
 *
 * 这一条是血泪闸门：内置的 `userRow` 是 `flex-direction: column`，
 * 把按钮 portal 进去就会变成「又一行」——正是第一轮实测的现象（位置没变）。
 * 拿不到 computed style（比如 Node 假 DOM）时不拦，交给调用方决定。
 */
function isHorizontalRow(element) {
  if (element === undefined || element === null) return false
  const layout = layoutOf(element)
  if (layout === null) return true
  if (layout.display === 'contents') return false
  if (layout.display !== 'flex' && layout.display !== 'inline-flex') return false
  return layout.flexDirection === 'row'
}

/** `renderSlot` 输出的容器：`div[data-slot="conversation.chat.node"][display:contents]`。 */
const SLOT_OUTLET_SELECTOR = ':scope > div[data-slot="conversation.chat.node"]'

/** 拿 slot 输出容器（找不到返回 undefined，调用方回退到通用下钻）。 */
function outletOf(flowItem) {
  if (flowItem === undefined || flowItem === null) return undefined
  if (typeof flowItem.querySelector === 'function') {
    try {
      const direct = flowItem.querySelector(SLOT_OUTLET_SELECTOR)
      if (direct !== undefined && direct !== null) return direct
    } catch {
      /* `:scope` 不被支持（老浏览器 / 假 DOM）就忽略，走通用下钻 */
    }
  }
  const first = firstOwnChild(flowItem)
  return hasAttribute(first, 'data-slot') ? first : undefined
}

/**
 * 拿「内置渲染器根」。
 *
 * 真实层级（两个子代理各自逐行核实一致）：flowItem > div[data-slot="conversation.chat.node"]
 * [display:contents] > userRow（内置渲染器根）> div.xzv4MW_actions（动作行）> button。
 * `flowItem` 的唯一子元素是那个 **data-slot 包装层**，所以「flowItem.firstElementChild 就是内置根」
 * 差了一层——这正是按钮进不了同一行、还误报成功的原因。这里先认准 outlet，再往下钻一层
 * （兼容宿主再套多层 data-slot），并跳过我们自己的产物。
 */
function builtinRootOf(flowItem) {
  if (flowItem === undefined || flowItem === null) return undefined
  const outlet = outletOf(flowItem)
  let current = firstOwnChild(outlet === undefined ? flowItem : outlet)
  for (let depth = 0; depth < 4; depth += 1) {
    if (current === undefined) return undefined
    if (!hasAttribute(current, 'data-slot')) break
    const next = firstOwnChild(current)
    if (next === undefined) break
    current = next
  }
  return current
}

/**
 * 策略 1（结构，不看文案）：内置根里**最后一个**「含 button 且不是我们产物」的直接子。
 * 依据：userRow 的子序是 [userStack（气泡…）, actions]（ui-chat UserStyleBubble），
 * 动作行是最后一个直接子；倒序取可以避开气泡里 JsonBlock 的同款复制按钮。
 */
function actionsRowByStructure(builtinRoot) {
  const children = builtinRoot === undefined || builtinRoot === null ? undefined : builtinRoot.children
  if (children === undefined || children === null) return undefined
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index]
    if (isOurNode(child)) continue
    if (typeof child.querySelector !== 'function') continue
    if (child.querySelector('button') === null) continue
    return child
  }
  return undefined
}

/** portal 目标是否合格：不是我们自己的节点，且是个横向行。 */
function isPortalTargetOk(row) {
  if (row === undefined || row === null) return false
  if (isOurNode(row)) return false
  return isHorizontalRow(row)
}

/**
 * 策略 2（兜底）：内置**复制按钮的 parentElement**。
 * 依据：primitives 的 Tooltip 只 `cloneElement` 注入 ref/事件、不插 DOM 层、不用 portal
 * （客户端 shell 里 Tooltip 的实现），所以复制按钮的父元素就是动作行。
 */
function actionsRowByCopyButton(flowItem, builtinRoot, t) {
  const button = findCopyButton(flowItem, builtinRoot, t)
  if (button === undefined) return undefined
  const parent = button.parentElement
  return parent === undefined || parent === null ? undefined : parent
}

/** 极简属性值转义（只用于 aria-label 的引号选择器，避免引依赖 CSS.escape）。 */
function escapeAttr(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * 找出内置的复制按钮。
 *
 * 首选判据是**图标 path 前缀**（复制图标，与语言无关，候选见 COPY_ICON_PATH_PREFIXES），
 * 但 primitives 的 `JsonBlock` 用的是同一个图标，而 JsonBlock 会被渲染进气泡里，
 * 所以必须排除它：真正的复制按钮的 `parentElement.parentElement` 就是内置渲染器根
 * （动作行是内置根的直接子，而 JsonBlock 的按钮在气泡深处）。
 * 文案判据（zh「复制」/ en「Copy」，来自 common 字典）只作最后兜底——
 * 点过复制后 1s 内会变成「复制成功」，换语言包或改键也会失效。
 */
function findCopyButton(flowItem, builtinRoot, t) {
  const buttons = copyIconButtons(flowItem)
  for (const button of buttons) {
    const parent = button.parentElement
    if (parent !== undefined && parent !== null && parent.parentElement === builtinRoot) return button
  }
  for (const button of buttons) if (isHorizontalRow(button.parentElement)) return button
  if (typeof t === 'function' && flowItem !== undefined && flowItem !== null && typeof flowItem.querySelector === 'function') {
    for (const key of ['copy', 'copied']) {
      const label = safeLabel(t, key)
      if (label === undefined) continue
      let found
      try {
        found = flowItem.querySelector(`button[aria-label="${escapeAttr(label)}"]`)
      } catch {
        found = undefined
      }
      if (found !== undefined && found !== null) return found
    }
  }
  return buttons.length > 0 ? buttons[0] : undefined
}

/** 按图标 path 前缀收集所有「复制图标」按钮（与语言无关）。 */
function copyIconButtons(flowItem) {
  if (flowItem === undefined || flowItem === null || typeof flowItem.querySelectorAll !== 'function') return []
  let paths = []
  try {
    paths = [...flowItem.querySelectorAll('svg > path')]
  } catch {
    paths = []
  }
  const buttons = []
  for (const path of paths) {
    const d = typeof path.getAttribute === 'function' ? path.getAttribute('d') : undefined
    if (typeof d !== 'string') continue
    if (!COPY_ICON_PATH_PREFIXES.some((prefix) => d.startsWith(prefix))) continue
    const button = typeof path.closest === 'function' ? path.closest('button') : undefined
    if (button !== undefined && button !== null) buttons.push(button)
  }
  return buttons
}

/** 安全地取一个命名空间的文案（取不到就返回 undefined）。 */
function safeLabel(t, key) {
  if (typeof t !== 'function') return undefined
  try {
    const value = t(key)
    return typeof value === 'string' && value !== '' ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * 定位内置动作行：**策略 1（结构）优先，策略 2（复制按钮的父元素）兜底**，
 * 两条都要过 `isPortalTargetOk`（不是我方节点 + 是横向行）。
 * @returns `{ row, via }`，或 undefined。
 */
function locateActionsRow(flowItem, t) {
  const builtinRoot = builtinRootOf(flowItem)
  const structural = actionsRowByStructure(builtinRoot)
  if (isPortalTargetOk(structural)) return { row: structural, via: 'structure' }
  const byButton = actionsRowByCopyButton(flowItem, builtinRoot, t)
  if (isPortalTargetOk(byButton)) return { row: byButton, via: 'copy-button' }
  return undefined
}

/**
 * 一次性诊断：把「为什么没定位到」需要的信息全打出来，用户刷新一次页面就能把答案贴回来。
 * 只在第一次失败时打一条；成功时也只打一条（标明走的是哪条策略）。
 */
function describeLocateFailure(flowItem, t) {
  const detail = {
    createPortal: typeof createPortal,
    getComputedStyle: typeof getComputedStyle,
    flowItemFound: flowItem !== undefined && flowItem !== null,
  }
  if (!detail.flowItemFound) return detail
  detail.flowKind = typeof flowItem.getAttribute === 'function' ? flowItem.getAttribute('data-chat-flow-kind') : null
  const first = flowItem.firstElementChild
  detail.firstChildTag = first === undefined || first === null ? null : first.tagName
  detail.firstChildIsSlotWrap = hasAttribute(first, 'data-slot')
  detail.flowItemChildCount = flowItem.children === undefined ? null : flowItem.children.length
  const builtinRoot = builtinRootOf(flowItem)
  detail.builtinRootTag = builtinRoot === undefined ? null : builtinRoot.tagName
  detail.builtinRootChildCount =
    builtinRoot === undefined || builtinRoot.children === undefined ? null : builtinRoot.children.length
  const describe = (element) => ({
    tag: element.tagName,
    cls: typeof element.className === 'string' ? element.className : null,
    ours: isOurNode(element),
    hasButton: typeof element.querySelector === 'function' ? element.querySelector('button') !== null : null,
    horizontal: isHorizontalRow(element),
    ...layoutOf(element),
  })
  detail.builtinRootChildren =
    builtinRoot === undefined || builtinRoot.children === undefined
      ? []
      : [...builtinRoot.children].slice(0, 6).map(describe)
  const button = findCopyButton(flowItem, builtinRoot, t)
  detail.copyButtonFound = button !== undefined
  if (button !== undefined) {
    const parent = button.parentElement
    detail.copyButtonParentTag = parent === undefined || parent === null ? null : parent.tagName
    detail.copyButtonParentHorizontal = isHorizontalRow(parent)
    detail.copyButtonParentIsBuiltinChild = parent !== undefined && parent !== null && parent.parentElement === builtinRoot
  }
  detail.copyLabel = safeLabel(t, 'copy') ?? null
  detail.copiedLabel = safeLabel(t, 'copied') ?? null
  const labels = []
  try {
    for (const candidate of flowItem.querySelectorAll('button')) {
      const label = candidate.getAttribute('aria-label')
      if (label !== null && label !== '') labels.push(label)
    }
  } catch {
    /* 读取失败就留空数组 */
  }
  detail.buttonLabels = labels
  return detail
}

/**
 * 取出内置的同键渲染器（我们只做叠加，不重画气泡）。拿不到就返回 undefined。
 *
 * 这里**必须**用 raw 的 `entries()`：我们是影子赢家，内置渲染器正是被我们遮蔽的那一个，
 * 只有 raw ledger 才看得见它；`entriesOfSlot()` 只会给出赢家（也就是我们自己）。
 */
function originalRendererFor(kind) {
  if (clientCtx === undefined) return undefined
  let entries
  try {
    entries = clientCtx.slots.entries('conversation.chat.node')
  } catch {
    return undefined
  }
  if (!Array.isArray(entries)) return undefined
  for (const entry of entries) {
    if (entry === undefined || entry === null) continue
    const options = entry.options
    if (options === undefined || options === null || options.key !== kind) continue
    // 排除我们自己，否则会递归渲染到爆栈。component 是注册时原样存下来的引用，
    // 所以身份比较就是权威判据；registrant 作为兜底再挡一层。
    if (entry.registrant === 'dsh-rewind') continue
    const component = entry.component
    if (component === undefined || component === null) continue
    if (component === MessageActions || component === MessageActionsInner) continue
    return component
  }
  return undefined
}

/**
 * 读出 `conversation.chat.node` 里某个 key 的**当前影子赢家**组件。
 *
 * 这里**必须**用 `entriesOfSlot()` 而不是 `entries()`：
 * - `entries()` 是 raw ledger —— 插件 entry 在渲染期抛错被宿主**一次性退休**（abdicate）之后，
 *   它**仍然**列在里面（官方注释：raw view stays the inspection surface）。用 raw 视图判断
 *   「我赢了吗」会永远得到「是」，于是自愈不重注册，插件再也回不来 —— dsh 0.1.7 上的真实
 *   故障正是这种「按钮消失且刷新页面也没用」。
 * - `entriesOfSlot()` 是「每个 cell 的当前赢家」投影，会跳过被退休的 entry；只有它返回的
 *   不是我们，才说明我们真的不在台上，自愈才会 dispose 后重注册。
 *
 * 赢家判据沿用「同 cell 里 priority 最低者渲染」；旧宿主没有该方法时回退到 raw entries。
 */
function winnerComponentFor(kind) {
  if (clientCtx === undefined) return undefined
  const slots = clientCtx.slots
  if (slots === undefined || slots === null) return undefined
  let entries
  try {
    entries =
      typeof slots.entriesOfSlot === 'function'
        ? slots.entriesOfSlot('conversation.chat.node')
        : slots.entries('conversation.chat.node')
  } catch {
    return undefined
  }
  if (!Array.isArray(entries)) return undefined
  let winner
  let best = Number.POSITIVE_INFINITY
  for (const entry of entries) {
    if (entry === undefined || entry === null) continue
    const options = entry.options
    if (options === undefined || options === null || options.key !== kind) continue
    const priority = typeof options.priority === 'number' ? options.priority : 0
    if (priority < best) {
      best = priority
      winner = entry.component
    }
  }
  return winner
}

/**
 * 影子注册 + 顺序自愈。
 *
 * runner 会在非 chain 槽上无条件覆盖我们传的 priority，而「同 cell 最低者渲染」+
 * 「后注册者更低」⇒ 只有**最后**注册的那个会渲染。我们的 apply 与内置 ui-chat 的
 * apply 谁先谁后不由我们决定，所以注册之后要自查：如果当前赢家不是我们，
 * 就 dispose 再重注册（每次重注册都会拿到更低的 priority），直到赢或放弃。
 *
 * 放弃时保持现状（按钮不出现），绝不抛——一个 cell 抢不到不该拖死整个插件。
 */
function registerShadow(ctx, key, component) {
  let dispose = null
  let stopped = false
  let attempts = 0
  let timer = null

  const register = () => {
    dispose = ctx.slots.register(
      {
        name: 'conversation.chat.node',
        key,
        priority: SHADOW_PRIORITY,
        locale: 'chat',
        registrant: 'dsh-rewind',
      },
      component
    )
  }

  const probe = () => {
    timer = null
    if (stopped) return
    attempts += 1
    if (winnerComponentFor(key) === component) return
    if (attempts >= SHADOW_MAX_ATTEMPTS) return
    try {
      if (dispose !== null) dispose()
      register()
    } catch (error) {
      // dispose 已经把我们的条目摘下来了：register 再失败就会留一个空 cell（按钮凭空消失）。
      // 补注册一次 —— 若失败原因是槽位本身没声明，这次同样会失败，那确实无解。
      try {
        register()
      } catch {
        /* 放弃这次自愈 */
      }
      reportProblem(`影子自愈失败（key=${key}）`, error)
      return
    }
    timer = window.setTimeout(probe, SHADOW_RETRY_MS)
  }

  try {
    register()
  } catch (error) {
    reportProblem(`槽位注册失败（key=${key}）`, error)
    return () => {}
  }
  timer = window.setTimeout(probe, SHADOW_RETRY_MS)

  return () => {
    stopped = true
    if (timer !== null) window.clearTimeout(timer)
    try {
      if (dispose !== null) dispose()
    } catch {
      /* 卸载期忽略 */
    }
    dispose = null
  }
}

/** 找出当前会话归属于哪个 Workspace（找不到返回 undefined，调用方回退到 cwd）。 */
function workspaceIdOf(sessionId) {
  try {
    const snapshot = clientCtx.workspaces.list.getSnapshot()
    const items = snapshot === undefined || snapshot === null ? undefined : snapshot.items
    if (!Array.isArray(items)) return undefined
    for (const view of items) {
      if (view === undefined || view === null) continue
      const ids = view.sessionIds
      if (Array.isArray(ids) && ids.indexOf(sessionId) !== -1 && typeof view.workspaceId === 'string') {
        return view.workspaceId
      }
    }
  } catch {
    return undefined
  }
  return undefined
}

/** 建一个全新空白会话，返回新会话 id。 */
async function createBlankSession(sessionId) {
  const sessions = clientCtx.sessions
  // 归属优先用 workspaceId：官方新建会话一律 create({workspaceId})。
  // 只给 cwd 的话新会话可能不挂在任何 Workspace 节点下（侧栏里找不到，
  // 而且 hero 态输入框会因为拿不到 workspace 标题而 inert）。
  const workspaceId = workspaceIdOf(sessionId)
  if (workspaceId !== undefined) return sessions.create({ workspaceId })
  let cwd
  try {
    const list = sessions.list.getSnapshot()
    const summary = list === undefined || list === null ? undefined : list.byId[sessionId]
    cwd = summary === undefined || summary === null ? undefined : summary.cwd
  } catch {
    cwd = undefined
  }
  if (cwd !== undefined) return sessions.create({ cwd })
  return sessions.create({})
}

/**
 * 等某个会话的 binding 就绪——`openSession` 之后 UI 需要一两个 tick 才会 retain 它，
 * 而 `conversation.input.for()` 要求一个**已 retain** 的 session scope。
 */
async function waitForBinding(sessionId, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    let binding
    try {
      binding = clientCtx.sessions.binding(sessionId)
    } catch {
      binding = undefined
    }
    if (binding !== undefined && binding !== null && binding.ctx !== undefined && binding.ctx !== null) {
      return binding
    }
    if (Date.now() >= deadline) return undefined
    await sleep(DELIVER_POLL_MS)
  }
}

/**
 * 把文本送进指定会话的输入框，确认真的进去了再（可选）自动发送。
 *
 * **不依赖任何 slot 挂载**：全新空会话是 hero 形态，`conversation.composer.dock`
 * 根本不渲染（实测症状：草稿要等用户手动发出第一条消息才冒出来）。
 * `ctx.conversation.input.for(binding.ctx)` 拿到的是该会话**常驻**的输入机 facade，
 * 与 hero / composer 形态无关；`input.state.getSnapshot().draft` 可以直接验证结果，
 * 所以「确认进去了再发送」不是猜时序，而是读回来核对。
 */
async function deliverToChild(sessionId, text, autoSend) {
  const binding = await waitForBinding(sessionId, DELIVER_TIMEOUT_MS)
  if (binding === undefined) throw new Error('新会话的输入作用域迟迟没就绪')
  const input = clientCtx.conversation.input.for(binding.ctx)
  const deadline = Date.now() + DELIVER_TIMEOUT_MS
  let applied = false
  for (;;) {
    try {
      input.setDraft(text)
    } catch (error) {
      reportProblem('setDraft 失败', error)
    }
    const snapshot = input.state.getSnapshot()
    applied = snapshot !== undefined && snapshot !== null && snapshot.draft === text
    if (applied || Date.now() >= deadline) break
    await sleep(DELIVER_POLL_MS)
  }
  if (!applied) throw new Error('草稿没能写进新会话输入框')
  if (!autoSend) return
  input.submit()
  // 提交被接受时输入机会把草稿清掉（commit-draft）；草稿原地不动说明这次提交被拒了
  // （最典型的是 hero 态输入框此刻还 inert）。读回来核对，别让用户以为发了其实没发。
  const settleBy = Date.now() + DELIVER_TIMEOUT_MS
  for (;;) {
    const snapshot = input.state.getSnapshot()
    if (snapshot === undefined || snapshot === null || snapshot.draft !== text) return
    if (Date.now() >= settleBy) break
    await sleep(DELIVER_POLL_MS)
  }
  throw new Error('发送没被接受，内容仍在输入框里，请按回车')
}

/**
 * 把当前会话「切」到目标消息之前，归档原会话，并把（可选的）改写内容送进新会话。
 *
 * @param options.sessionId - 原会话。
 * @param options.atSeq - fork 锚点（上一回合的 turn/end seq）；缺省表示建全新空白会话。
 * @param options.draftText - 非 null 时把这段文本送进新会话输入框。
 * @param options.autoSend - 送进输入框后是否自动发送。
 * @returns 新会话 id。
 */
async function cutAndSwitch(options) {
  const { sessionId, atSeq, draftText, autoSend } = options
  const workspace = clientCtx.uiWorkspace
  const isEdit = typeof draftText === 'string'

  const childId =
    typeof atSeq === 'number'
      ? // **不要传 increaseTitle**：它会在继承来的标题后面加序号（"xxx (1)"），
        // 而且每撤回/编辑一次就再涨一位（"xxx (2)"、"xxx (3)"…），
        // 用户实测后明确要求标题保持不变，所以这里只传 fork 的最小参数。
        await clientCtx.sessions.fork({ sessionId, atSeq })
      : await createBlankSession(sessionId)

  workspace.openSession(childId)

  let archived = false
  try {
    await workspace.archiveSession(sessionId)
    archived = true
  } catch {
    archived = false
  }

  // 成功路径**刻意不弹任何提示**（用户要求去掉归档提醒）。
  // 只有真出问题（改写内容送不进去 / 发送被拒）才提示，并且保留「撤销」这条退路。
  if (isEdit) {
    try {
      await deliverToChild(childId, draftText, autoSend === true)
    } catch (error) {
      reportProblem('改写内容没能自动送进新会话', error)
      publishNotice({
        text: `${translate('toast.deliverFailed')}（${messageOf(error)}）`,
        originalId: sessionId,
        canUndo: archived,
      })
    }
  }

  return childId
}

/** 撤销上一次操作：取消归档并切回原会话。 */
async function undoLastChange() {
  const state = noticeState
  if (state === null) return
  publishNotice(null)
  try {
    await clientCtx.uiWorkspace.unarchiveSession(state.originalId)
  } catch {
    /* 取消归档失败就只切回去，会话仍在归档区，可从设置里的「未归档会话」捞回。 */
  }
  clientCtx.uiWorkspace.openSession(state.originalId)
}

// ────────────────────────────────────────────────────────────────────────────
// 组件
// ────────────────────────────────────────────────────────────────────────────

/**
 * 最后一道防线：**自己兜住渲染错误**，绝不让它冒泡到宿主的 slot 错误边界。
 *
 * 宿主的错误边界一旦捕到我方 entry 的抛错，会把该 entry **一次性退休**（abdicate）
 * 并回落到内置渲染器 —— 表现就是「消息正常、插件按钮整体消失」，而且 raw ledger 里
 * 仍列着被退休的 entry，自愈因此永远认为「我已经赢了」，连刷新页面都不恢复。
 *
 * 所以我们在 entry 内部先兜，三级退化：
 * 1. 首次抛错 → 只渲染内置渲染器：该条消息的按钮不再出现，但消息不受影响、entry 仍是
 *    赢家、插件其余部分照常（比「整个插件消失」好得多）；
 * 2. 之后渲染到**别的消息节点**（`nodeKey` 变了）→ 重置一次，给按钮回来的机会（同一条
 *    消息反复重试只会反复崩，所以重试次数有上限 SHADOW_MAX_RETRIES）；
 * 3. 万一兜底渲染的内置渲染器**自己也**抛错 → 再退一步渲染 `null`，宁可这条消息不显示，
 *    也绝不让错误穿透到宿主去换掉整个 entry。
 */
const SHADOW_MAX_RETRIES = 3

class ShadowBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { failed: false, fatal: false }
    this.retries = 0
    this.crashedOnce = false
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    // 注意：首次崩溃时 `getDerivedStateFromError` 已经把 failed 置为 true 了，
    // 所以这里不能用 state.failed 判断「是不是第一次」—— 用实例字段。
    if (this.crashedOnce && !this.state.fatal) this.setState({ fatal: true })
    this.crashedOnce = true
    if (shadowCrashLogged) return
    shadowCrashLogged = true
    reportProblem('按钮渲染失败，已退回只显示内置消息（撤回/编辑暂不可用）', error)
  }

  componentDidUpdate(prevProps) {
    if (!this.state.failed || this.state.fatal) return
    if (this.retries >= SHADOW_MAX_RETRIES) return
    if (prevProps.nodeKey === this.props.nodeKey) return
    this.retries += 1
    this.setState({ failed: false })
  }

  render() {
    if (this.state.fatal) return null
    if (!this.state.failed) return this.props.children
    const Original = originalRendererFor(this.props.nodeKind)
    return Original === undefined ? null : React.createElement(Original, this.props.originalProps)
  }
}

/**
 * `conversation.chat.node` 的 user/steering 影子渲染器。
 *
 * 这一层**不调用任何 hook**，只做能力探测；真正的实现落在 MessageActionsInner，
 * 这样即使宿主没提供 `useChat`（版本差异），我们也能退回「只渲染内置渲染器」，
 * 而不是把整条消息渲染炸掉。外面再套 ShadowBoundary，保证任何内部抛错都不会
 * 让宿主退休整个 entry。
 */
function MessageActions(props) {
  const node = props.node
  const kind = node === undefined || node === null ? undefined : node.kind
  const nodeKey = node === undefined || node === null ? undefined : node.key
  if (typeof props.useChat !== 'function') {
    const Original = originalRendererFor(kind)
    return Original === undefined ? null : React.createElement(Original, props)
  }
  return React.createElement(
    ShadowBoundary,
    { nodeKind: kind, nodeKey, originalProps: props },
    React.createElement(MessageActionsInner, props)
  )
}

/** 真正带按钮的实现。 */
function MessageActionsInner(props) {
  const { node, sessionId, useChat } = props
  const kind = node === undefined ? undefined : node.kind
  const isSteering = kind === 'steering'
  const data = node === undefined ? undefined : node.data
  const content = data === undefined ? undefined : data.content
  const messageText = React.useMemo(() => plainTextOf(content), [content])

  const turn = turnOf(node)
  // 锚点只认 turnEnds 的权威值，**不做 seq-1 之类的推断**。
  // legacy.turnEnds 由 turn.end.seq 构建，取「上一回合的 turn/end」即精确命中 fork 的边界语义。
  const cutAnchor = useChat((chat) => {
    if (isSteering || turn === undefined || turn <= 1) return undefined
    const legacy = chat === undefined || chat === null ? undefined : chat.legacy
    const ends = legacy === undefined || legacy === null ? undefined : legacy.turnEnds
    if (ends === undefined || ends === null || typeof ends.get !== 'function') return undefined
    const hit = ends.get(turn - 1)
    return typeof hit === 'number' ? hit : undefined
  })
  const isFirstTurn = turn === 1

  const rewindBlocked = isSteering
    ? 'disabled.steering'
    : turn === undefined
      ? 'disabled.unknownTurn'
      : cutAnchor === undefined
        ? 'disabled.noBoundary'
        : null
  const editBlocked = isSteering
    ? 'disabled.steering'
    : turn === undefined
      ? 'disabled.unknownTurn'
      : isFirstTurn || cutAnchor !== undefined
        ? null
        : 'disabled.noBoundary'

  const [busy, setBusy] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const [draftText, setDraftText] = React.useState('')
  const [failure, setFailure] = React.useState(null)

  const Original = originalRendererFor(kind)

  // ── 把动作行 portal 进内置的「时间 + 复制」那一行，做到同一行 ────────────────
  // 我们自己的 DOM 里只留一个隐藏锚点用来定位；找到内置动作行后，按钮通过
  // createPortal 渲染进那一行（React portal 是官方能力，react-dom 在共享模块表里）。
  // 顺带好处：显隐规则直接跟随内置动作行（最后一条常驻、更早的 hover 才出现）。
  const anchorRef = React.useRef(null)
  const portalHostRef = React.useRef(null)
  const [portalHost, setPortalHost] = React.useState(null)

  useIsoLayoutEffect(() => {
    let cancelled = false
    let attempts = 0
    let retryTimer = null

    const locate = () => {
      if (cancelled) return
      const anchor = anchorRef.current
      const flowItem =
        anchor !== null && anchor !== undefined && typeof anchor.closest === 'function'
          ? anchor.closest('[data-chat-flow-kind]')
          : undefined
      const found = locateActionsRow(flowItem, props.t)
      if (found === undefined) {
        // 内置动作行还没渲染出来（或宿主结构变了）→ 有限次重试，最终退化成自己一行。
        if (attempts < 10) {
          attempts += 1
          retryTimer = window.setTimeout(locate, 60)
          return
        }
        // 重试都用完了还没定位到：打一条诊断（含 DOM 实况），方便一次性定位问题。
        if (!portalProbeFailedLogged) {
          portalProbeFailedLogged = true
          reportProblem('没能定位内置动作行，按钮退化为独立一行', describeLocateFailure(flowItem, props.t))
        }
        return
      }
      if (!portalProbeOkLogged) {
        portalProbeOkLogged = true
        if (typeof console !== 'undefined' && typeof console.info === 'function') {
          console.info('[dsh-rewind] 按钮已并进内置动作行', { via: found.via })
        }
      }
      portalHostRef.current = found.row
      setPortalHost((current) => (current === found.row ? current : found.row))
    }

    locate()

    // 宿主重挂载（切视图、翻页加载）会让旧的 portal 目标脱链，那样按钮会凭空消失；
    // 低频巡检一次并重新定位。
    const guard = window.setInterval(() => {
      if (cancelled) return
      const host = portalHostRef.current
      if (host === null) return
      if (host.isConnected === false) {
        portalHostRef.current = null
        setPortalHost(null)
        attempts = 0
        locate()
      }
    }, 1000)

    return () => {
      cancelled = true
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      window.clearInterval(guard)
    }
  }, [props.t])

  const runRewind = React.useCallback(() => {
    if (busy || rewindBlocked !== null) return
    setBusy(true)
    setFailure(null)
    cutAndSwitch({ sessionId, atSeq: cutAnchor, draftText: null, autoSend: false })
      .catch((error) => setFailure(messageOf(error)))
      .finally(() => setBusy(false))
  }, [busy, cutAnchor, rewindBlocked, sessionId])

  const openEditor = React.useCallback(() => {
    if (busy || editBlocked !== null) return
    setDraftText(messageText)
    setFailure(null)
    setEditing(true)
  }, [busy, editBlocked, messageText])

  const closeEditor = React.useCallback(() => {
    setEditing(false)
    setFailure(null)
  }, [])

  const confirmEdit = React.useCallback(() => {
    if (busy || editBlocked !== null) return
    setBusy(true)
    setFailure(null)
    cutAndSwitch({
      sessionId,
      atSeq: isFirstTurn ? undefined : cutAnchor,
      draftText,
      autoSend: true,
    })
      .then(() => setEditing(false))
      .catch((error) => setFailure(messageOf(error)))
      .finally(() => setBusy(false))
  }, [busy, cutAnchor, draftText, editBlocked, isFirstTurn, sessionId])

  const rewindLabel = rewindBlocked === null ? translate('action.rewind') : translate(rewindBlocked)
  const editLabel = editBlocked === null ? translate('action.edit') : translate(editBlocked)

  /**
   * 一个图标动作按钮。
   *
   * 用 `aria-disabled` 而不是 `disabled`：浏览器**不会给 disabled 元素发 hover 事件**，
   * 那样「为什么不能点」的 tooltip 永远弹不出来（官方 MessageIconActions 同款做法）。
   * hover 变色直接改内联样式——不依赖样式表是否注入成功。
   */
  const actionButton = (label, blocked, onClick, icon) => {
    const unavailable = blocked !== null || busy
    const style = unavailable ? { ...ACTION_STYLE, cursor: 'default', opacity: 0.4 } : ACTION_STYLE
    return React.createElement(Tooltip, { label, side: 'bottom' },
      React.createElement('button', {
        type: 'button',
        className: 'dsh-rewind-action',
        style,
        'aria-label': label,
        'aria-disabled': unavailable ? true : undefined,
        'data-unavailable': unavailable ? true : undefined,
        'data-dsh-rewind-action': '',
        onClick: unavailable ? undefined : onClick,
        onMouseEnter: unavailable
          ? undefined
          : (event) => {
              event.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)'
              event.currentTarget.style.color = 'var(--dsw-alias-label-secondary)'
            },
        onMouseLeave: unavailable
          ? undefined
          : (event) => {
              event.currentTarget.style.background = 'transparent'
              event.currentTarget.style.color = 'var(--dsw-alias-label-tertiary)'
            },
      },
      // 图标盒子尺寸由 ICON_SIZE 决定，视觉重量再靠外层内联 transform 拉齐（ICON_SCALE 是唯一旋钮）。
      // 视觉重量再靠外层内联 transform 拉齐（ICON_SCALE 是唯一旋钮）。
      React.createElement('span', {
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${ICON_SCALE})`,
        },
      }, React.createElement(icon, { size: ICON_SIZE }))))
  }

  const row = (
    React.createElement('div', {
      className: 'dsh-rewind-row',
      style: ROW_STYLE,
      'data-dsh-rewind-row': '',
      ref: (element) => probeLayout(element),
    },
      // 首条消息不提供「撤回」：撤回首条等于清空并归档对话，没有意义。
      isFirstTurn && !isSteering
        ? null
        : actionButton(rewindLabel, rewindBlocked, runRewind, RewindIcon),
      actionButton(editLabel, editBlocked, openEditor, EditIcon),
      failure === null ? null : React.createElement('span', { className: 'dsh-rewind-error', role: 'status' }, failure)
    )
  )

  const modal = editing
    ? React.createElement(Modal, {
        open: true,
        title: translate('edit.title'),
        closeLabel: translate('edit.cancel'),
        onClose: busy ? () => {} : closeEditor,
        footer: React.createElement(Button, {
          variant: 'primary',
          disabled: busy || draftText.trim() === '',
          onClick: confirmEdit,
        }, busy ? translate('action.busy') : translate('edit.confirm')),
      },
        React.createElement('textarea', {
          className: 'dsh-rewind-textarea',
          'aria-label': translate('edit.title'),
          value: draftText,
          readOnly: busy,
          onChange: (event) => setDraftText(event.target.value),
        }),
        React.createElement('p', { className: 'dsh-rewind-hint' }, translate('edit.hint')))
    : null

  // 渲染时也确认一次 portal 目标还在文档里：宿主重挂载（我们的影子自愈会换 key ⇒
  // 整棵子树重挂）会让旧目标脱链，往脱链节点里 portal 等于按钮凭空消失。
  // 目标不在了就立刻退回本地渲染，等巡检重新定位。
  const targetLive = portalHost !== null && portalHost.isConnected !== false

  return React.createElement(React.Fragment, null,
    Original === undefined ? null : React.createElement(Original, props),
    // 隐藏锚点：始终留在消息容器里，用来定位内置动作行（portal 之后也还能重新定位）。
    React.createElement('span', { ref: anchorRef, hidden: true, 'data-dsh-rewind-anchor': '' }),
    targetLive ? createPortal(row, portalHost) : row,
    modal
  )
}

/** 挂在 `shell.overlay`（root 作用域）上的操作提示：跨会话切换存活。 */
function ChangeNotice() {
  const [state, setState] = React.useState(null)

  React.useEffect(() => {
    setState(noticeState)
    return subscribeNotice(() => setState(noticeState))
  }, [])

  React.useEffect(() => {
    if (state === null) return undefined
    const timer = window.setTimeout(() => publishNotice(null), 15000)
    return () => window.clearTimeout(timer)
  }, [state])

  if (state === null) return null

  return React.createElement('div', { className: 'dsh-rewind-toastWrap' },
    React.createElement('div', { className: 'dsh-rewind-toast', role: 'status' },
      React.createElement('span', null, state.text),
      state.canUndo
        ? React.createElement('button', {
            type: 'button',
            className: 'dsh-rewind-toastAction',
            onClick: () => {
              undoLastChange().catch(() => publishNotice(null))
            },
          }, translate('toast.undo'))
        : null,
      React.createElement('button', {
        type: 'button',
        className: 'dsh-rewind-toastClose',
        'aria-label': translate('toast.dismiss'),
        onClick: () => publishNotice(null),
      }, '✕')
    )
  )
}

// ────────────────────────────────────────────────────────────────────────────
// 插件体
// ────────────────────────────────────────────────────────────────────────────

/**
 * 客户端插件体：注册字典 + 三个槽位贡献。
 * @param ctx - 客户端 cordis context。
 */
export function apply(ctx) {
  clientCtx = ctx
  installStyles()

  // createPortal 是「与复制按钮同一行」的唯一手段；先自证一次它真的可用，
  // 免得又是静默退化（第一轮实测就是这么白跑一次的）。
  if (typeof createPortal !== 'function') {
    reportProblem('react-dom 的 createPortal 不可用，按钮只能留在自己一行', { typeofCreatePortal: typeof createPortal })
  }
  // 图标兜底同样要留一次性诊断：正常走 primitives 的图标，一旦吃到自绘兜底就说明
  // 宿主那套图标导出名又变了（dsh 0.1.7 就改过一次），得让人一眼看见而不是静默降级。
  if (!iconsResolvedFromPrimitives && !iconFallbackLogged) {
    iconFallbackLogged = true
    reportProblem('primitives 没有可用的 ⟳ / ✎ 图标导出，按钮已改用文字符号', {
      triedRewind: REWIND_ICON_CANDIDATES,
      triedEdit: EDIT_ICON_CANDIDATES,
    })
  }
  // 字典一次注册两套语言（单次调用 = 单次 disposer；分两次调用在热重载下
  // 可能撞上 "locale namespace already has locale" 的重复注册错误）。
  ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'dsh-rewind: 字典 zh/en')
  translate = ctx.locale.bind(NS)

  // 1) 用户消息 / 中途插话的渲染器影子覆盖 + 动作行。
  //    locale 声明为 'chat' 是必须的：我们要把框架注入的 t 原样转发给内置渲染器。
  //    registerShadow 自带顺序自愈（runner 会覆盖 priority，谁后注册谁赢）。
  for (const key of USER_KEYS) {
    ctx.slots.inject('conversation.chat.node', () => registerShadow(ctx, key, MessageActions))
  }

  // 2) 操作后的提示 / 撤销（root 作用域，跨会话切换存活）。
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      { name: 'shell.overlay', id: 'rewind-notice', order: 40, locale: NS, registrant: 'dsh-rewind' },
      ChangeNotice
    )
  )

  ctx.effect(() => () => publishNotice(null), 'dsh-rewind: 清理提示状态')
}

/**
 * 仅供 `scripts/smoke-require.mjs` 使用的内部句柄——不参与任何插件契约，
 * 加载器会忽略这些额外导出。存在的理由：撤回/编辑的真正风险点在
 * 「锚点取哪个 seq」「fork 参数」「归档顺序」「改写内容送到哪个会话、送没送到、发不发」，
 * 这些都能在 Node 里用假 ctx 断言，不必等到浏览器点。
 */
export const __internals = {
  turnOf,
  plainTextOf,
  cutAndSwitch,
  deliverToChild,
  originalRendererFor,
  winnerComponentFor,
  directChildOf,
  outletOf,
  builtinRootOf,
  actionsRowByStructure,
  actionsRowByCopyButton,
  isPortalTargetOk,
  isHorizontalRow,
  isOurNode,
  locateActionsRow,
  copyIconButtons,
  findCopyButton,
  describeLocateFailure,
  getNotice: () => noticeState,
  MessageActions,
  MessageActionsInner,
  ShadowBoundary,
  RewindIcon,
  EditIcon,
}
