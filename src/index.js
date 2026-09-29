/**
 * dsh-rewind 宿主半（Node half）。
 *
 * 本插件是**纯浏览器 UI 插件**：撤回/编辑的全部逻辑都在 `exports["./client"]`
 * （lib/client.js）里，宿主侧没有任何路由、服务或工具需要注册。这个空的 apply()
 * 只是让插件出现在 cordis 配置树 / 插件清单中，从而让 dsh web 把 client bundle
 * 下发给浏览器。参照 @deepseek-ai/dsh-client-ui-message-feedback 的同名做法。
 *
 * @module dsh-rewind
 */

/** 宿主插件体——本插件无宿主侧行为。 */
export function apply() {}
