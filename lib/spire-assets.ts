// 爬塔素材槽位（C 端**消费端**）
//
// 槽位 key 与 B 端 notelab-b/src/lib/spire-assets.ts 的 ASSET_SLOTS **一一对应**，
// 是跨端契约：key 改名 = C 端静默失配 → 回落内置默认，表现为"后台配了但没生效"。
// 加槽位的顺序是「先在 B 端注册表加一行 → 再来这里加对应的消费点」。
//
// 取值语义（fail-open）：已配置且非空 → 用它；未配置 / 空串 → 回落内置默认。
// 这一层刻意不做任何合法性判断（路径是否存在由后端 catalog 接口保证候选来自真实文件），
// 图片加载失败由调用方的 onError / 浏览器自带兜底处理。

import { NODE_META, type NodeType } from "./spire-engine"

export type SpireAssetMap = Record<string, string>

/** 当前生效的素材槽位表（模块级：页面加载已发布配置时整体替换） */
let assets: SpireAssetMap = {}

/** 由 app/spire/page.tsx 在 loadSpireContent 之后注入；传 undefined/空对象 = 全部走内置默认 */
export function setSpireAssets(m: SpireAssetMap | undefined | null) {
  assets = m && typeof m === "object" ? { ...m } : {}
}

/** 当前槽位表快照（调试/测试用，勿改返回值） */
export const currentSpireAssets = (): SpireAssetMap => assets

/** 槽位取值：已配置 → 用它；否则回落 fallback（默认空串 = 无素材） */
export function spireAssetUrl(key: string, fallback = ""): string {
  const v = assets[key]
  return typeof v === "string" && v.trim() ? v.trim() : fallback
}

/**
 * 节点类型 → 素材槽位 key（与 B 端 node.* 对齐）。
 * 注意 event 的**内置默认是"无整图"**（走自绘圆盘兜底）：若让它默认指向 node.random 那张图，
 * 玩家就分不清"进去触发事件"与"进去才知道是什么"。所以它的 fallback 只能来自已发布配置。
 */
const NODE_SLOT: Record<NodeType, string> = {
  enemy: "node.enemy",
  elite: "node.elite",
  boss: "node.boss",
  rest: "node.rest",
  shop: "node.shop",
  random: "node.random",
  event: "node.event",
}

/**
 * 节点形象取值：已发布配置优先，否则用引擎里的内置常量（NODE_META[t].art）。
 * 内置常量是**唯一默认来源**，这里不再抄一份路径，避免两处漂移。
 */
export function artForNodeType(t: NodeType): string | null {
  const v = assets[NODE_SLOT[t]]
  if (typeof v === "string" && v.trim()) return v.trim()
  return NODE_META[t].art
}

/** 连线槽位（fallback 由 SpireMap 传入，因为那里才有 LINK_ART 常量与尺寸约定） */
export const LINK_SLOT = "link.straight"
/** 盘面背景槽位（铺在幕主题渐变之上） */
export const BG_MAP_SLOT = "bg.spire.map"
/** 爬塔入口 / 选角页背景槽位 */
export const BG_HOME_SLOT = "bg.spire.home"

/** 角色立绘槽位：`char.<角色 id>`（id 与引擎 CHARACTERS 的 id 一致，现已按 BASE_CHARACTERS 开好 4 个） */
export const charArtUrl = (id: string): string => spireAssetUrl(`char.${id}`)

/**
 * 把一张背景图叠到既有的 CSS background 上：三层从下到上 = 幕主题渐变 → 图片 → 暗色压暗层。
 * 压暗层是**必须的**：任意用户图都可能比幕主题底色亮，节点圆盘/连线是深色系，
 * 不压暗就会出现「节点糊在背景里」。压暗层用近黑半透明，不改变色相。
 * 未配置时返回 null，调用方保持原来的单层渐变写法（视觉零变化）。
 */
export function withBgImage(themeGradient: string, imageUrl: string): {
  backgroundImage: string
  backgroundSize: string
  backgroundPosition: string
  backgroundRepeat: string
} | null {
  if (!imageUrl) return null
  return {
    backgroundImage: [
      "linear-gradient(180deg, rgba(6,7,12,.52) 0%, rgba(6,7,12,.66) 100%)",
      `url("${imageUrl}")`,
      themeGradient,
    ].join(", "),
    backgroundSize: "auto, cover, auto",
    backgroundPosition: "center, center, center",
    backgroundRepeat: "no-repeat, no-repeat, no-repeat",
  }
}
