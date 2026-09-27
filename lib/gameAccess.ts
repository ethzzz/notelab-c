// 游戏登录管理配置：哪些游戏需要登录才能玩（由 B 端超管在 ui_config.game_access 配置）
import { apiJson } from "@/lib/api"

export type GameAccessEntry = { requireLogin?: boolean }
export type GameAccessMap = Record<string, GameAccessEntry>

let cache: GameAccessMap | null = null
let cacheAt = 0
// 客户端缓存窗口：与服务端 UiConfigService 30s 缓存对齐。
// 服务端 save() 会立即 invalidate，故 B 端保存后最迟 30s 内 C 端即生效（无需整页刷新）。
const CACHE_MS = 30_000

/** 读取「哪些游戏需要登录才能玩」配置（匿名端点，服务端保存即失效） */
export async function fetchGameAccess(): Promise<GameAccessMap> {
  const now = Date.now()
  if (cache && now - cacheAt < CACHE_MS) return cache
  try {
    const res = await apiJson<{ game_access?: GameAccessMap }>("/api/c/game/access")
    cache = res?.game_access && typeof res.game_access === "object" ? res.game_access : {}
  } catch {
    cache = cache ?? {}
  }
  cacheAt = now
  return cache
}

/**
 * 该游戏是否需要登录才能玩：
 * 缺省 false（游客可玩），仅当配置显式 requireLogin=true 才要求登录。
 */
export async function isLoginRequired(gameCode: string): Promise<boolean> {
  const ga = await fetchGameAccess()
  const entry = ga[gameCode]
  return !!(entry && entry.requireLogin === true)
}

/** 配置后台保存后调用，使下次读取立即生效 */
export function invalidateGameAccess() {
  cache = null
}
