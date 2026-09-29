window.__ModuleLoader__.load({
	id: "dsh-rewind",
	factory: (require) => {
		"use strict";
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/client/index.jsx
  var index_exports = {};
  __export(index_exports, {
    __internals: () => __internals,
    apply: () => apply,
    inject: () => inject
  });
  module.exports = __toCommonJS(index_exports);
  var React = __toESM(require("react"), 1);
  var import_react_dom = require("react-dom");
  var primitives = __toESM(require("@deepseek-ai/dsh-client-ui-primitives"), 1);
  var { Button, Modal, Tooltip } = primitives;
  function isRenderableIcon(value) {
    if (typeof value === "function") return true;
    return value !== null && typeof value === "object" && typeof value.$$typeof === "symbol";
  }
  function resolveIcon(candidates) {
    for (const name of candidates) {
      const value = primitives[name];
      if (isRenderableIcon(value)) return value;
    }
    return void 0;
  }
  var FALLBACK_GLYPH_STYLE = {
    display: "inline-block",
    fontSize: "15px",
    lineHeight: 1,
    fontStyle: "normal"
  };
  function FallbackRewindIcon() {
    return React.createElement("span", { style: FALLBACK_GLYPH_STYLE, "aria-hidden": "true" }, "\u27F3");
  }
  function FallbackEditIcon() {
    return React.createElement("span", { style: FALLBACK_GLYPH_STYLE, "aria-hidden": "true" }, "\u270E");
  }
  var REWIND_ICON_CANDIDATES = ["IconRefreshOutlineRegular", "IconRefreshOutlineMedium", "IconRefreshOutline16"];
  var EDIT_ICON_CANDIDATES = ["IconEditOutlineRegular", "IconEditOutlineMedium", "IconEditOutline16"];
  var resolvedRewindIcon = resolveIcon(REWIND_ICON_CANDIDATES);
  var resolvedEditIcon = resolveIcon(EDIT_ICON_CANDIDATES);
  var iconsResolvedFromPrimitives = resolvedRewindIcon !== void 0 && resolvedEditIcon !== void 0;
  var RewindIcon = resolvedRewindIcon ?? FallbackRewindIcon;
  var EditIcon = resolvedEditIcon ?? FallbackEditIcon;
  var NS = "rewind";
  var SHADOW_PRIORITY = -1e6;
  var SHADOW_MAX_ATTEMPTS = 12;
  var SHADOW_RETRY_MS = 80;
  var DELIVER_TIMEOUT_MS = 4e3;
  var DELIVER_POLL_MS = 40;
  var inject = ["slots", "locale", "sessions", "uiWorkspace", "workspaces", "conversation"];
  var useIsoLayoutEffect = typeof React.useLayoutEffect === "function" ? React.useLayoutEffect : React.useEffect;
  var USER_KEYS = ["user", "steering"];
  var STYLE_TAG_ID = "dsh-rewind/client.css";
  var ZH = {
    "action.rewind": "\u64A4\u56DE\uFF08\u56DE\u5230\u8FD9\u6761\u6D88\u606F\u4E4B\u524D\uFF09",
    "action.edit": "\u7F16\u8F91\u540E\u81EA\u52A8\u91CD\u65B0\u53D1\u9001",
    "action.busy": "\u5904\u7406\u4E2D\u2026",
    "edit.title": "\u7F16\u8F91\u8FD9\u6761\u6D88\u606F",
    "edit.hint": "\u786E\u8BA4\u540E\u4F1A\u4ECE\u8FD9\u6761\u6D88\u606F\u4E4B\u524D\u5206\u53C9\u51FA\u65B0\u4F1A\u8BDD\uFF0C\u539F\u4F1A\u8BDD\u88AB\u5F52\u6863\uFF1B\u6539\u597D\u7684\u5185\u5BB9\u4F1A\u81EA\u52A8\u5728\u65B0\u4F1A\u8BDD\u91CC\u53D1\u9001\u3002",
    "edit.confirm": "\u5206\u53C9\u5E76\u53D1\u9001",
    "edit.cancel": "\u53D6\u6D88",
    "disabled.steering": "\u8FD9\u662F\u56DE\u5408\u4E2D\u9014\u63D2\u8BDD\uFF0C\u65E0\u6CD5\u7CBE\u786E\u56DE\u9000\u5230\u5B83\u4E4B\u524D",
    "disabled.unknownTurn": "\u65E0\u6CD5\u5B9A\u4F4D\u8FD9\u6761\u6D88\u606F\u6240\u5C5E\u7684\u56DE\u5408",
    "disabled.noBoundary": "\u8BE5\u6D88\u606F\u4E4B\u524D\u7684\u56DE\u5408\u8FB9\u754C\u8FD8\u6CA1\u52A0\u8F7D\uFF0C\u8BF7\u5148\u5411\u4E0A\u6EDA\u52A8\u52A0\u8F7D\u66F4\u65E9\u7684\u5386\u53F2",
    // 成功路径**刻意不弹任何提示**（用户要求去掉归档提醒）；只有真出问题才提示。
    "toast.deliverFailed": "\u5185\u5BB9\u6CA1\u80FD\u81EA\u52A8\u9001\u8FDB\u65B0\u4F1A\u8BDD\uFF0C\u8BF7\u5728\u65B0\u4F1A\u8BDD\u8F93\u5165\u6846\u91CC\u624B\u52A8\u53D1\u9001",
    "toast.undo": "\u64A4\u9500",
    "toast.dismiss": "\u5173\u95ED",
    "error.generic": "\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5"
  };
  var EN = {
    "action.rewind": "Rewind (back to just before this message)",
    "action.edit": "Edit and resend automatically",
    "action.busy": "Working\u2026",
    "edit.title": "Edit this message",
    "edit.hint": "Confirming forks a new session from just before this message and archives the original. The edited text is sent automatically in the new session.",
    "edit.confirm": "Fork & send",
    "edit.cancel": "Cancel",
    "disabled.steering": "Mid-turn interjection \u2014 there is no exact boundary before it",
    "disabled.unknownTurn": "This message\u2019s turn could not be resolved",
    "disabled.noBoundary": "The turn boundary before this message is not loaded yet \u2014 scroll up to load older history",
    "toast.deliverFailed": "The text could not be delivered to the new session \u2014 send it manually there",
    "toast.undo": "Undo",
    "toast.dismiss": "Dismiss",
    "error.generic": "Something went wrong, please retry"
  };
  var ROW_STYLE = {
    display: "flex",
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: 8,
    height: "calc(28px + var(--dsh-content-font-delta, 0px))"
  };
  var ACTION_STYLE = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    width: "calc(28px + var(--dsh-content-font-delta, 0px))",
    height: "calc(28px + var(--dsh-content-font-delta, 0px))",
    padding: 6,
    border: "none",
    borderRadius: "50%",
    background: "transparent",
    color: "var(--dsw-alias-label-tertiary)",
    cursor: "pointer"
  };
  var ICON_SIZE = 16;
  var ICON_SCALE = 1.15;
  var CSS = `
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
  `;
  function installStyles() {
    if (typeof document === "undefined") return;
    if (document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_TAG_ID)}]`) !== null) return;
    const tag = document.createElement("style");
    tag.dataset.plugin = "dsh-rewind";
    tag.dataset.pluginCss = STYLE_TAG_ID;
    tag.textContent = CSS;
    document.head.appendChild(tag);
  }
  var clientCtx;
  var translate = (key) => key;
  var layoutProbed = false;
  var shadowCrashLogged = false;
  var iconFallbackLogged = false;
  var portalProbeOkLogged = false;
  var portalProbeFailedLogged = false;
  var noticeState = null;
  var noticeListeners = /* @__PURE__ */ new Set();
  function publishNotice(next) {
    noticeState = next;
    for (const listener of noticeListeners) listener();
  }
  function subscribeNotice(listener) {
    noticeListeners.add(listener);
    return () => noticeListeners.delete(listener);
  }
  function turnOf(node) {
    const location = node === void 0 || node === null ? void 0 : node.location;
    if (location === void 0 || location === null) return void 0;
    if (location.kind === "turn" || location.kind === "step") {
      const turn = location.turn;
      if (turn !== void 0 && turn !== null && typeof turn.turn === "number") return turn.turn;
    }
    return void 0;
  }
  function plainTextOf(content) {
    if (!Array.isArray(content)) return "";
    const parts = [];
    for (const block of content) {
      if (block !== null && typeof block === "object" && block.type === "text" && typeof block.text === "string") {
        parts.push(block.text);
      }
    }
    return parts.join("\n");
  }
  function messageOf(error) {
    if (error === void 0 || error === null) return translate("error.generic");
    if (typeof error === "string" && error !== "") return error;
    if (typeof error.message === "string" && error.message !== "") return error.message;
    return translate("error.generic");
  }
  function reportProblem(message, detail) {
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      console.warn(`[dsh-rewind] ${message}`, detail);
    }
  }
  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }
  function probeLayout(rowElement) {
    if (layoutProbed) return;
    if (typeof document === "undefined" || typeof getComputedStyle !== "function") return;
    if (rowElement === void 0 || rowElement === null) return;
    layoutProbed = true;
    let display;
    try {
      display = getComputedStyle(rowElement).display;
    } catch {
      return;
    }
    const styleTag = document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_TAG_ID)}]`);
    if (display !== "flex") {
      reportProblem("\u52A8\u4F5C\u884C\u5E03\u5C40\u5F02\u5E38\uFF08\u5185\u8054 display:flex \u672A\u751F\u6548\uFF09", { display });
      return;
    }
    if (styleTag === null) {
      reportProblem("\u6837\u5F0F\u8868\u672A\u6CE8\u5165\uFF08\u88C5\u9970\u6837\u5F0F\u7F3A\u5931\uFF0C\u5173\u952E\u5E03\u5C40\u5DF2\u5185\u8054\uFF09", { display });
      return;
    }
    if (typeof console !== "undefined" && typeof console.info === "function") {
      console.info("[dsh-rewind] \u52A8\u4F5C\u884C\u5DF2\u5C31\u7EEA", { display });
    }
  }
  function directChildOf(node, ancestor) {
    let current = node;
    while (current !== null && current !== void 0) {
      if (current.parentElement === ancestor) return current;
      current = current.parentElement;
    }
    return void 0;
  }
  var OUR_ANCHOR_ATTR = "data-dsh-rewind-anchor";
  var OUR_ROW_ATTR = "data-dsh-rewind-row";
  var COPY_ICON_PATH_PREFIXES = ["M11.9792", "M6.14929 4.02032"];
  function hasAttribute(element, name) {
    return element !== void 0 && element !== null && typeof element.hasAttribute === "function" && element.hasAttribute(name);
  }
  function isOurNode(element) {
    return hasAttribute(element, OUR_ANCHOR_ATTR) || hasAttribute(element, OUR_ROW_ATTR);
  }
  function firstOwnChild(parent) {
    const children = parent === void 0 || parent === null ? void 0 : parent.children;
    if (children === void 0 || children === null) return void 0;
    for (const child of children) if (!isOurNode(child)) return child;
    return void 0;
  }
  function layoutOf(element) {
    if (element === void 0 || element === null) return null;
    if (typeof getComputedStyle !== "function") return null;
    try {
      const style = getComputedStyle(element);
      if (style === void 0 || style === null) return null;
      return { display: style.display, flexDirection: style.flexDirection };
    } catch {
      return null;
    }
  }
  function isHorizontalRow(element) {
    if (element === void 0 || element === null) return false;
    const layout = layoutOf(element);
    if (layout === null) return true;
    if (layout.display === "contents") return false;
    if (layout.display !== "flex" && layout.display !== "inline-flex") return false;
    return layout.flexDirection === "row";
  }
  var SLOT_OUTLET_SELECTOR = ':scope > div[data-slot="conversation.chat.node"]';
  function outletOf(flowItem) {
    if (flowItem === void 0 || flowItem === null) return void 0;
    if (typeof flowItem.querySelector === "function") {
      try {
        const direct = flowItem.querySelector(SLOT_OUTLET_SELECTOR);
        if (direct !== void 0 && direct !== null) return direct;
      } catch {
      }
    }
    const first = firstOwnChild(flowItem);
    return hasAttribute(first, "data-slot") ? first : void 0;
  }
  function builtinRootOf(flowItem) {
    if (flowItem === void 0 || flowItem === null) return void 0;
    const outlet = outletOf(flowItem);
    let current = firstOwnChild(outlet === void 0 ? flowItem : outlet);
    for (let depth = 0; depth < 4; depth += 1) {
      if (current === void 0) return void 0;
      if (!hasAttribute(current, "data-slot")) break;
      const next = firstOwnChild(current);
      if (next === void 0) break;
      current = next;
    }
    return current;
  }
  function actionsRowByStructure(builtinRoot) {
    const children = builtinRoot === void 0 || builtinRoot === null ? void 0 : builtinRoot.children;
    if (children === void 0 || children === null) return void 0;
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (isOurNode(child)) continue;
      if (typeof child.querySelector !== "function") continue;
      if (child.querySelector("button") === null) continue;
      return child;
    }
    return void 0;
  }
  function isPortalTargetOk(row) {
    if (row === void 0 || row === null) return false;
    if (isOurNode(row)) return false;
    return isHorizontalRow(row);
  }
  function actionsRowByCopyButton(flowItem, builtinRoot, t) {
    const button = findCopyButton(flowItem, builtinRoot, t);
    if (button === void 0) return void 0;
    const parent = button.parentElement;
    return parent === void 0 || parent === null ? void 0 : parent;
  }
  function escapeAttr(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }
  function findCopyButton(flowItem, builtinRoot, t) {
    const buttons = copyIconButtons(flowItem);
    for (const button of buttons) {
      const parent = button.parentElement;
      if (parent !== void 0 && parent !== null && parent.parentElement === builtinRoot) return button;
    }
    for (const button of buttons) if (isHorizontalRow(button.parentElement)) return button;
    if (typeof t === "function" && flowItem !== void 0 && flowItem !== null && typeof flowItem.querySelector === "function") {
      for (const key of ["copy", "copied"]) {
        const label = safeLabel(t, key);
        if (label === void 0) continue;
        let found;
        try {
          found = flowItem.querySelector(`button[aria-label="${escapeAttr(label)}"]`);
        } catch {
          found = void 0;
        }
        if (found !== void 0 && found !== null) return found;
      }
    }
    return buttons.length > 0 ? buttons[0] : void 0;
  }
  function copyIconButtons(flowItem) {
    if (flowItem === void 0 || flowItem === null || typeof flowItem.querySelectorAll !== "function") return [];
    let paths = [];
    try {
      paths = [...flowItem.querySelectorAll("svg > path")];
    } catch {
      paths = [];
    }
    const buttons = [];
    for (const path of paths) {
      const d = typeof path.getAttribute === "function" ? path.getAttribute("d") : void 0;
      if (typeof d !== "string") continue;
      if (!COPY_ICON_PATH_PREFIXES.some((prefix) => d.startsWith(prefix))) continue;
      const button = typeof path.closest === "function" ? path.closest("button") : void 0;
      if (button !== void 0 && button !== null) buttons.push(button);
    }
    return buttons;
  }
  function safeLabel(t, key) {
    if (typeof t !== "function") return void 0;
    try {
      const value = t(key);
      return typeof value === "string" && value !== "" ? value : void 0;
    } catch {
      return void 0;
    }
  }
  function locateActionsRow(flowItem, t) {
    const builtinRoot = builtinRootOf(flowItem);
    const structural = actionsRowByStructure(builtinRoot);
    if (isPortalTargetOk(structural)) return { row: structural, via: "structure" };
    const byButton = actionsRowByCopyButton(flowItem, builtinRoot, t);
    if (isPortalTargetOk(byButton)) return { row: byButton, via: "copy-button" };
    return void 0;
  }
  function describeLocateFailure(flowItem, t) {
    const detail = {
      createPortal: typeof import_react_dom.createPortal,
      getComputedStyle: typeof getComputedStyle,
      flowItemFound: flowItem !== void 0 && flowItem !== null
    };
    if (!detail.flowItemFound) return detail;
    detail.flowKind = typeof flowItem.getAttribute === "function" ? flowItem.getAttribute("data-chat-flow-kind") : null;
    const first = flowItem.firstElementChild;
    detail.firstChildTag = first === void 0 || first === null ? null : first.tagName;
    detail.firstChildIsSlotWrap = hasAttribute(first, "data-slot");
    detail.flowItemChildCount = flowItem.children === void 0 ? null : flowItem.children.length;
    const builtinRoot = builtinRootOf(flowItem);
    detail.builtinRootTag = builtinRoot === void 0 ? null : builtinRoot.tagName;
    detail.builtinRootChildCount = builtinRoot === void 0 || builtinRoot.children === void 0 ? null : builtinRoot.children.length;
    const describe = (element) => ({
      tag: element.tagName,
      cls: typeof element.className === "string" ? element.className : null,
      ours: isOurNode(element),
      hasButton: typeof element.querySelector === "function" ? element.querySelector("button") !== null : null,
      horizontal: isHorizontalRow(element),
      ...layoutOf(element)
    });
    detail.builtinRootChildren = builtinRoot === void 0 || builtinRoot.children === void 0 ? [] : [...builtinRoot.children].slice(0, 6).map(describe);
    const button = findCopyButton(flowItem, builtinRoot, t);
    detail.copyButtonFound = button !== void 0;
    if (button !== void 0) {
      const parent = button.parentElement;
      detail.copyButtonParentTag = parent === void 0 || parent === null ? null : parent.tagName;
      detail.copyButtonParentHorizontal = isHorizontalRow(parent);
      detail.copyButtonParentIsBuiltinChild = parent !== void 0 && parent !== null && parent.parentElement === builtinRoot;
    }
    detail.copyLabel = safeLabel(t, "copy") ?? null;
    detail.copiedLabel = safeLabel(t, "copied") ?? null;
    const labels = [];
    try {
      for (const candidate of flowItem.querySelectorAll("button")) {
        const label = candidate.getAttribute("aria-label");
        if (label !== null && label !== "") labels.push(label);
      }
    } catch {
    }
    detail.buttonLabels = labels;
    return detail;
  }
  function originalRendererFor(kind) {
    if (clientCtx === void 0) return void 0;
    let entries;
    try {
      entries = clientCtx.slots.entries("conversation.chat.node");
    } catch {
      return void 0;
    }
    if (!Array.isArray(entries)) return void 0;
    for (const entry of entries) {
      if (entry === void 0 || entry === null) continue;
      const options = entry.options;
      if (options === void 0 || options === null || options.key !== kind) continue;
      if (entry.registrant === "dsh-rewind") continue;
      const component = entry.component;
      if (component === void 0 || component === null) continue;
      if (component === MessageActions || component === MessageActionsInner) continue;
      return component;
    }
    return void 0;
  }
  function winnerComponentFor(kind) {
    if (clientCtx === void 0) return void 0;
    const slots = clientCtx.slots;
    if (slots === void 0 || slots === null) return void 0;
    let entries;
    try {
      entries = typeof slots.entriesOfSlot === "function" ? slots.entriesOfSlot("conversation.chat.node") : slots.entries("conversation.chat.node");
    } catch {
      return void 0;
    }
    if (!Array.isArray(entries)) return void 0;
    let winner;
    let best = Number.POSITIVE_INFINITY;
    for (const entry of entries) {
      if (entry === void 0 || entry === null) continue;
      const options = entry.options;
      if (options === void 0 || options === null || options.key !== kind) continue;
      const priority = typeof options.priority === "number" ? options.priority : 0;
      if (priority < best) {
        best = priority;
        winner = entry.component;
      }
    }
    return winner;
  }
  function registerShadow(ctx, key, component) {
    let dispose = null;
    let stopped = false;
    let attempts = 0;
    let timer = null;
    const register = () => {
      dispose = ctx.slots.register(
        {
          name: "conversation.chat.node",
          key,
          priority: SHADOW_PRIORITY,
          locale: "chat",
          registrant: "dsh-rewind"
        },
        component
      );
    };
    const probe = () => {
      timer = null;
      if (stopped) return;
      attempts += 1;
      if (winnerComponentFor(key) === component) return;
      if (attempts >= SHADOW_MAX_ATTEMPTS) return;
      try {
        if (dispose !== null) dispose();
        register();
      } catch (error) {
        try {
          register();
        } catch {
        }
        reportProblem(`\u5F71\u5B50\u81EA\u6108\u5931\u8D25\uFF08key=${key}\uFF09`, error);
        return;
      }
      timer = window.setTimeout(probe, SHADOW_RETRY_MS);
    };
    try {
      register();
    } catch (error) {
      reportProblem(`\u69FD\u4F4D\u6CE8\u518C\u5931\u8D25\uFF08key=${key}\uFF09`, error);
      return () => {
      };
    }
    timer = window.setTimeout(probe, SHADOW_RETRY_MS);
    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
      try {
        if (dispose !== null) dispose();
      } catch {
      }
      dispose = null;
    };
  }
  function workspaceIdOf(sessionId) {
    try {
      const snapshot = clientCtx.workspaces.list.getSnapshot();
      const items = snapshot === void 0 || snapshot === null ? void 0 : snapshot.items;
      if (!Array.isArray(items)) return void 0;
      for (const view of items) {
        if (view === void 0 || view === null) continue;
        const ids = view.sessionIds;
        if (Array.isArray(ids) && ids.indexOf(sessionId) !== -1 && typeof view.workspaceId === "string") {
          return view.workspaceId;
        }
      }
    } catch {
      return void 0;
    }
    return void 0;
  }
  async function createBlankSession(sessionId) {
    const sessions = clientCtx.sessions;
    const workspaceId = workspaceIdOf(sessionId);
    if (workspaceId !== void 0) return sessions.create({ workspaceId });
    let cwd;
    try {
      const list = sessions.list.getSnapshot();
      const summary = list === void 0 || list === null ? void 0 : list.byId[sessionId];
      cwd = summary === void 0 || summary === null ? void 0 : summary.cwd;
    } catch {
      cwd = void 0;
    }
    if (cwd !== void 0) return sessions.create({ cwd });
    return sessions.create({});
  }
  async function waitForBinding(sessionId, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    for (; ; ) {
      let binding;
      try {
        binding = clientCtx.sessions.binding(sessionId);
      } catch {
        binding = void 0;
      }
      if (binding !== void 0 && binding !== null && binding.ctx !== void 0 && binding.ctx !== null) {
        return binding;
      }
      if (Date.now() >= deadline) return void 0;
      await sleep(DELIVER_POLL_MS);
    }
  }
  async function deliverToChild(sessionId, text, autoSend) {
    const binding = await waitForBinding(sessionId, DELIVER_TIMEOUT_MS);
    if (binding === void 0) throw new Error("\u65B0\u4F1A\u8BDD\u7684\u8F93\u5165\u4F5C\u7528\u57DF\u8FDF\u8FDF\u6CA1\u5C31\u7EEA");
    const input = clientCtx.conversation.input.for(binding.ctx);
    const deadline = Date.now() + DELIVER_TIMEOUT_MS;
    let applied = false;
    for (; ; ) {
      try {
        input.setDraft(text);
      } catch (error) {
        reportProblem("setDraft \u5931\u8D25", error);
      }
      const snapshot = input.state.getSnapshot();
      applied = snapshot !== void 0 && snapshot !== null && snapshot.draft === text;
      if (applied || Date.now() >= deadline) break;
      await sleep(DELIVER_POLL_MS);
    }
    if (!applied) throw new Error("\u8349\u7A3F\u6CA1\u80FD\u5199\u8FDB\u65B0\u4F1A\u8BDD\u8F93\u5165\u6846");
    if (!autoSend) return;
    input.submit();
    const settleBy = Date.now() + DELIVER_TIMEOUT_MS;
    for (; ; ) {
      const snapshot = input.state.getSnapshot();
      if (snapshot === void 0 || snapshot === null || snapshot.draft !== text) return;
      if (Date.now() >= settleBy) break;
      await sleep(DELIVER_POLL_MS);
    }
    throw new Error("\u53D1\u9001\u6CA1\u88AB\u63A5\u53D7\uFF0C\u5185\u5BB9\u4ECD\u5728\u8F93\u5165\u6846\u91CC\uFF0C\u8BF7\u6309\u56DE\u8F66");
  }
  async function cutAndSwitch(options) {
    const { sessionId, atSeq, draftText, autoSend } = options;
    const workspace = clientCtx.uiWorkspace;
    const isEdit = typeof draftText === "string";
    const childId = typeof atSeq === "number" ? (
      // **不要传 increaseTitle**：它会在继承来的标题后面加序号（"xxx (1)"），
      // 而且每撤回/编辑一次就再涨一位（"xxx (2)"、"xxx (3)"…），
      // 用户实测后明确要求标题保持不变，所以这里只传 fork 的最小参数。
      await clientCtx.sessions.fork({ sessionId, atSeq })
    ) : await createBlankSession(sessionId);
    workspace.openSession(childId);
    let archived = false;
    try {
      await workspace.archiveSession(sessionId);
      archived = true;
    } catch {
      archived = false;
    }
    if (isEdit) {
      try {
        await deliverToChild(childId, draftText, autoSend === true);
      } catch (error) {
        reportProblem("\u6539\u5199\u5185\u5BB9\u6CA1\u80FD\u81EA\u52A8\u9001\u8FDB\u65B0\u4F1A\u8BDD", error);
        publishNotice({
          text: `${translate("toast.deliverFailed")}\uFF08${messageOf(error)}\uFF09`,
          originalId: sessionId,
          canUndo: archived
        });
      }
    }
    return childId;
  }
  async function undoLastChange() {
    const state = noticeState;
    if (state === null) return;
    publishNotice(null);
    try {
      await clientCtx.uiWorkspace.unarchiveSession(state.originalId);
    } catch {
    }
    clientCtx.uiWorkspace.openSession(state.originalId);
  }
  var SHADOW_MAX_RETRIES = 3;
  var ShadowBoundary = class extends React.Component {
    constructor(props) {
      super(props);
      this.state = { failed: false, fatal: false };
      this.retries = 0;
      this.crashedOnce = false;
    }
    static getDerivedStateFromError() {
      return { failed: true };
    }
    componentDidCatch(error) {
      if (this.crashedOnce && !this.state.fatal) this.setState({ fatal: true });
      this.crashedOnce = true;
      if (shadowCrashLogged) return;
      shadowCrashLogged = true;
      reportProblem("\u6309\u94AE\u6E32\u67D3\u5931\u8D25\uFF0C\u5DF2\u9000\u56DE\u53EA\u663E\u793A\u5185\u7F6E\u6D88\u606F\uFF08\u64A4\u56DE/\u7F16\u8F91\u6682\u4E0D\u53EF\u7528\uFF09", error);
    }
    componentDidUpdate(prevProps) {
      if (!this.state.failed || this.state.fatal) return;
      if (this.retries >= SHADOW_MAX_RETRIES) return;
      if (prevProps.nodeKey === this.props.nodeKey) return;
      this.retries += 1;
      this.setState({ failed: false });
    }
    render() {
      if (this.state.fatal) return null;
      if (!this.state.failed) return this.props.children;
      const Original = originalRendererFor(this.props.nodeKind);
      return Original === void 0 ? null : React.createElement(Original, this.props.originalProps);
    }
  };
  function MessageActions(props) {
    const node = props.node;
    const kind = node === void 0 || node === null ? void 0 : node.kind;
    const nodeKey = node === void 0 || node === null ? void 0 : node.key;
    if (typeof props.useChat !== "function") {
      const Original = originalRendererFor(kind);
      return Original === void 0 ? null : React.createElement(Original, props);
    }
    return React.createElement(
      ShadowBoundary,
      { nodeKind: kind, nodeKey, originalProps: props },
      React.createElement(MessageActionsInner, props)
    );
  }
  function MessageActionsInner(props) {
    const { node, sessionId, useChat } = props;
    const kind = node === void 0 ? void 0 : node.kind;
    const isSteering = kind === "steering";
    const data = node === void 0 ? void 0 : node.data;
    const content = data === void 0 ? void 0 : data.content;
    const messageText = React.useMemo(() => plainTextOf(content), [content]);
    const turn = turnOf(node);
    const cutAnchor = useChat((chat) => {
      if (isSteering || turn === void 0 || turn <= 1) return void 0;
      const legacy = chat === void 0 || chat === null ? void 0 : chat.legacy;
      const ends = legacy === void 0 || legacy === null ? void 0 : legacy.turnEnds;
      if (ends === void 0 || ends === null || typeof ends.get !== "function") return void 0;
      const hit = ends.get(turn - 1);
      return typeof hit === "number" ? hit : void 0;
    });
    const isFirstTurn = turn === 1;
    const rewindBlocked = isSteering ? "disabled.steering" : turn === void 0 ? "disabled.unknownTurn" : cutAnchor === void 0 ? "disabled.noBoundary" : null;
    const editBlocked = isSteering ? "disabled.steering" : turn === void 0 ? "disabled.unknownTurn" : isFirstTurn || cutAnchor !== void 0 ? null : "disabled.noBoundary";
    const [busy, setBusy] = React.useState(false);
    const [editing, setEditing] = React.useState(false);
    const [draftText, setDraftText] = React.useState("");
    const [failure, setFailure] = React.useState(null);
    const Original = originalRendererFor(kind);
    const anchorRef = React.useRef(null);
    const portalHostRef = React.useRef(null);
    const [portalHost, setPortalHost] = React.useState(null);
    useIsoLayoutEffect(() => {
      let cancelled = false;
      let attempts = 0;
      let retryTimer = null;
      const locate = () => {
        if (cancelled) return;
        const anchor = anchorRef.current;
        const flowItem = anchor !== null && anchor !== void 0 && typeof anchor.closest === "function" ? anchor.closest("[data-chat-flow-kind]") : void 0;
        const found = locateActionsRow(flowItem, props.t);
        if (found === void 0) {
          if (attempts < 10) {
            attempts += 1;
            retryTimer = window.setTimeout(locate, 60);
            return;
          }
          if (!portalProbeFailedLogged) {
            portalProbeFailedLogged = true;
            reportProblem("\u6CA1\u80FD\u5B9A\u4F4D\u5185\u7F6E\u52A8\u4F5C\u884C\uFF0C\u6309\u94AE\u9000\u5316\u4E3A\u72EC\u7ACB\u4E00\u884C", describeLocateFailure(flowItem, props.t));
          }
          return;
        }
        if (!portalProbeOkLogged) {
          portalProbeOkLogged = true;
          if (typeof console !== "undefined" && typeof console.info === "function") {
            console.info("[dsh-rewind] \u6309\u94AE\u5DF2\u5E76\u8FDB\u5185\u7F6E\u52A8\u4F5C\u884C", { via: found.via });
          }
        }
        portalHostRef.current = found.row;
        setPortalHost((current) => current === found.row ? current : found.row);
      };
      locate();
      const guard = window.setInterval(() => {
        if (cancelled) return;
        const host = portalHostRef.current;
        if (host === null) return;
        if (host.isConnected === false) {
          portalHostRef.current = null;
          setPortalHost(null);
          attempts = 0;
          locate();
        }
      }, 1e3);
      return () => {
        cancelled = true;
        if (retryTimer !== null) window.clearTimeout(retryTimer);
        window.clearInterval(guard);
      };
    }, [props.t]);
    const runRewind = React.useCallback(() => {
      if (busy || rewindBlocked !== null) return;
      setBusy(true);
      setFailure(null);
      cutAndSwitch({ sessionId, atSeq: cutAnchor, draftText: null, autoSend: false }).catch((error) => setFailure(messageOf(error))).finally(() => setBusy(false));
    }, [busy, cutAnchor, rewindBlocked, sessionId]);
    const openEditor = React.useCallback(() => {
      if (busy || editBlocked !== null) return;
      setDraftText(messageText);
      setFailure(null);
      setEditing(true);
    }, [busy, editBlocked, messageText]);
    const closeEditor = React.useCallback(() => {
      setEditing(false);
      setFailure(null);
    }, []);
    const confirmEdit = React.useCallback(() => {
      if (busy || editBlocked !== null) return;
      setBusy(true);
      setFailure(null);
      cutAndSwitch({
        sessionId,
        atSeq: isFirstTurn ? void 0 : cutAnchor,
        draftText,
        autoSend: true
      }).then(() => setEditing(false)).catch((error) => setFailure(messageOf(error))).finally(() => setBusy(false));
    }, [busy, cutAnchor, draftText, editBlocked, isFirstTurn, sessionId]);
    const rewindLabel = rewindBlocked === null ? translate("action.rewind") : translate(rewindBlocked);
    const editLabel = editBlocked === null ? translate("action.edit") : translate(editBlocked);
    const actionButton = (label, blocked, onClick, icon) => {
      const unavailable = blocked !== null || busy;
      const style = unavailable ? { ...ACTION_STYLE, cursor: "default", opacity: 0.4 } : ACTION_STYLE;
      return React.createElement(
        Tooltip,
        { label, side: "bottom" },
        React.createElement(
          "button",
          {
            type: "button",
            className: "dsh-rewind-action",
            style,
            "aria-label": label,
            "aria-disabled": unavailable ? true : void 0,
            "data-unavailable": unavailable ? true : void 0,
            "data-dsh-rewind-action": "",
            onClick: unavailable ? void 0 : onClick,
            onMouseEnter: unavailable ? void 0 : (event) => {
              event.currentTarget.style.background = "var(--dsw-alias-interactive-bg-hover)";
              event.currentTarget.style.color = "var(--dsw-alias-label-secondary)";
            },
            onMouseLeave: unavailable ? void 0 : (event) => {
              event.currentTarget.style.background = "transparent";
              event.currentTarget.style.color = "var(--dsw-alias-label-tertiary)";
            }
          },
          // 图标盒子尺寸由 ICON_SIZE 决定，视觉重量再靠外层内联 transform 拉齐（ICON_SCALE 是唯一旋钮）。
          // 视觉重量再靠外层内联 transform 拉齐（ICON_SCALE 是唯一旋钮）。
          React.createElement("span", {
            style: {
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              transform: `scale(${ICON_SCALE})`
            }
          }, React.createElement(icon, { size: ICON_SIZE }))
        )
      );
    };
    const row = React.createElement(
      "div",
      {
        className: "dsh-rewind-row",
        style: ROW_STYLE,
        "data-dsh-rewind-row": "",
        ref: (element) => probeLayout(element)
      },
      // 首条消息不提供「撤回」：撤回首条等于清空并归档对话，没有意义。
      isFirstTurn && !isSteering ? null : actionButton(rewindLabel, rewindBlocked, runRewind, RewindIcon),
      actionButton(editLabel, editBlocked, openEditor, EditIcon),
      failure === null ? null : React.createElement("span", { className: "dsh-rewind-error", role: "status" }, failure)
    );
    const modal = editing ? React.createElement(
      Modal,
      {
        open: true,
        title: translate("edit.title"),
        closeLabel: translate("edit.cancel"),
        onClose: busy ? () => {
        } : closeEditor,
        footer: React.createElement(Button, {
          variant: "primary",
          disabled: busy || draftText.trim() === "",
          onClick: confirmEdit
        }, busy ? translate("action.busy") : translate("edit.confirm"))
      },
      React.createElement("textarea", {
        className: "dsh-rewind-textarea",
        "aria-label": translate("edit.title"),
        value: draftText,
        readOnly: busy,
        onChange: (event) => setDraftText(event.target.value)
      }),
      React.createElement("p", { className: "dsh-rewind-hint" }, translate("edit.hint"))
    ) : null;
    const targetLive = portalHost !== null && portalHost.isConnected !== false;
    return React.createElement(
      React.Fragment,
      null,
      Original === void 0 ? null : React.createElement(Original, props),
      // 隐藏锚点：始终留在消息容器里，用来定位内置动作行（portal 之后也还能重新定位）。
      React.createElement("span", { ref: anchorRef, hidden: true, "data-dsh-rewind-anchor": "" }),
      targetLive ? (0, import_react_dom.createPortal)(row, portalHost) : row,
      modal
    );
  }
  function ChangeNotice() {
    const [state, setState] = React.useState(null);
    React.useEffect(() => {
      setState(noticeState);
      return subscribeNotice(() => setState(noticeState));
    }, []);
    React.useEffect(() => {
      if (state === null) return void 0;
      const timer = window.setTimeout(() => publishNotice(null), 15e3);
      return () => window.clearTimeout(timer);
    }, [state]);
    if (state === null) return null;
    return React.createElement(
      "div",
      { className: "dsh-rewind-toastWrap" },
      React.createElement(
        "div",
        { className: "dsh-rewind-toast", role: "status" },
        React.createElement("span", null, state.text),
        state.canUndo ? React.createElement("button", {
          type: "button",
          className: "dsh-rewind-toastAction",
          onClick: () => {
            undoLastChange().catch(() => publishNotice(null));
          }
        }, translate("toast.undo")) : null,
        React.createElement("button", {
          type: "button",
          className: "dsh-rewind-toastClose",
          "aria-label": translate("toast.dismiss"),
          onClick: () => publishNotice(null)
        }, "\u2715")
      )
    );
  }
  function apply(ctx) {
    clientCtx = ctx;
    installStyles();
    if (typeof import_react_dom.createPortal !== "function") {
      reportProblem("react-dom \u7684 createPortal \u4E0D\u53EF\u7528\uFF0C\u6309\u94AE\u53EA\u80FD\u7559\u5728\u81EA\u5DF1\u4E00\u884C", { typeofCreatePortal: typeof import_react_dom.createPortal });
    }
    if (!iconsResolvedFromPrimitives && !iconFallbackLogged) {
      iconFallbackLogged = true;
      reportProblem("primitives \u6CA1\u6709\u53EF\u7528\u7684 \u27F3 / \u270E \u56FE\u6807\u5BFC\u51FA\uFF0C\u6309\u94AE\u5DF2\u6539\u7528\u6587\u5B57\u7B26\u53F7", {
        triedRewind: REWIND_ICON_CANDIDATES,
        triedEdit: EDIT_ICON_CANDIDATES
      });
    }
    ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), "dsh-rewind: \u5B57\u5178 zh/en");
    translate = ctx.locale.bind(NS);
    for (const key of USER_KEYS) {
      ctx.slots.inject("conversation.chat.node", () => registerShadow(ctx, key, MessageActions));
    }
    ctx.slots.inject(
      "shell.overlay",
      () => ctx.slots.register(
        { name: "shell.overlay", id: "rewind-notice", order: 40, locale: NS, registrant: "dsh-rewind" },
        ChangeNotice
      )
    );
    ctx.effect(() => () => publishNotice(null), "dsh-rewind: \u6E05\u7406\u63D0\u793A\u72B6\u6001");
  }
  var __internals = {
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
    EditIcon
  };

		// esbuild 的 CJS 产物会把 module.exports 换成 __toCommonJS 的新对象；
		// 无论哪种情况，返回的对象都要带上 Module 标记（官方 bundle 同款约定）。
		var out = module.exports;
		if (out !== exports) Object.defineProperty(out, Symbol.toStringTag, { value: "Module" });
		return out;
	}
});
