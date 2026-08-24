// 爬塔尖塔：C 端只读加载已发布的自定义卡/角色（匿名接口，后端 /api/c/spire/content）
import { apiJson } from "./api"

export interface SpireCustomContent {
  cards: any[]
  characters: any[]
  skills: any[]
}

export async function loadSpireContent(): Promise<SpireCustomContent> {
  try {
    const d = await apiJson("/api/c/spire/content")
    return {
      cards: Array.isArray(d.cards) ? d.cards : [],
      characters: Array.isArray(d.characters) ? d.characters : [],
      skills: Array.isArray(d.skills) ? d.skills : [],
    }
  } catch {
    return { cards: [], characters: [], skills: [] }
  }
}
