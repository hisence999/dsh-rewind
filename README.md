# dsh-rewind

给 DSH Web 的每条用户消息加两个按钮：

- **撤回** —— 把对话回退到这条消息**之前**（分叉出新会话 + 归档原会话），留一条带「撤销」的提示。
- **编辑** —— 改掉这条消息，然后从该处重新开始：分叉出新会话，把改好的文本放进新会话输入框，由你按回车发送。

> DSH 的会话日志是**追加式**的（`events are contiguous from seq 0 and never rewritten`），
> 官方没有「原地删除/截断」原语。本插件的「撤回」用的是官方唯一等价能力
> ——**从某个回合边界分叉**（与内置「分支」按钮同一条链路），并把原会话归档（可撤销、可恢复）。

## 安装

```powershell
dsh plugin --profile web add D:\dsh-rewind
```

然后**重启 `dsh web`**（插件图的组合变化不走热更新），刷新页面。

> 本仓库已把构建产物 `lib/` 入库：git/npm 安装默认不跑构建脚本，产物必须在包里。

## 使用

| 操作 | 位置 | 效果 |
|---|---|---|
| 撤回 | 用户消息动作行（与复制按钮**同一行**）⟳ | 从这条消息之前的最后一个回合边界分叉 → 切到新会话 → 归档原会话（**不弹提示**） |
| 编辑 | 用户消息动作行（与复制按钮**同一行**）✎ | 弹窗回填原文 → 确认 → 同上分叉 → 文本送进新会话输入框并**自动发送** |

行为细节：

- 两个按钮**和内置的复制按钮排在同一行**（时间 · 复制 · ⟳ · ✎），显隐也跟随内置动作行：
  **最后一条**用户消息常驻可见，更早的把鼠标移到该条上才一起出现。
- **成功后不弹任何提示**（归档提醒已按要求去掉）。原会话仍可从「设置 → 未归档会话」恢复。
  只有**真出问题**时才提示（改写内容没送进新会话 / 发送被拒），并且那种提示上带「撤销」。
- **首条消息不提供「撤回」**（撤回首条＝清空并归档整段对话，等于删会话），只提供「编辑」——编辑首条会新建一个空白会话，把改好的第一句话送进输入框并自动发送。
- **回合中途插话**（steering）的两个按钮**置灰**并给出原因（鼠标移上去能看到具体原因）：中途插话无法精确回退到它之前。
- 分叉出来的子会话**标题与原会话保持一致**（不追加 `(1)` 这类序号，也不会越撤回越涨）。
- 分叉出来的子会话**不继承**模型/挡位等会话级选择，需要在新会话里重新选。

## 实现要点（为什么这么做）

### 0. 关键布局一律**内联样式**；按钮还要**并进内置动作行**

第一版把 `display:flex` 写在注入的 `<style>` 里，实测在宿主上两个按钮**竖着堆叠**了
（说明那条 `.dsh-rewind-row` 规则在宿主的层叠环境里没有生效）。所以：

- 动作行与按钮的布局/尺寸/圆形/透明底全部走**内联样式**（内联优先级最高，且不依赖样式表注入成功）；
- hover 变色直接用 `onMouseEnter/onMouseLeave` 改内联样式，同样不依赖样式表；
- 样式表只负责 `:hover` 显隐、textarea、toast 这些**装饰**；缺失也不影响可用性；
- 一次性自诊断：动作行首次挂载时读 `getComputedStyle(row).display`，不是 `flex` 就 `console.warn`。

第二版横向了，但排在气泡下方**自己一行**（内置那行是「时间 · 复制」）。要真正同一行，
只能进内置那一行的 DOM——做法是 **React portal**（`react-dom` 在静态共享模块表里）：

1. 我们自己的 DOM 里只留一个隐藏锚点 `<span hidden data-dsh-rewind-anchor>`；
2. `anchor.closest('[data-chat-flow-kind]')` 找到消息容器；
3. 拿「内置渲染器根」：**`renderSlot` 会给每个槽包一层
   `div[data-slot="conversation.chat.node"][style="display:contents"]`**，所以
   `flowItem.firstElementChild` 是那层包装、**不是**内置根 —— 必须再往下钻一层
   （`outletOf()` 优先用 `:scope > div[data-slot="conversation.chat.node"]` 认 outlet，
   再取第一个「非我方」子元素）。真实层级：
   `flowItem > div[data-slot] > userRow > div.actions > button`；
4. 定位动作行，两条策略（都要过闸门）：
   - **策略 1（结构）**：内置根里**最后一个**「含 `<button>` 且不是我方产物」的直接子
     （`userRow` 的子序是 [userStack（气泡…）, actions]，动作行在最后；倒序取可避开气泡里
     JsonBlock 的同款复制按钮）；
   - **策略 2（兜底）**：**内置复制按钮的 `parentElement`** —— primitives 的 Tooltip 只
     `cloneElement` 注入 ref/事件、不插 DOM 层、不用 portal（已核实），所以复制按钮的父元素
     就是动作行；复制按钮优先用**图标 path 前缀**（语言无关）找，再退回文案；
5. **闸门 `isPortalTargetOk`**：目标必须 (a) 不是我方节点、(b) 是**横向行**
   （`display:flex` 且 `flex-direction:row`）。内置 `userRow` 是 **column** ——
   把它当目标就会「还是单独一行」，这正是第一轮实测的现象，所以这道闸门是这次的关键修复；
6. `createPortal(row, actionsRow)` 把按钮渲染进去；顺带白拿内置的显隐规则
   （最后一条常驻、更早的 hover 才一起出现）；
7. **兜底**：两条策略都没过闸门就退回「自己一行」，功能不受影响；渲染时还会检查
   `portalHost.isConnected`，目标脱链立刻退回本地渲染；另有 1s 低频巡检重新定位。
   **所有定位/portal 代码绝不抛错** —— 子代理核实过：slot entry 抛错会被
   `SlotErrorBoundary` 退休（abdicate），赢家换成内置渲染器，我们的按钮会**整个消失**。
8. **图标：按名字探测 + 兜底，绝不静态绑定**。盒子尺寸由 `ICON_SIZE`（当前 16）显式传入 ——
   0.1.5–0.1.7 的图标组件都接收 `IconProps { size = 16 }`（早期文档里「0.1.6 图标是空参函数、
   不吃 size」的说法经发布包核对是**错的**）。`ICON_SCALE` 的依据是**真机实测的渲染尺寸**，
   不是「16 × 1.15 比 16 大」这种算术直觉：内置复制按钮的 svg 写着 `width=16`，但在页面上
   实际渲染成 **18px**；我们 `size = 16` × 1.15 ≈ **18.4px**，两者差 2%、视觉重量一致 ——
   所以别照着属性值把 1.15 撤掉。**要调大小只改 `ICON_SIZE` / `ICON_SCALE` 两个常量**。
   dsh 0.1.7 把图标导出从 `IconRefreshOutline16` / `IconEditOutline16` 改名成
   `IconXxxRegular`（1px 描边）/ `IconXxxMedium`（1.3px），见下面「0.1 三道防线」。

### 0.1 三道防线：绝不让宿主退休我们的 slot entry

`conversation.chat.node` 是 keyed 槽的影子覆盖，而宿主一旦捕到我们 entry 的渲染抛错，会把
**整个 entry 一次性退休**（`abdicate`）并把赢家换回内置渲染器 —— 表现就是「消息一切正常、
我们的按钮整体消失」。更麻烦的是被退休的 entry **仍然留在 raw `entries()` 里**，所以拿它判
「我赢了吗」永远得到「是」，连刷新页面都救不回来（dsh 0.1.7 升级后的真实故障）。

三道防线：

1. **图标按名探测**：primitives 的导出名跨版本会变（0.1.7 就改过一次）；静态绑定旧名拿到的是
   `undefined`，`React.createElement(undefined)` 直接抛 `Element type is invalid`。
   现在按候选链探测（新名 → 旧名），全都没有就回落到自绘文字符号，**永不把 undefined 递给 React**。
2. **`ShadowBoundary` 自兜错**：渲染期的任何抛错都在我们自己的错误边界里兜住，按三级退化 ——
   ① 只渲染内置渲染器（该条消息的按钮暂缺，但消息不受影响、entry 仍是赢家）；
   ② 换到别的消息节点（`nodeKey` 变了）时重置一次，有界重试；
   ③ 万一兜底的内置渲染器**自己也**抛错，就渲染 `null` —— 宁可这条消息不显示，
   也绝不让错误穿透到宿主去换掉整个 entry。另外既然图标是「探测 + 兜底」的，
   崩溃源本身就已被消除，这层边界只是保险。
3. **自愈看赢家投影，不看 raw ledger**：`winnerComponentFor()` 改用 `entriesOfSlot()`
   （宿主跳过被退休 entry 的赢家投影），万一还是被退休，自愈会 dispose 后重注册把它救回来。
   自愈窗口是 `apply()` 之后的 12 次 × 80ms；之后再被退休，靠宿主重新声明槽位时
   `slots.inject` 回调重跑兜住。注意 `originalRendererFor()` 仍**必须**用 raw `entries()`
   —— 内置渲染器正是被我们遮蔽的那一个。

另外两处同类风险也已按「多候选」处理：复制按钮的**图标 path 前缀**在 0.1.6（`M6.14929…`）
与 0.1.7（`rect` + `M11.9792…`）是两代画法，只认一个会在升级后静默失效（0.1.7 实测就是恒空、
只剩文案兜底），所以 `COPY_ICON_PATH_PREFIXES` 收了两代前缀。

> 为什么要有「闸门」和「结构优先」：第一版只靠文案匹配 `aria-label` 且把目标当成了「气泡下的容器」，
> 实测**按钮没进同一行也不报错**。根因是 `renderSlot` 那层 `div[data-slot][display:contents]`
> 让「内置根」整体挪了一层；而且把按钮 portal 进 `userRow`（column）本来就还是会另起一行。
> 现在：结构优先、文案只兜底、目标必须过「横向行 + 非我方节点」闸门、失败打一次性诊断
> （`createPortal` 是否可用、`firstChildIsSlotWrap`、内置根的直接子清单含 `horizontal`、
> 实际出现的 `aria-label`），**刷新一次就能定位**。

### 1. 按钮落点：影子覆盖 keyed 槽，但**不重画气泡**

DSH 没有任何「用户消息动作」插槽：唯一的 per-message 动作槽
`conversation.chat.assistant-actions` 是 assistant 专用的（它的 owner 只有一个 `messageId`），
内置的用户消息渲染器 `UserMessageNodeView` 调 `MessageIconActions` 时既没传 `extraActions`
也没传 `onBranch` —— 所以用户气泡下原本只有一个复制按钮。

可用的挂载点是 `conversation.chat.node`（keyed 槽）：**同 cell（同 key）最低 priority 渲染**。
本插件为 `user` / `steering` 两个 key 各注册一个影子渲染器。

- **priority 的语义随版本变，所以不能赌它**：0.1.6 的 client runner 对**所有非 chain 槽无条件覆盖**
  `options.priority`（`priority = env.allocatePriority()`，`--nextPriority` 递减），于是
  「谁最后注册谁赢」；**0.1.7 把这套覆盖搬进了 `DynamicCordisPackageRunner` 的 `guardedSlots`**，
  只对**动态加载的包**生效 —— 我们这种 profile bundle 插件传的 `SHADOW_PRIORITY = -1000000`
  是原样生效的（0.1.7 实测我们直接赢）。
  两版有个共同点：注册顺序 / 优先级都不完全在我们的手里，所以仍然保留
  **`registerShadow()` 的顺序自愈**当保险 —— 注册后用 `ctx.slots.entriesOfSlot()`
  （赢家投影，会跳过被退休的 entry）自查是不是赢家，不是就 dispose 再重注册，
  有限次（12 次 / 80ms）重试直到赢；抢不到就安静退让并打一次性诊断，绝不抛
  （一个 cell 抢不到不该拖死整个插件）。这一条有专门的冒烟断言覆盖。
- **为什么不重画气泡**：内置渲染器没被导出，但 raw `ctx.slots.entries('conversation.chat.node')`
  能读到内置条目的 `component` 引用（**内置渲染器正是被我们遮蔽的那一个，只有 raw ledger 看得见它**）。
  所以我们把内置渲染器**原样**
  `React.createElement(Original, props)` 渲染，只在自己的 Fragment 里追加一行按钮 ——
  视觉零退化，内置渲染器升级也不会被我们拖住。

### 2. 撤回锚点：`legacy.turnEnds.get(上一回合)`，**不做任何推断**

`ctx.sessions.fork({ sessionId, atSeq })` 的边界语义是「**atSeq 之后（含）第一个 `turn/end`**」，
落在未闭合回合内则「不可用而非向后裁剪」。

所以「回到这条消息之前」= 传**上一回合的 `turn/end` seq**，而这个 seq 不需要推断：
chat 快照的 `legacy.turnEnds` 就是按 `turn.end.seq` 构建的，直接取
`turnEnds.get(目标消息回合号 - 1)` 即精确命中。

**为什么连 `turn/start.seq - 1` 这种看起来显然的兜底都不能用**（真实日志实测，抽了本机 171 个会话）：

```
turn 1 | start=7   | end=84   |
turn 2 | start=86  | end=139  |   ← start - prevEnd = 2
turn 3 | start=141 | end=200  |   ← start - prevEnd = 2
```

`turn/start(T)` 与 `turn/end(T-1)` 之间**还夹着 1~2 个其它事件**（`agent/inbox/spliced` 等），
所以 `start.seq - 1` 不是 `turn/end`，「第一个 ≥ 它的 turn/end」会落到**本回合**的 end：
目标消息在 turn 3 时，正确锚点是 139，而 `start-1 = 140` 会切到 200 ——
**撤回会静默切错位置（表现为「点了撤回但内容没变」），而原会话已经被归档**。

因此拿不到权威锚点时，撤回按钮**直接置灰**并说明「该消息之前的回合边界还没加载，请先向上滚动」，
而不是给一个可能切错的按钮。

### 3. 切会话 / 归档 / 空白会话的 Workspace 归属

```js
const childId = atSeq === undefined
  ? await ctx.sessions.create({ workspaceId })    // 首条消息：全新空白会话
  : await ctx.sessions.fork({ sessionId, atSeq }) // 注意：不传 increaseTitle
ctx.uiWorkspace.openSession(childId)
await ctx.uiWorkspace.archiveSession(sessionId)
```

- 注意 `ctx.sessions.open` **不存在**（两端都没有这个方法）——这正是本机上一次尝试
  （`dsh-easyrewrite`）唯一报错的地方，正确的导航 API 是 `ctx.uiWorkspace.openSession`。
- 空白会话**优先用 `workspaceId`**：官方新建会话一律 `create({workspaceId})`，
  只给 `cwd` 的话新会话可能不挂在任何 Workspace 节点下（侧栏里找不到，而且 hero 态
  输入框会因为拿不到 workspace 标题而 inert）。
  `workspaceId` 从 `ctx.workspaces.list` 里按 `view.sessionIds` 反查，查不到才回退 `cwd`。
- 归档在切会话**之后**：`archiveSession` 会清掉「当前选中项」，先切再归档才安全。
- **不要传 `increaseTitle`**：它会给继承来的标题追加序号（`xxx (1)`），而且每撤回/编辑一次
  就再涨一位（`xxx (2)`、`xxx (3)`…）。实测反馈要求标题保持不变，所以这里只传最小参数。

### 4. 改写内容的投送：走与视图无关的 input facade，**不赌 slot 挂载**

```js
const binding = await waitForBinding(childId)          // openSession 后 UI 需要一两 tick 才 retain
const input = ctx.conversation.input.for(binding.ctx)  // 该会话**常驻**的输入机，与 hero/composer 形态无关
input.setDraft(text)
// 读回核对（不是猜时序）
while (input.state.getSnapshot().draft !== text) { …… 重试 setDraft …… }
input.submit()                                          // 确认进去了才自动发送
```

**为什么不能用「composer 挂载时应用草稿」**：全新空会话在 `InputBar` 里是
`variant: hero ? "hero" : "composer"`，而 `conversation.composer.dock` 的渲染条件是
`variant === "composer" && input && sessionId` ⇒ **空会话下那个槽根本不渲染**，
挂在它上面的回填器不会挂载。实测症状正是：编辑首条后草稿没出现，
要等用户手动发出第一条消息（会话不再是 hero）才突然冒出来。
`ctx.conversation.input.for(binding.ctx)` 拿到的 facade 与视图形态无关，
而且能通过 `input.state.getSnapshot().draft` **读回验证**，所以「确认进去了再发送」是读回来的事实。

投送失败（scope 迟迟没就绪 / setDraft 没生效）时：**不发送**，在提示里说明
「内容没能自动送进新会话，请手动发送」，并**保留「撤销」入口**——不留半成品、也不丢退路。

### 5. 不可用状态用 `aria-disabled`，不是 `disabled`

浏览器**不会给 `disabled` 元素发 hover 事件**，那样「为什么不能点」的 tooltip 永远弹不出来。
所以不可用状态用 `aria-disabled` + `data-unavailable` + 去掉 `onClick`（官方
`MessageIconActions` 同款做法），这样鼠标移上去仍能看到原因。

### 6. 只能 require 静态共享模块表里的包

客户端 shell 的静态共享模块表只有：

```
react / react/jsx-runtime / react-dom / react-dom/client / @deepseek-ai/cordis /
@deepseek-ai/dsh-client-store / @deepseek-ai/dsh-client-ui-slots /
@deepseek-ai/dsh-client-ui-primitives / @deepseek-ai/dsh-client-ui-dockkit
```

其它 `@deepseek-ai/*`（含 `dsh-client-ui-chat`、`dsh-client-ui-conversation`）**只能类型引用**，
运行时 import 会打进第二份实例（第二份 React ⇒ `Cannot read properties of null (reading 'useState')`）。
本插件的 client bundle 只 require `react` 与 `dsh-client-ui-primitives`，门禁会强制这一点。

## 开发

```powershell
pnpm install          # 只装 esbuild
pnpm run bundle       # src/ → lib/（Node 半 + ModuleLoader 信封的 client 半）
pnpm run gates        # 28 项一致性门禁（名称/合同/shared-module 边界）
node scripts/smoke-require.mjs   # 89 项非可视化冒烟（用假 React 跑真实产物）
```

> 改完 `lib/client.js` **不用重启 `dsh web`**：宿主侧的 `client-hmr` 每 500ms
> （`pollIntervalMs` 默认值）轮询各插件 client 产物的 mtime/size，变化就重算 rev
> 并更新内存里的 bundle —— 所以**刷新浏览器页面**即可拿到新版本。
> 只有「插件图组合」变化（增删插件、改 profile）才需要重启 web。

### 目录

```
src/index.js            宿主半：空的 apply()（纯 UI 插件的占位，让插件进配置树）
src/client/index.jsx    浏览器半：全部逻辑
scripts/build.mjs       esbuild + ModuleLoader 包装
scripts/gates.mjs       一致性门禁
scripts/smoke-require.mjs  非可视化冒烟（node:vm + 假 React/primitives 驱动真实 lib/client.js）
lib/                    构建产物（必须入库）
docs/plan.md            设计与决策追踪
backups/                安装前 profile 配置的备份
```

`scripts/smoke-require.mjs` 会直接驱动真实产物，断言槽位注册参数、组件树结构、
**动作行的内联横向布局（回归：第一版竖排）**、**「定位内置动作行」的爬 DOM 逻辑**
（含 Tooltip 包一层的容错、用 copy/copied 文案定位、找不到就退化成自己一行）、
能力探测兜底、首条/插话/无锚点分支、
**点撤回真的把 `turnEnds` 的权威值喂给 `fork` 的 `atSeq`（且不传 `increaseTitle`）**、
空白会话的 workspace 归属、归档顺序、**改写内容送到子会话并自动发送**、
**成功路径不弹任何提示**、投送失败 / 发送被静默拒绝时不留半成品也不丢撤销入口，
以及**影子覆盖的顺序自愈**（抢不过就重注册、抢到就停）、
**图标按 dsh 0.1.7 的新导出名解析**（并覆盖 0.1.6 旧名与「一个图标都没有」两级回落）、
**`ShadowBoundary` 的三级退化**、**entry 被宿主退休后自愈仍会重注册**、
**两代复制图标 path 都认得**、**图标确实拿到显式 `size`**。
它**不能**替代浏览器验收 —— 见 `docs/plan.md` 的「待人工验收」。

## 已知限制

- 分叉不是删除：原会话被归档而非销毁（这是刻意的——日志是唯一真相）。
- 「撤回」只能切在**回合边界**上；回合中途插话无法精确回退。
- 子会话不继承模型/挡位等会话级选择。
- 「编辑」目前**总是自动发送**（按实测反馈定的）。想要「只回填不发送」的话告我，加个开关即可。
- 与复制按钮同行靠 **portal 进内置动作行**实现，依赖「复制按钮的 aria-label = chat 命名空间的
  copy/copied 文案」与「动作行是 userRow 的直接子」两个结构事实；宿主改结构时会自动退回
  「自己一行」，功能不受影响，但会退化成两行。
