# dsh-rewind 插件计划 / 设计与决策追踪

> 本插件由 DSH 插件开发助手（dsh-plugin-studio）流程产出，但**配方被本项目的实际调研推翻并重写**：
> skill 自带的 recipe 与本机 DSH 版本的真实 API 不符（见文末「与 skill 的分歧」）。
> 本文件记录真实依据、决策、验证与**待人工验收清单**。

---

## 阶段 ①：需求捕获

- [x] 插件名：`dsh-rewind`
- [x] 一句话目标：在每条用户消息下加「撤回 / 编辑」；撤回把对话回退到该消息之前，编辑改写该消息后从该处重新开始对话。
- [x] 能力面清单：
  - **纯浏览器 UI**：往会话消息上挂动作按钮（keyed 槽影子覆盖）
  - **会话操作**：fork 分叉 / 切会话 / 归档会话 / 新建空白会话
  - **输入框写入**：把编辑后的文本回填到新会话输入框
  - **根级浮层**：撤回后的撤销提示
- [x] 目标 profile：`web`（本机 `D:\DSH\dsh-home\profiles\web`）

## 阶段 ②：形态与分发决策

- [x] 形态：`bundle-client`（Node half 空壳 + 浏览器 half）
- [x] 分发方式：本地目录（`dsh plugin --profile web add D:\dsh-rewind`）；`lib/` 构建产物入库以便将来走 git 源
- [x] 包管理器：npm（本机 esbuild 通过 npm 安装；profile 侧由 dsh CLI 决定）
- [x] 构建链：esbuild 单文件打包 + ModuleLoader 信封（**不引 TS**——`dsh-client-store` /
      `dsh-client-ui-slots` / `dsh-client-ui-primitives` 这三个包在本机磁盘上**没有 `.d.ts`**
      （只存在于 shell 的静态模块表里），所以类型检查本来就无法覆盖最关键的契约，不值得引入 TS 工具链）

## 阶段 ③：装配（真实 API，含证据）

### 关键调研结论（只读，均有文件行号）

| 结论 | 依据 |
|---|---|
| 会话日志追加式，**不存在** truncate/rollback/deleteAfter/rewind 原语 | `dsh-session-persistence` 类文档「events are contiguous from seq 0 and never rewritten」；全仓 `.d.ts`+`.js` 扫描 0 命中 |
| 官方唯一「回退到某条之前」= **fork**，边界 = atSeq 之后（含）第一个 `turn/end` | `dsh-api-session-controller/lib/types/client/contract/sessions.d.ts:119-133` |
| 内置「分支」按钮同链路：`fork(...).then(openSession)` | `dsh-client-ui-chat/lib/client.js:8376-8384` |
| **用户消息没有动作插槽**（唯一 per-message 动作槽是 assistant 专用） | `dsh-client-ui-chat/lib/types/client/contract/slots.d.ts:197-201`（owner 仅 `{messageId}`）；渲染点 `client.js:3683` |
| 内置用户渲染器：有复制、**没有** branch/extraActions | `dsh-client-ui-chat/lib/client.js:1355-1375`（`user` 与 `steering` 两个 key 都指向 `UserMessageNodeView`） |
| **runner 对所有非 chain 槽无条件覆盖 `options.priority`** ⇒ 影子覆盖取决于加载顺序 | `dsh-cordis-client-runner/lib/client.js:276-280`（`priority = env.allocatePriority()` 无 undefined 判断）+ `:392-393`、`:615`（`--nextPriority` 递减）+ `dsh-client-ui-renderer/.../registry.d.ts:32-37`（最低者渲染） |
| `ctx.slots.entries()` 可读到内置条目的 `component`；`guardedSlots` 只拦 `register`/`registerFactory`，其余方法原样转发 | `dsh-client-ui-renderer/lib/types/client/registry.d.ts:159-164`；`dsh-cordis-client-runner/lib/client.js:250-256` |
| `ctx.sessions.open` **两端都不存在**；切会话用 `ctx.uiWorkspace.openSession` | `ISessions` 全成员表无 `open`；`dsh-client-ui-workspace/lib/types/client/navigation.d.ts:13` |
| 回合边界 seq 现成可取：`legacy.turnEnds` = `turn.end.seq` | `dsh-client-ui-chat/lib/client.js:5561-5570,5576`（`snapshot.d.ts:72`） |
| **`turn/start.seq - 1` 是错的锚点**：`turn/start(T)` 与 `turn/end(T-1)` 之间还夹着 1~2 个事件 | 本机真实日志实测（见下表），171 个会话统计 |
| 编辑草稿回填的正规入口：`inputActions.setDraft`（session 作用域 slot 的标准 props） | `dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts:315-322`；`contract/input.d.ts:164-165,206-217` |
| `sessionId` / `useChat` / `useInput` / `inputActions` / `useWorkspaces` 都是受支持的标准 props | `dsh-cordis-client-runner/lib/client.js:2518-2533`（标准 props 名）；`ui-chat`/`ui-conversation` 的 `declare module ... SessionStandardProps/GlobalStandardProps` |
| 空白会话应给 `workspaceId`（只给 `cwd` 可能不挂进任何 Workspace） | `dsh-client-ui-workspace/lib/client.js:55-71`（`connectWorkspace` → `sessions.create({workspaceId})`）；`WorkspaceView.sessionIds` 可反查归属 |
| 取消可用状态要 `aria-disabled` 而非 `disabled`（后者收不到 hover ⇒ tooltip 弹不出来） | `dsh-client-ui-chat/lib/client.js:1082-1100`（官方 `data-unavailable` + visuallyHidden 做法） |
| 撤销提示要跨会话切换存活 ⇒ root 作用域 `shell.overlay`（list、click-through） | `dsh-client-ui-layout/lib/types/client/index.d.ts:80-83` |
| 客户端只能 require 静态共享模块表（9 个包） | shell 的 `rx()`：`dsh-web-frontend/dist/assets/index-8VXBH-f-.js:126` |
| `locale.register` 真实签名支持 `(ns, {zh,en})` 与 `(ns, locale, dict)`；重复注册同 (ns, locale) 会抛 | `dsh-client-locale/lib/client.js:1252-1278` |

### 真实会话日志实测（撤回锚点的关键依据）

把本机 `D:\DSH\dsh-home\sessions` 下 171 个 `session.v3.jsonl.zstd`（zstd 多帧，按 magic
逐帧解压）解出来统计 turn 结构，样本（40 个闭合回合）：

| turn | turn/start seq | turn/end seq | start − 上一回合 end | 该回合内的 user/message seq |
|---|---|---|---|---|
| 1 | 7 | 84 | – | 12,13,14,15 |
| 2 | 86 | 139 | 2 | 89 |
| 3 | 141 | 200 | 2 | 144 |
| 4 | 202 | 232 | 2 | 205 |
| … | … | … | 多数为 2，少数 3、8、9 | … |

结论（三条，都写进了实现）：

1. `turnEnds.get(T-1)` 精确命中「该消息之前的最后一个回合边界」——目标消息在 turn 3 时锚点 = 139 ✅
2. `turn/start(T) - 1` = 140，第一个 ≥ 140 的 `turn/end` 是 **200（本回合）** ⇒ 用它当兜底会**静默切错**。
   **兜底已删除**，拿不到权威锚点就置灰。
3. 少数回合（样本里的 turn 14 / 38）user/message 事件**排在 turn/start 之前**（排队/插话场景）。
   这不影响锚点：`turnEnds.get(T-1)` 仍严格早于该消息，仍然正确。

### 装配结果

- [x] `src/index.js`（宿主半：空 `apply()`；纯 UI 插件只需要出现在配置树里）
- [x] `src/client/index.jsx`（浏览器半：全部逻辑）
- [x] `inject` 覆盖所有用到服务：`['slots', 'locale', 'sessions', 'uiWorkspace']`
      （**刻意不注入 `conversation`**——草稿回填走 `inputActions` props，少一个硬依赖就少一个「服务缺失导致 fiber 永远 pending」的风险）
- [x] 所有注册都在 `ctx.slots.inject(...)` 里（等待槽位声明 + 随 fiber 卸载自动回收），
      字典与跨会话状态清理走 `ctx.effect`
- [x] 冒烟标记：按钮本身就可见（无独立冒烟入口）
- [x] 未手改 `lib/`（`lib/` 是 `pnpm run bundle` 的产物）

### 4 个槽位贡献

| 槽位 | key/id | priority/order | 作用 |
|---|---|---|---|
| `conversation.chat.node` | key=`user` | `-100000` | 影子覆盖内置用户渲染器，追加动作行 |
| `conversation.chat.node` | key=`steering` | `-100000` | 同上（按钮置灰，说明无法精确回退） |
| `conversation.composer.dock` | id=`rewind-draft` | order=60 | 不可见的草稿回填器（挂载即代表输入壳就绪） |
| `shell.overlay` | id=`rewind-undo` | order=40 | 撤回后的「已归档 · 撤销」提示 |

前两者声明 `locale: 'chat'` —— 这是**必须**的：我们要把框架注入的 `t` 原样转发给内置渲染器
（它需要 chat 命名空间的翻译函数）。插件自己的文案走模块级 `ctx.locale.bind('rewind')`。

## 阶段 ④：本地验证

- [x] `npm install` 通过（只装 esbuild 0.28.2）
- [x] `node scripts/build.mjs` 通过 —— `lib/index.js` 57B / `lib/client.js` ≈27.5KB
- [x] `node scripts/gates.mjs` 通过 —— **28 项**
- [x] `node scripts/smoke-require.mjs` 通过 —— **79 项**（`node:vm` + 假 React/primitives/react-dom 驱动**真实产物**）
- [ ] `python3 <skill>/scripts/verify_plugin.py .` —— 可选，未跑（本机无 python3 保证；门禁已覆盖其校验点）

### 门禁覆盖

名称三者一致（package name == patch insert id/name == ModuleLoader id）、package 合同
（name/version/type/main/exports/dsh.bundle/dsh.client/files）、**禁止声明 `@deepseek-ai/*` 依赖**、
client 产物**只 require 9 个共享模块**、未 require ui-chat/ui-conversation、未夹带第二份 React。

### 冒烟覆盖（非可视化，驱动真实 `lib/client.js`）

ModuleLoader 信封可执行 + `inject` 清单 + 3 个槽位注册参数（key/locale/id/order）+
字典 zh/en key 集合对称 + 组件树结构（**第一个孩子是内置渲染器**、动作行按钮数、默认无弹窗）+
**动作行的内联横向布局**（`display:flex` / `flexDirection:row` / `justifyContent:flex-end`，
第一版竖排那个 bug 的回归断言）+ **「定位内置动作行」的爬 DOM 逻辑**
（`directChildOf` / `locateBuiltinActionsRow` 跨 Tooltip 包裹层、`findCopyButton` 用 copy/copied
文案定位、找不到返回 undefined 以便退化成自己一行）+ 隐藏锚点已渲染 +
能力探测兜底（缺 `useChat` 时只渲染内置渲染器）+ 首条消息只有「编辑」+
steering 两按钮 `aria-disabled` 且无 `onClick` + **无权威锚点时撤回按钮不可用（拒绝危险推断）**+
**点「撤回」真的把 `turnEnds` 的权威值喂给 fork 的 `atSeq`（且不传 `increaseTitle`）** +
切会话 + 归档顺序 + **成功路径不弹任何提示** + 编辑首条优先 `create({workspaceId})`、
查不到归属回退 `cwd` + **改写内容投送到子会话并 `submit()` 自动发送** +
`draftText=null` 时不投送不发送 + **投送失败不抛穿、不发送、且保留撤销入口** +
**发送被静默拒绝（草稿没被清空）也能识别并提示「请按回车」** +
**影子覆盖的顺序自愈**（抢不过内置时反复重注册、反超后停止）。

## 阶段 ⑤：安装与浏览器冒烟

- [x] 备份 profile 配置后安装 —— 备份在 `backups/profile-web-before-install-20260921-103835/`
      （`web-package.json` / `web-cordis.patch.yml` / `web-pnpm-lock.yaml` / `dump-config-before.txt` / `dump-config-after.txt`）
- [x] 安装成功：`dsh plugin --profile web add D:/dsh-rewind` → `+ dsh-rewind link:D:/dsh-rewind`
- [x] **package.json 的 `dsh.profile.bundles` 被安装流程自动追加了 `"dsh-rewind"`**（无需手改）
- [x] 组合配置树校验：`dsh --profile web --dump-config` 与安装前逐行 diff，
      **新增仅 3 行**：`# == dsh-rewind` / `- id: dsh-rewind` / `name: dsh-rewind`（after 664 行 vs before 661 行）
- [x] 从 profile 目录可解析：`require.resolve('dsh-rewind')` → `D:\dsh-rewind\lib\index.js`；
      `dsh-rewind/client` → `D:\dsh-rewind\lib\client.js`；`dsh.client.platform === 'web'`
- [ ] 重启 `dsh web` 后启动日志无 `plugin tree failed to load`（**用户执行**）
- [ ] 浏览器控制台无 `slot entry crashed`（**用户执行**）
- [ ] **按钮可见、撤回/编辑行为正确**（**用户执行**，见下方「待人工验收」）

---

## 对抗性只读审查（子代理）发现与修复

交付前按 AGENTS.md 规则 6 调子代理做只读审查，报告 5 条缺陷，**全部已修**：

| # | 缺陷 | 处置 |
|---|---|---|
| D1 | 锚点兜底 `turn.start.seq - 1` 会把撤回切到**本回合之后**（静默失效，且原会话已被归档） | **删除兜底**；拿不到 `turnEnds` 权威值就置灰。并用 171 个真实会话日志实测确认（见上表） |
| D2 | 编辑首条用 `create({cwd})` 可能让新会话不挂进任何 Workspace（侧栏看不见） | 改为**优先 `create({workspaceId})`**（从 `ctx.workspaces` 按 `sessionIds` 反查），查不到才回退 `cwd` |
| D3 | `DraftApplier` 一读到 `draft === wanted` 就清 pending，可能被输入壳自己的持久化草稿 seed 顶掉 | 改为**连续两次**确认一致才清；超时清掉并 `console.warn` 留痕 |
| D4 | 硬编码 `priority` 撞车（若宿主不覆盖 priority）会让 `register` 抛错，进而拖死整个 `apply` | 注册包 try/catch + `console.warn`；并把 priority 语义改成实测结论（runner 无条件覆盖）+ 新增**顺序自愈**（这才是影子覆盖真正成立的原因） |
| D5 | 撤回也传 `increaseTitle: true`（标题被追加 `(1)`，且每撤一次递增） | 审查当时判断「刻意保留」；**用户实测后否决** → 已改为不传该参数，子会话标题与原会话保持一致 |
| 小 | `Tooltip` 包 `disabled` 按钮 ⇒ 原因 tooltip 永远弹不出来 | 改用 `aria-disabled` + `data-unavailable` + 去掉 `onClick`（官方同款），并加 visuallyHidden 说明 |
| 小 | 文件头注释声称「内置 priority 由 runner 倒序分配 -1/-2/-3」，与实际（无条件覆盖）不符 | 注释与 README 全部改写为实测结论 |
| 小 | 冒烟注释声称断言了锚点，实际只断言了 `onClick` 是函数 | 新增**真的点按钮 → 断言 fork 的 `atSeq === 139`**，以及「无锚点必须置灰」 |

审查同时确认了「不可在 Node 里确证」的 4 点（真实 React 渲染 / 内置 DOM 结构 /
`openSession`→`archiveSession` 的真实导航时序 / turn 编号是否恒从 1 起），
这些都进了下面的「待人工验收」。

---

## 第一轮用户实测反馈（4 条）与修复

用户在真机上测出 4 个问题，**全部已修**（这一轮的教训是：Node 层的假环境测不出真实 DOM 与真实输入机）：

| # | 现象 | 根因（已实证） | 修复 |
|---|---|---|---|
| 1 | 两个按钮**竖着堆叠**，没有横向排列 | 关键布局（`display:flex`）写在注入的 `<style>` 里，在宿主的层叠环境里**没有生效**（Tooltip 的包裹元素是块级，于是竖排） | **关键布局全部改内联样式**（`ROW_STYLE`/`ACTION_STYLE`），hover 也改成 `onMouseEnter/Leave` 直接改内联——不再依赖样式表；样式表只留装饰。另加一次性自诊断：首次挂载读 `getComputedStyle(row).display`，异常就 `console.warn` |
| 2 | 首条「编辑」：跳到新建对话页，草稿没出现；**手动发出第一条消息后**草稿才冒出来 | 全新空会话在 `InputBar` 里是 `variant: hero ? "hero" : "composer"`，而 `conversation.composer.dock` 的渲染条件要求 `variant === "composer"` ⇒ **空会话下那个槽不渲染**，挂在它上面的草稿回填器根本没挂载 | 删掉 composer.dock 那套 slot 手法，改用与视图无关的 `ctx.conversation.input.for(binding.ctx)`（先 `waitForBinding` 等 retain），`setDraft` 后用 `input.state.getSnapshot().draft` **读回核对** |
| 3 | 中间消息「编辑」确认后只回填、不发送，要按两次发送 | 上一轮按需求做的是「只回填不自动发送」 | 改为**确认即自动发送**：读回确认草稿真的进了编辑器之后才 `input.submit()`；失败则不发送并在提示里说明 |
| 4 | 撤回/编辑产生的子会话标题被追加 `(1)`，且每操作一次递增 | `fork({increaseTitle: true})` 的语义就是递增继承标题 | **去掉 `increaseTitle`**，fork 只传 `{sessionId, atSeq}` |
| 附 | （自查发现）自动发送可能被 hero 态尚未就绪的输入框**静默拒绝**，又变成「要按两次」 | `input.submit()` 不抛错，只是不生效 | 提交后**读回草稿是否被清空**（提交成功会 `commit-draft`）；没清空就提示「发送没被接受，内容仍在输入框，请按回车」并保留撤销入口 |

修复后重测：**门禁 28 项 / 冒烟 61 项全绿**（新增了布局内联、不改标题、投送到子会话并自动发送、
投送失败不抛穿且保留撤销入口等断言）。

### 第二轮反馈（2 条）与修复

| # | 现象 | 根因 | 修复 |
|---|---|---|---|
| 5 | 横向了，但排在气泡下方**自己一行**（内置那行是「11:23 · 复制」）；希望**和复制按钮同行** | 我们的动作行是 `userRow` 的**兄弟**节点，天生只能另起一行 | 改成 **React portal 进内置动作行**：留一个隐藏锚点 → `closest('[data-chat-flow-kind]')` → 用 `button[aria-label=<chat 的 copy/copied 文案>]` 定位复制按钮（用文案而不是 hash 过的 class）→ 上爬两级拿动作行（不惧 Tooltip 包一层）→ `createPortal`。顺带白拿内置的显隐规则；定位失败自动退回「自己一行」，另有 1s 低频巡检处理重挂载脱链 |
| 6 | 归档的提醒弹窗（底部「已撤回：原会话已归档 · 撤销」）不要 | 上一轮把成功提示当成撤销入口在做 | **成功路径不发任何提示**；只有失败（改写内容没送进新会话 / 发送被拒）才提示，且那种提示仍带「撤销」。撤销入口改为从「设置 → 未归档会话」恢复 |

修复后重测：**门禁 28 项 / 冒烟 77 项全绿**（新增了布局内联、不改标题、投送到子会话并自动发送、
投送失败不抛穿且保留撤销入口等断言）。

### 第三轮反馈（1 条）与修复

| # | 现象 | 根因（子代理逐行核实） | 修复 |
|---|---|---|---|
| 7 | 弹窗确实没了，但按钮**位置还是没变**（仍在自己一行），且控制台无任何日志 | **`renderSlot` 每个槽都会包一层 `div[data-slot="…"][style="display:contents"]`**（`dsh-client-ui-renderer/lib/client.js:1094,1099-1103`），所以 `flowItem` 的唯一子元素**不是**内置气泡根，而是这层包装；真实层级是 `flowItem > div[data-slot] > userRow > div.xzv4MW_actions > button`。于是：① 我第二轮加的「策略 A」用 `flowItem.firstElementChild.lastElementChild` ⇒ 拿到**我们自己的行**（包装层的最后一个子）⇒ `createPortal(row, 自己)` 并打印**假成功**；② 原「策略 B」从复制按钮往上爬两级 ⇒ 拿到 `userRow`（**列方向**）⇒ portal 进去自然还是单独一行 —— 这就是用户看到的「位置没变」。⚠️ 我第二轮猜的「`t('copy')` 拿不到文案」是**错的**：`copy`/`copied` 在 **common** 字典（zh「复制」/「复制成功」），chat 的 `t` 会回退到 common，所以文案一直是对的 | ① 新增 `outletOf()`：优先用 `:scope > div[data-slot="conversation.chat.node"]` 认准 outlet，再取第一个**非我方**子元素作为内置根；② 结构策略改为「内置根里**最后一个**含 button 且非我方产物的直接子」（`userRow` 子序 [userStack, actions]）；③ 兜底策略改为「**复制按钮的 parentElement**」（子代理核实 Tooltip 只 `cloneElement` 不插 DOM 层，所以父元素就是动作行），并优先用**图标 path 前缀**（语言无关）定位复制按钮、排除气泡里 JsonBlock 的同款图标按钮；④ 新增**语义闸门 `isPortalTargetOk`：目标必须不是我方节点、且必须是横向行**（`userRow` 是 column ⇒ 直接拒绝，正是这次失败模式的看门人）；⑤ 渲染时检查 `portalHost.isConnected`，目标脱链立刻退回本地渲染（消除重挂载空窗） |

**同一轮两个子代理的额外结论（都有 `文件:行` 证据）**：
- `createPortal` **确认可用**：共享表里的 `bc` 是完整 react-dom 18.3.1-next 命名空间（含 `createPortal/createRoot/flushSync…`），且与 `react-dom/client` 是同一实例（同 reconciler）；shell 自己也用 `createPortal`。所以方案方向没错。
- **entry 抛错 = 按钮全消失**（不是整条消息崩）：`SlotErrorBoundary` 会 `console.error` + `reportEntryError(abdicate)`，该 entry 退休、赢家换成内置渲染器。⇒ 我们所有定位/portal 代码**绝不能抛错**，只能退化成「自己一行」。
- **确认没有官方的「给用户消息动作行追加」扩展点**：70 个槽全扫过，`extraActions` 唯一传值点是 assistant 的 `TurnTailNodeView`；无 `ctx.uiChat`；`provide()` 只用于 hook/挂根；`dockkit` 是 zone+rect 布局引擎、无 DOM 锚点能力；自定义 ChatNodeKind 是「替换整行」而非追加。⇒ 「影子覆盖 + portal」仍是唯一可行路线。

修复后重测：**门禁 28 项 / 冒烟 78 项全绿**（新增：`outletOf` 认准 outlet、`builtinRootOf` 穿过 data-slot 包装层、`actionsRowByStructure`、`isPortalTargetOk` 拒绝 column 的 userRow 与我方行、端到端 `locateActionsRow`、图标定位与 JsonBlock 排除等）。
**真机验证**：用户确认「正常了」——按钮已与复制按钮同行，显隐跟随内置动作行。

### 第四轮反馈（1 条）与修复

| # | 现象 | 根因 | 修复 |
|---|---|---|---|
| 8 | 位置对了，但图标比内置复制图标**小一圈** | primitives 的图标组件是**空参函数**（`function Pw(){ return jsx("svg",{width:"16",height:"16",…}) }`）——既不接收 `size` 也不透传 style/className，所以原来写的 `size: 15` 是**空操作**（官方 `message-feedback` 里的 `size: 12` 同理），图标永远是 16px 属性尺寸；而内置复制图标是实心粗描边、占位饱满，我们的 ⟳ ✎ 细描边、留白多，同样盒子看着就小 | 把图标包一层用**内联 `transform: scale()`**（内联不受宿主 CSS 层叠影响、也不依赖我们的样式表是否注入成功）放大到视觉重量相当；抽成单常量 **`ICON_SCALE`（1.0 = 原尺寸，当前 1.15）**，想调只改这一个数 |

修复后重测：**门禁 28 项 / 冒烟 79 项全绿**（新增「图标包了一层内联 transform 放大」断言）。

附带确认（避免用户白重启）：**改 `lib/client.js` 不需要重启 `dsh web`** ——
宿主侧的 `client-hmr` 每 500ms（`pollIntervalMs` 默认值）轮询各插件 client 产物的
mtime/size，变化即调用 `clientModules.rebuilt(id)` 重算 rev 并更新内存 bundle；
浏览器**刷新页面**即可拿到新版本。只有「插件图组合」变化（增删插件、改 profile）才需要重启。

## 阶段 ⑥：发布

- [ ] git 仓库与 remote 就绪
- [ ] README 使用真实安装 ref
- [x] 构建产物已入库（`lib/`）
- [ ] 从目标 ref 重装验证通过

---

## ⚠️ 待人工验收（必须真人 + 真浏览器，agent 无法代做）

> 用户明确要求：涉及**重启 `dsh web`** 与**可视化操作**的验证由用户执行。
> 第二轮修复后的复验清单如下：

### 必验 1：按钮到底出没出现（影子覆盖成立与否）

**预期**：重启后，每条用户消息下方出现 ⟳（撤回）与 ✎（编辑）两个图标按钮
（最后一条常驻可见；更早的把鼠标移到该条上才出现，与内置复制按钮同一套规则）。

**若没出现**：影子覆盖没抢到 cell（runner 会覆盖 priority，谁后注册谁赢；我们已实现顺序自愈）。
排查顺序：
1. 控制台搜 `[dsh-rewind]` —— 我们抢不到会打印 warning（`影子自愈失败` 或 `槽位注册失败`）；
2. 控制台搜 `slot entry crashed` —— 若我们组件自己崩了，那是代码问题，请把堆栈给我；
3. 若 12 次自愈全用完还是没抢到：说明内置注册发生得比我们**晚很多**（超出 ~1s 窗口），
   这时把 `SHADOW_MAX_ATTEMPTS` / `SHADOW_RETRY_MS` 调大即可（我可以帮你调）。
4. 另一个可能：内置用户气泡的 DOM 结构变了导致我们的 CSS 选择器不匹配 → 按钮在但不显眼；
   用开发者工具看 `[data-dsh-rewind-row]` 这个属性是否存在。

### 必验 1b：按钮是否与复制按钮**同一行**（第二/三轮反馈的回归点）—— ✅ 2026-09-21 用户实测通过

**结果**：用户确认「正常了」——在「时间 · 复制」那一行出现了 ⟳ ✎，位置与显隐都跟随内置动作行。
**当时留下的预期（供以后回归）**：那一行是「`11:23` · 复制 · ⟳ · ✎」，
且控制台**恰好一行** `[dsh-rewind] 按钮已并进内置动作行 {via: "structure"}`。

**若以后又变回两行**：我们已自动退回「自己一行」（功能不受影响）。
这时控制台应有一行 `[dsh-rewind] 没能定位内置动作行…` 的 **warn**，
带 `createPortal` / `getComputedStyle` / `flowKind` / `firstChildIsSlotWrap` / `builtinRootChildren`
（含每项的 `ours`、`hasButton`、`horizontal`）/ `copyButtonFound` / `copyLabel` / `buttonLabels`
—— 把这一行原文贴出来即可一次定位。

### 必验 2：fork 锚点是否精确切在目标消息之前

**步骤**：找一条 **≥3 轮**的会话（第 1、2、3 轮各有一次你的提问）。
1. 对**第 2 轮**的用户消息点「撤回」；
2. **预期**：切到一个新会话，内容**只包含第 1 轮**（第 2 轮的问与答都不在），原会话进归档区；
3. **预期：不出现任何提示弹窗**（第二轮要求去掉归档提醒）；原会话可从「设置 → 未归档会话」恢复；
4. 若子会话里**多出第 2 轮的助手回答**，说明锚点算错了 —— 请把该会话的 `turn/start` 与
   `turn/end` 的 seq 给我（这是本次唯一没有浏览器实测的核心假设，虽然已用 171 个真实日志验证过推导）。

### 必验 3：编辑流程（**确认即自动发送**）

1. 对任意**非首条**用户消息点「编辑」→ 弹窗回填该条原文；
2. 改几个字 → 「分叉并发送」→ **预期**：切到新会话，输入框里短暂出现改好的文本，**随即自动发出**，
   不需要再按发送（也不该出现「要按两次」），并且**不弹成功提示**；
3. 发出去的内容应**正是改写后的文本**（不是原文、不是空）；
4. 对**首条**消息点「编辑」→ **预期**：新建一个空白会话（无历史），自动发出改写后的第一句话，
   且这个新会话在侧栏里归在**同一个项目/Workspace** 下（不是「未分组」）；
5. 反例（可选）：断网/掐掉 host 后点编辑 → **预期**提示「内容没能自动送进新会话，请手动发送」
   且提示上仍有「撤销」，而不是静默失败。

### 必验 4：边界与观感

1. 首条消息：**只有** ✎，没有 ⟳；
2. 回合中途插话（如有）：两个按钮置灰，且**鼠标移上去能看到原因**（用 aria-disabled 就是为了这个）；
3. 最后一条用户消息的按钮常驻可见；更早的把鼠标移到该条上，**整行一起**出现（跟随内置显隐）；
4. 向上滚动到很早的历史消息：撤回按钮应可点（`turnEnds` 覆盖已加载窗口）；
   若某条显示置灰并提示「回合边界还没加载」→ 说明该窗口缺 turn/end，请告诉我；
5. **子会话标题应与原会话完全一致**（不带 `(1)`，也不会越操作越涨）——第一轮反馈的回归点；
6. **撤回/编辑成功后不应有任何弹窗**（第二轮反馈的回归点）；
7. **控制台**：正常应有一行 `[dsh-rewind] 动作行已就绪 {display: "flex"}`；
   若看到 `动作行布局异常` 或 `样式表未注入`，请把那条 warn 发我（布局已内联所以仍可用，
   但说明宿主的 CSS 环境与预期不同，我要据此调整）；
8. 新会话的模型/挡位与预期一致（**已知不继承**，需要手选——如需继承请提，我再补）。

---

## 备注

### 上一次尝试（`dsh-easyrewrite`）的教训——已规避

日志 `D:\DSH\dsh-home\dsh-easyrewrite.log` 显示上次已经做对了「算边界 + 归档 + 开新会话 + 回填草稿自动发送」，
**唯一 error 是 `ctx.sessions.open is not a function`**（全日志仅此一处 error）。
本插件改用 `ctx.uiWorkspace.openSession`，并把 `no-boundary` 降级路径（首条 / 跨回合）
做成显式分支而不是异常路径。上次遗留的 `rewind-snapshots/`、`dsh-recall-snapshots/`
（工具调用写前快照 / 每会话一个 git 仓库）属于另一个「撤回同时还原文件改动」的野心，
**不在本次范围内**。

### 与 skill（dsh-plugin-studio）的分歧

skill 自带的 recipe 与本机 DSH 真实 API 不符，**照抄会失败**，本项目以实测代码为准：

1. `recipes/settings-panel.md`/`status-badge.md` 用 `ctx.slots.register({ name, component })` ——
   真实签名是 `ctx.slots.register(options, Component)`，且 `name` 必须是**已被声明**的 slot key。
2. recipe 里的 slot 名（`settings`/`status`）在本机 SlotMap 里不存在。
3. recipe 未提 `priority` 影子覆盖、未提静态共享模块表约束——这两点才是本插件能成立的关键。
4. recipe 说「关键 UI 用内联样式」是对的，我第一版没照做就踩了坑（按钮竖排）——这条建议值得当硬规则。

### 决策变更记录

- 初版设计把「撤回」按钮也放在首条消息上（走新建空白会话）；用户澄清「首条只会编辑，
  只撤回等于删对话」→ 改为首条不渲染「撤回」，只保留「编辑」。
- 初版打算用 `ctx.conversation.input.for(scope)` 回填草稿（跨会话、需轮询等输入壳就绪）；
  第二版改成 `conversation.composer.dock` 不可见组件消费 `pendingDraft`——「挂载即就绪」、
  少注入一个服务。**这条在实机上被证伪**（hero 形态不渲染该槽），第一轮反馈后已改回
  `input.for(binding.ctx)`，并加上 `input.state.getSnapshot().draft` 读回核对。
- 字典注册从「两次 `register(ns, locale, dict)`」改为「一次 `register(ns, {zh, en})`」：
  单次调用单次 disposer，避免热重载下撞 `locale namespace already has locale`。
- **子代理只读审查后（D1）**：删除 `turn.start.seq - 1` 锚点兜底 —— 真实日志实测它会把撤回
  切到本回合之后。改为「拿不到权威锚点就置灰」。
- **审查后（D4，最严重的一条）**：实测发现 runner 对非 chain 槽**无条件覆盖** `options.priority`，
  原设计的「显式大负值压过内置」根本不成立，影子覆盖实际取决于插件加载顺序。
  新增 `registerShadow()` 顺序自愈（抢不到就重注册，每次重注册都能拿到更低的 priority），
  并加 try/catch 保证抢不到也只是「没有按钮」，不会拖死 `apply`。
- **审查后（D2/D3）**：空白会话改为优先 `create({workspaceId})`；草稿回填清 pending 前要求
  连续两次确认，避免被输入壳自己的持久化草稿 seed 顶掉。
- **审查后（小）**：不可用状态从 `disabled` 改为 `aria-disabled` + `data-unavailable`
  （否则「为什么不能点」的 tooltip 永远弹不出来）。
- **第一轮用户实测后（4 条）**：① 关键布局改内联样式（原样式表规则在宿主上没生效 ⇒ 按钮竖排）；
  ② 投送改写内容**反过来**改回 `ctx.conversation.input.for(binding.ctx)`——证据是
  `composer.dock` 只在 `variant === "composer"` 时渲染，空会话（hero）根本不挂载，
  所以上一版「挂载即就绪」的假设在首条编辑场景下不成立；
  ③ 编辑确认后**自动发送**（先读回确认草稿进入编辑器再 `submit()`，失败则不发送并保留撤销入口）；
  ④ 去掉 `fork` 的 `increaseTitle`，标题不再被追加/递增序号。
- **第二轮用户实测后（2 条）**：⑤ 按钮改为 **portal 进内置动作行**，与复制按钮真正同一行
  （定位用 aria-label 文案 + 结构爬升，失败自动退回自己一行，另有低频巡检处理重挂载）；
  ⑥ **成功路径不再发任何提示**，归档提醒弹窗去掉（只有失败才提示，那种提示仍带撤销）。
- **dsh 0.1.7 兼容修复（2026-09-22）**：升级到 `0.1.7-alpha.1` 后两个按钮整体消失。
  只读排查的证据链：① `dsh --profile web --dump-config` 里插件仍在配置树；临时实例的
  `__DSH_BOOT__` 已下发 `dsh-rewind/client.js&rev=…`，启动日志无 client-modules 组合错误
  ⇒ Node 侧正常；② 浏览器实测 `apply()` 确实执行了（我们注入的 `<style>` 在），但在有 160 条
  消息节点的会话里 `[data-dsh-rewind-anchor]` 数量为 **0**；③ 遍历 React fiber 发现渲染 user
  节点的是**内置 `UserMessageNodeView`**，且其 props 里 `useChat`/`t` 都是 function
  ⇒ 排除了「缺 useChat 就静默降级」那条分支；④ 真因：**0.1.7 把 primitives 的图标从
  `IconXxx16` 改名成 `IconXxxRegular`（1px）/ `IconXxxMedium`（1.3px）**，我们静态绑定的旧名
  变成 `undefined` → `createElement(undefined)` 抛 `Element type is invalid` → 宿主
  `SlotErrorBoundary` 把该 entry **一次性退休**（abdicate）→ 赢家换回内置渲染器。
  为什么「刷新也没用」：被退休的 entry **仍然留在 raw `entries()` 里**，`registerShadow()`
  的自愈恰好用它判赢，永远得到「是」，于是不重注册。
  修复（三道防线）：① 图标改为按候选链探测（`Regular` → `Medium` → 旧名 → 自绘文字符号），
  盒子尺寸改为显式传 `ICON_SIZE`（旧版空参图标会忽略该 prop）；② 新增 `ShadowBoundary`
  自兜渲染错 —— 抛错只退化成「渲染内置渲染器」，不冒泡给宿主，entry 因此不被退休；
  ③ `winnerComponentFor()` 改用 `entriesOfSlot()`（宿主跳过被退休 entry 的赢家投影），
  而 `originalRendererFor()` 仍**必须**用 raw `entries()`（内置渲染器正是被我们遮蔽的那一个）。
  验证：28 项门禁 + 83 项冒烟断言（新增 4 项钉住图标解析、退休后仍重注册、无图标兜底）全过；
  真机实测按钮回归（2 个、aria-label 正确、`display:flex` + `flexDirection:row`、可见），
  并与内置「复制」按钮同处一个 flex-row 动作行（子序：时间 · 复制 · 我们）；
  编辑弹窗（`Modal`/`Button`/textarea）打开与取消正常。验收全程未做任何写操作。
- **只读子代理审查后的修正（2026-09-22，同一轮）**：审查结论是「可以交付」，同时指出几处要收口的地方，
  已一并修掉：① `COPY_ICON_PATH_PREFIX` 只写了 0.1.6 的 `M6.14929…`，而 0.1.7 的复制图标已改成
  `rect` + `M11.9792…`（真机 DOM 实测确认），导致「语言无关」的定位路径在 0.1.7 恒空、只剩文案兜底 ——
  改成 `COPY_ICON_PATH_PREFIXES` 多候选（两代都认）；② `ShadowBoundary` 不重置 `failed`，注释里
  「下一轮还能重试」并不成立 → 改为三级退化（兜底渲染内置渲染器 → `nodeKey` 变化时**有界**重试 →
  二次崩溃渲染 `null`，绝不把错误再放出去换掉整个 entry）；③ `probe()` 先 dispose 后 register，
  register 抛错会留一个空 cell → 补一次重注册；④ 补齐测试缺口：图标确实拿到 `size`、0.1.6 旧名回落、
  `ShadowBoundary` 三级行为、假 DOM 的复制 path 换代。
  另有一处**审查推算被真机实测推翻**：审查按源码 `width=16` 推断内置复制图标渲染 16px，建议把
  `ICON_SCALE` 从 1.15 调回 1.0；实测内置 svg 在页面上实际渲染成 **18px**，我们 `size=16` × 1.15 ≈ **18.4px**，
  只差 2%，故 `ICON_SCALE` 保持 1.15，并把「0.1.6 图标是空参函数、不吃 size」这个错误说法从
  源码注释 / README / plan / 冒烟注释中全部更正（0.1.5–0.1.7 的图标都接收 `IconProps { size }`）。
  最终验证：28 项门禁 + **89 项**冒烟断言全过；真机复验两条动作行均与内置「复制」同行、
  图标渲染 18.4px、复制 path 前缀命中新候选。
