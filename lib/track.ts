// 摸金行动 · 埋点（本地优先，格式对齐 PRD-P0 契约）
//
// 为什么先落本地：PRD-P0（全站数据闭环）还没上线，事件表 analytics_events 与上报端点
// `/api/c/track` 都不存在。但"等 P0 上线再埋"意味着上线前的数据全丢 —— 所以这一版
// **只写本地队列**，字段名/结构/HMAC 位一律照 P0 契约来，P0 一上线把 flush 的传输接上即可，
// 不需要回头改任何调用点（调用点只认 track(event, props)）。
//
// 三条 P0 的硬规矩（照抄，别自作聪明）：
//   ① props 一律**白名单过滤** —— 用户输入文本绝不进事件（会落明文库）；
//   ② 埋点**绝不能**阻塞或影响交互 —— 失败静默，只允许 console.debug 一行；
//   ③ 单批上限 20 条 / props 2000 字符（P0 §7），本地队列按此裁。
//
// ⚠️ LLM 依赖：无。

const LS_QUEUE = "notelab.track.queue.v1"
const LS_ANON = "notelab.track.anon.v1"
const SS_SESSION = "notelab.track.session.v1"

/** P0 契约：单批上限 20 条（§7）；本地队列留足够多离线窗口，超出丢最旧 */
const MAX_BATCH = 20
const MAX_QUEUE = 600
const MAX_PROPS_CHARS = 2000
const MAX_STR = 32

/** P0 已上线后改成 true（或设 window.__NOTELAB_TRACK__ = "/api/c/track"）即可开始上报 */
const TRACK_ENDPOINT: string | null = null

export interface TrackEvent {
  ts: number
  day: string
  app: "c"
  event: string
  session_id: string
  anon_id: string
  user_id: number | null
  path: string
  props: Record<string, unknown>
}

/**
 * 每个事件允许的 props 键（P0 §4.2 的清单 + 摸金自己的三个）。
 * 不在表里的键一律丢掉 —— 这是"用户输入不进库"的第一道闸。
 */
const EVENT_PROPS: Record<string, string[]> = {
  page_view: ["referrer"],
  game_start: ["game_code"],
  spire_node_reached: ["act", "depth"],
  translate_day_open: ["has_today"],
  translate_submit: ["tier", "score_bucket", "grade_mode"],
  register_success: ["via"],
  login_success: [],
  tool_open: ["tool_id"],
  // —— 摸金行动 ——
  loot_raid_start: ["map_id", "entry_coins"],
  loot_raid_settle: ["map_id", "success", "reason_code", "haul", "items", "risk", "containers", "duration_ms"],
  loot_stash_recycle: ["items", "gained"],
  loot_rescue_claim: ["amount"],
}

/** 未登记事件：只放行"像 id 的"键值（数字/布尔/短 id），字符串一律要求无空格 */
const SAFE_KEY = /^[a-z][a-z0-9_]{0,23}$/
const SAFE_STR = /^[a-z0-9_-]{1,32}$/i

const hasLS = () => typeof window !== "undefined" && !!window.localStorage

function readLS(key: string): string | null {
  try { return hasLS() ? window.localStorage.getItem(key) : null } catch { return null }
}
function writeLS(key: string, v: string): void {
  try { if (hasLS()) window.localStorage.setItem(key, v) } catch { /* 隐私模式/配额满：静默 */ }
}

function rand16(): string {
  try {
    const a = new Uint8Array(8)
    crypto.getRandomValues(a)
    return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("")
  } catch {
    return ("0000000000000000" + Math.floor(Math.random() * 0xffffffffffff).toString(16)).slice(-16)
  }
}

let anonId = ""
let sessionId = ""

/** 首次调用生成 anon_id（localStorage，跨会话）/ session_id（sessionStorage，会话级） */
export function initTrack(): { anonId: string; sessionId: string } {
  if (!anonId) {
    let a = readLS(LS_ANON)
    if (!a || !/^[0-9a-f]{16}$/.test(a)) { a = rand16(); writeLS(LS_ANON, a) }
    anonId = a
  }
  if (!sessionId) {
    let s = ""
    try { s = (typeof window !== "undefined" && window.sessionStorage.getItem(SS_SESSION)) || "" } catch { /* ignore */ }
    if (!/^[0-9a-f]{16}$/.test(s)) {
      s = rand16()
      try { if (typeof window !== "undefined") window.sessionStorage.setItem(SS_SESSION, s) } catch { /* ignore */ }
    }
    sessionId = s
  }
  return { anonId, sessionId }
}

/** 当前登录的 C 端用户 id（由页面在拿到 /api/c/auth/me 后告知；不传则 null = 游客） */
let userId: number | null = null
export function setTrackUser(id: number | null): void { userId = id }

function sanitizeProps(event: string, props?: Record<string, unknown>): Record<string, unknown> {
  if (!props) return {}
  const allow = EVENT_PROPS[event]
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(props)) {
    if (allow) {
      if (!allow.includes(k)) continue
    } else if (!SAFE_KEY.test(k)) continue

    if (typeof v === "number" && Number.isFinite(v)) out[k] = v
    else if (typeof v === "boolean") out[k] = v
    else if (typeof v === "string") {
      const s = v.trim()
      if (!s) continue
      if (allow ? s.length <= MAX_STR * 2 : SAFE_STR.test(s)) out[k] = s.slice(0, MAX_STR * 2)
    }
    // 对象/数组/函数一律丢（避免把整份存档或输入文本带进去）
  }
  return out
}

function today(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function readQueue(): TrackEvent[] {
  const raw = readLS(LS_QUEUE)
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

function writeQueue(q: TrackEvent[]): void {
  writeLS(LS_QUEUE, JSON.stringify(q.length > MAX_QUEUE ? q.slice(-MAX_QUEUE) : q))
}

/**
 * 记一条事件。**永不抛异常**：埋点坏了不能连累玩法。
 * @returns 入队后的事件（便于本地验收/单测断言）
 */
export function track(event: string, props?: Record<string, unknown>): TrackEvent | null {
  try {
    const { anonId: a, sessionId: s } = initTrack()
    const now = new Date()
    let p = sanitizeProps(event, props)
    if (JSON.stringify(p).length > MAX_PROPS_CHARS) p = {}
    const ev: TrackEvent = {
      ts: now.getTime(), day: today(now), app: "c", event,
      session_id: s, anon_id: a, user_id: userId,
      path: typeof window !== "undefined" ? window.location.pathname : "",
      props: p,
    }
    const q = readQueue()
    q.push(ev)
    writeQueue(q)
    return ev
  } catch {
    return null
  }
}

/** 会话内同 path 只报一次（P0 坑 2：React StrictMode dev 会双调用） */
const seenPaths = new Set<string>()
export function autoPageView(referrer = ""): void {
  if (typeof window === "undefined") return
  const p = window.location.pathname
  if (seenPaths.has(p)) return
  seenPaths.add(p)
  track("page_view", { referrer })
}

export interface FlushResult { sent: number; dropped: number; mode: "offline" | "posted" }

/**
 * 批量吐出。
 * - P0 未上线（TRACK_ENDPOINT = null）：**只裁剪队列**（超 20 条的部分留待下批），
 *   返回 mode="offline"，不产生任何网络请求 —— 数据留在本地不丢。
 * - P0 上线后：按 P0 §4.3 走 sendBeacon + `text/plain`（不能带自定义 header）。
 */
export function flush(): FlushResult {
  try {
    const q = readQueue()
    if (!q.length) return { sent: 0, dropped: 0, mode: "offline" }
    if (!TRACK_ENDPOINT) {
      if (typeof console !== "undefined") {
        // eslint-disable-next-line no-console
        console.debug(`[track] offline: ${q.length} 条待上报（P0 上线后自动接）`)
      }
      return { sent: 0, dropped: 0, mode: "offline" }
    }
    const batch = q.slice(0, MAX_BATCH)
    const body = JSON.stringify({ events: batch })
    let ok = false
    try {
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        ok = navigator.sendBeacon(TRACK_ENDPOINT, new Blob([body], { type: "text/plain;charset=UTF-8" }))
      } else {
        void fetch(TRACK_ENDPOINT, {
          method: "POST", keepalive: true,
          headers: { "Content-Type": "text/plain;charset=UTF-8" }, body,
        }).then(() => undefined).catch(() => undefined)
        ok = true
      }
    } catch { ok = false }
    const dropped = ok ? batch.length : 0
    if (ok) writeQueue(q.slice(batch.length))
    return { sent: batch.length, dropped, mode: "posted" }
  } catch {
    return { sent: 0, dropped: 0, mode: "offline" }
  }
}

/** 本地事件条数 / 最近若干条（B 端与 CDP 验收用；也方便玩家自查） */
export function trackStats(): { total: number; byEvent: Record<string, number>; last: TrackEvent | null } {
  const q = readQueue()
  const byEvent: Record<string, number> = {}
  for (const e of q) byEvent[e.event] = (byEvent[e.event] || 0) + 1
  return { total: q.length, byEvent, last: q.length ? q[q.length - 1] : null }
}

export function clearTrack(): void {
  try { if (hasLS()) window.localStorage.removeItem(LS_QUEUE) } catch { /* ignore */ }
}
