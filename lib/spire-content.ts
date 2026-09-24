// 爬塔尖塔：C 端只读加载已发布的自定义卡/角色 + 角色授权白名单（匿名接口，后端 /api/c/spire/content）
import { apiJson } from "./api"

export interface SpireCustomContent {
  cards: any[]
  characters: any[]
  skills: any[]
  /**
   * 角色授权：{C 端用户组码: [该组可选择的角色 id...]}。
   * 缺失、或玩家所属组没有对应键 → 不做筛选（fail-open，全部角色可选）。
   */
  charAccess?: Record<string, string[]>
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

export async function loadSpireContent(): Promise<SpireCustomContent> {
  try {
    const d = await apiJson("/api/c/spire/content")
    return {
      cards: Array.isArray(d.cards) ? d.cards : [],
      characters: Array.isArray(d.characters) ? d.characters : [],
      skills: Array.isArray(d.skills) ? d.skills : [],
      charAccess: cleanCharAccess(d.charAccess),
    }
  } catch {
    return { cards: [], characters: [], skills: [], charAccess: {} }
  }
}
