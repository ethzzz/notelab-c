// NoteLab C 端 API：浏览器同源请求 /api/c/*，经 nginx :80 前缀代理直达后端 :8001（不在 next.config 做任何 rewrite）
export function apiBase(): string {
  // 同源：直接用相对路径
  return ""
}

// 统一请求：同源，携带 Cookie（notelab_c_session）
export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${apiBase()}${path}`, { credentials: "include", ...init })
}

export async function apiJson<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await api(path, init)
  let data: any = null
  try { data = await r.json() } catch { /* 非 JSON */ }
  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`)
  return data as T
}

export function postJson(path: string, body: any): Promise<any> {
  return apiJson(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

// ---------------- 未登录回跳：记录被拦截的路由，登录成功后返回 ----------------
const REDIRECT_KEY = "notelab-c.redirect"
// 与 next.config.ts 的 basePath 保持一致：window.location.pathname 带 /games 前缀，
// 而 router 跳转会自动补 basePath，存储时必须剥掉前缀，否则回跳会变 /games/games/…
const BASE_PATH = "/games"

/** 校验未登录被拦到 login 页前，记录当前所在路由（含 query，已剥 basePath 前缀） */
export function rememberPath(path: string) {
  const base = path.split("?")[0]
  const query = path.slice(base.length)
  if (base === BASE_PATH) path = "/" + query
  else if (base.startsWith(BASE_PATH + "/")) path = base.slice(BASE_PATH.length) + query
  try { localStorage.setItem(REDIRECT_KEY, path) } catch { /* ignore */ }
}

/** 主动退出登录时清除回跳记录，避免下次登录误跳旧路由 */
export function clearRememberedPath() {
  try { localStorage.removeItem(REDIRECT_KEY) } catch { /* ignore */ }
}

/**
 * 取出并清除记录的路由：
 * - 格式非法（非站内路径 / login 自身）→ 回退 fallback（C 端默认首页）
 * - 传入 validPaths 时，不在其中也回退 fallback
 */
export function takeRedirectPath(validPaths?: string[], fallback = "/"): string {
  let p = ""
  try {
    p = localStorage.getItem(REDIRECT_KEY) || ""
    localStorage.removeItem(REDIRECT_KEY)
  } catch { /* ignore */ }
  if (!p.startsWith("/") || p === "/login") return fallback
  if (validPaths && !validPaths.includes(p.split("?")[0])) return fallback
  return p
}
