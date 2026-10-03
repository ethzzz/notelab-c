// 摸金行动 · 埋点（PRD-P0 全站数据闭环的 C 端 SDK）
//
// 契约与实现细节全部对齐 PRD-P0（docs/PRD/PRD-P0-analytics.md）：
//   ① props 一律**白名单过滤** —— 用户输入文本绝不进事件（会落明文库）；
//   ② 埋点**绝不能**阻塞或影响交互 —— 失败静默，只允许 console.debug 一行；
//   ③ 单批上限 20 条 / props 2000 字符（§7），服务端会再校验一次。
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

/** 攒够 5 条就发（PRD §4.4：攒 5 条 或 5 秒，先到先发） */
const FLUSH_AT = 5
/** 5 秒定时兜底（页面一直不产生第 5 条时也要把前面的发走） */
const FLUSH_MS = 5000

/** 上报端点。默认 /api/c/track（匿名可写，绕开 B 端 PermGuard）。 */
const DEFAULT_ENDPOINT = "/api/c/track"

/** 可用 `window.__NOTELAB_TRACK__` 覆盖：给字符串=换端点，给 null/""=临时关闭上报（本地调试用）。 */
function endpoint(): string | null {
  try {
    if (typeof window !== "undefined") {
      const o = (window as unknown as { __NOTELAB_TRACK__?: unknown }).__NOTELAB_TRACK__
      if (o !== undefined) return typeof o === "string" && o ? o : null
    }
  } catch { /* ignore */ }
  return DEFAULT_ENDPOINT
}

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
  wireFlush()
  return { anonId, sessionId }
}

/** 当前登录的 C 端用户 id（由页面在拿到 /api/c/auth/me 后告知；不传则 null = 游客） */
let userId: number | null = null

/**
 * 告知当前登录用户。**id 变化时自动做一次身份回填**（PRD §4.1：登录前后要连成一个人，
 * 否则永远分不清 anon 与 user）。回填由服务端按 C 端会话取权威 user_id，客户端自报不算数。
 */
export function setTrackUser(id: number | null): void {
  const changed = id !== userId
  userId = id
  if (changed && id != null) identify()
}

/** 已回填成功的用户 id（避免重复请求） */
let identifiedFor = -1

/** 把本设备的 anon_id 最近 30 分钟的游客事件回填到当前登录用户名下。失败静默。 */
export function identify(): void {
  try {
    const id = userId
    if (id == null || id === identifiedFor) return
    const { anonId: a } = initTrack()
    void fetch("/api/c/track/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anon_id: a }),
      keepalive: true,
    })
      .then(() => { identifiedFor = id })
      .catch(() => undefined)
  } catch { /* 静默：埋点绝不阻塞交互 */ }
}

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
    if (q.length >= FLUSH_AT) flush()   // 先到先发：攒够 5 条立刻走
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
 * 批量吐出（一批，最多 MAX_BATCH 条）。
 * - 端点被关掉（`window.__NOTELAB_TRACK__ = null`）：**只裁剪队列**，返回 mode="offline"，
 *   不产生网络请求 —— 数据留在本地不丢。
 * - 端点可用：走 sendBeacon + `text/plain`（P0 坑 1：sendBeacon **不能带自定义 header**，
 *   带 `application/json` 会让 Spring 解析 body 失败）；sendBeacon 不可用时回落 `fetch(keepalive)`。
 */
export function flush(): FlushResult {
  try {
    const q = readQueue()
    if (!q.length) return { sent: 0, dropped: 0, mode: "offline" }
    const ep = endpoint()
    if (!ep) {
      if (typeof console !== "undefined") {
        // eslint-disable-next-line no-console
        console.debug(`[track] offline: ${q.length} 条待上报（端点已关闭）`)
      }
      return { sent: 0, dropped: 0, mode: "offline" }
    }
    const batch = q.slice(0, MAX_BATCH)
    const body = JSON.stringify({ events: batch })
    let ok = false
    try {
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        ok = navigator.sendBeacon(ep, new Blob([body], { type: "text/plain;charset=UTF-8" }))
      } else {
        void fetch(ep, {
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

/** 把队列整批排空（最多 5 轮 × 20 条）。用于页面隐藏/卸载 —— 那时再不发就没机会了。 */
export function flushAll(): void {
  try {
    for (let i = 0; i < 5; i++) {
      const r = flush()
      if (r.mode === "offline" || r.sent === 0) return
      if (readQueue().length < MAX_BATCH) return
    }
  } catch { /* 静默 */ }
}

/** 接线定时 flush 与页面隐藏 flush。幂等（模块级只装一次）。 */
let wired = false
export function wireFlush(): void {
  if (wired || typeof window === "undefined") return
  wired = true
  try {
    window.setInterval(() => { flush() }, FLUSH_MS)
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushAll()
    })
    window.addEventListener("pagehide", () => flushAll())
  } catch { /* 静默 */ }
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
