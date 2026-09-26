// 爬塔尖塔：C 端只读加载**已发布**的自定义卡/角色 + 角色授权白名单 + 素材槽位 + 地图方案
// （匿名接口，后端 /api/c/spire/content）
//
// 四个切片全部 fail-open：
//   cards/characters 无 → 用引擎内置
//   charAccess 无该组键 → 不筛选角色
//   assets 无 / 某槽位无 → 该素材走内置默认
//   maps 无 / 某幕无 / 该幕结构非法 → 该幕回落本地生成（见 lib/spire-maps.ts）
//
// 净化口径必须与 B 端 notelab-b/src/lib/spire-content.ts **完全一致**（空值丢弃而非存空串），
// 否则同一个对象在两端往返后形态不同，会误判"有未保存改动"。
import { apiJson } from "./api"

export type SpireAssetMap = Record<string, string>

export interface SpireCustomContent {
  cards: any[]
  characters: any[]
  skills: any[]
  /**
   * 角色授权：{C 端用户组码: [该组可选择的角色 id...]}。
   * 缺失、或玩家所属组没有对应键 → 不做筛选（fail-open，全部角色可选）。
   */
  charAccess?: Record<string, string[]>
  /** 素材资源槽位取值：{槽位 key: 素材路径}（路径已带 C 端 basePath 前缀 /games） */
  assets?: SpireAssetMap
  /** 已发布的地图方案文档（含整套多幕节点配置） */
  maps?: { defaultId?: string; packs?: any[] }
}

/** 净化后端返回的 charAccess：只保留 {字符串键: 字符串数组} 形态，异常数据一律当"未配置" */
function cleanCharAccess(raw: any): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out
  for (const [k, v] of Object.entries(raw)) {
    if (!k) continue
    out[k] = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x) : []
  }
  return out
}

/** 净化素材槽位表：只保留 {非空字符串键: 非空字符串值}，空值丢弃 = 回落内置默认 */
function cleanAssets(raw: any): SpireAssetMap {
  const out: SpireAssetMap = {}
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out
  for (const [k, v] of Object.entries(raw)) {
    if (!k) continue
    if (typeof v === "string" && v.trim()) out[k] = v.trim()
  }
  return out
}

/**
 * 净化地图文档：只做"外壳"层面的收敛（packs 是数组、每项是对象）。
 * **不做节点级校验** —— 那一层归 lib/spire-maps.ts 的 toCleanAct 负责，
 * 因为它需要 `next` 的**交叉引用**校验（指向的 id 必须存在），在这里做会重复且容易漏。
 */
function cleanMaps(raw: any): { defaultId?: string; packs: any[] } {
  const empty = { defaultId: undefined as string | undefined, packs: [] as any[] }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return empty
  const packs = Array.isArray(raw.packs) ? raw.packs.filter((p: any) => p && typeof p === "object") : []
  const defaultId =
    typeof raw.defaultId === "string" && packs.some((p: any) => p.id === raw.defaultId)
      ? raw.defaultId
      : packs[0]?.id
  return { defaultId, packs }
}

export async function loadSpireContent(): Promise<SpireCustomContent> {
  try {
    const d = await apiJson("/api/c/spire/content")
    return {
      cards: Array.isArray(d.cards) ? d.cards : [],
      characters: Array.isArray(d.characters) ? d.characters : [],
      skills: Array.isArray(d.skills) ? d.skills : [],
      charAccess: cleanCharAccess(d.charAccess),
      assets: cleanAssets(d.assets),
      maps: cleanMaps(d.maps),
    }
  } catch {
    return { cards: [], characters: [], skills: [], charAccess: {}, assets: {}, maps: { packs: [] } }
  }
}
