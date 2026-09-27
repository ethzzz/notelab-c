// C 端游戏存档：登录态落 MySQL，游客态存 localStorage（两者独立，不合并）
import { apiJson, postJson } from "@/lib/api"
import { fetchMe } from "@/lib/auth"

const LS_PREFIX = "c_game_"

/**
 * 读取某游戏存档：
 * - 登录态 → 服务端 MySQL（/api/c/game/save?game=）
 * - 游客态 → localStorage
 * 用户决策：登录态与游客态存档相互独立、不合并。
 */
export async function loadGame<T = any>(gameCode: string): Promise<T | null> {
  const user = await fetchMe().catch(() => null)
  if (user) {
    try {
      const res = await apiJson<{ data?: string | T }>(`/api/c/game/save?game=${encodeURIComponent(gameCode)}`)
      const d = res?.data
      if (d == null) return null
      return (typeof d === "string" ? JSON.parse(d) : d) as T
    } catch {
      // 登录态拉取失败 → 回退游客档
    }
  }
  try {
    const raw = localStorage.getItem(LS_PREFIX + gameCode)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

/** 保存某游戏存档（按登录态分流 MySQL / localStorage） */
export async function saveGame(gameCode: string, data: unknown): Promise<void> {
  const user = await fetchMe().catch(() => null)
  if (user) {
    await postJson("/api/c/game/save", { game: gameCode, data })
    return
  }
  try {
    localStorage.setItem(LS_PREFIX + gameCode, JSON.stringify(data))
  } catch {
    /* 忽略配额错误 */
  }
}
