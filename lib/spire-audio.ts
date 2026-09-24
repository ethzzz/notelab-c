"use client"

/**
 * 爬塔音效引擎 —— Web Audio API 实时合成，零素材、零外链、零授权负担。
 *
 * 为什么用合成而不是音频文件：
 *   1. 不引入任何第三方素材 → 简报「资源约束」无需放宽，也不需要 credits 署名；
 *   2. 不往仓库 / public 里塞二进制，首屏不增加任何请求；
 *   3. 可参数化 —— 越重的攻击音调越低沉，静态录音做不到；
 *   4. 不依赖网络，断网与离线预览同样出声。
 *
 * 日后若想换成真实录音素材（例如 Freesound 的 CC0 音效包），把文件放进
 * `public/sounds/`，在下面 FILE_SOURCES 里登记一次即可：命中走文件，
 * 拉取/解码失败自动回落合成音，**调用方（page.tsx）一行都不用改**。
 */

export type SpireSfx =
  | "card-attack" | "card-defense" | "card-buff" | "card-special"
  | "hit" | "block" | "debuff" | "heal" | "energy" | "draw" | "generate"
  | "gold" | "potion" | "skill" | "turn-end" | "select"
  | "shop" | "remove" | "upgrade" | "rest" | "event"
  | "act-clear" | "win" | "lose"

// ---------------- 配置 ----------------

/** 外部音频文件覆盖表（默认全空 = 全部走合成）。例：{ hit: "hit.wav" } */
const FILE_SOURCES: Partial<Record<SpireSfx, string>> = {}
/** 与 next.config.ts 的 basePath 保持一致；换域名/前缀时同步改这里 */
const SOUND_DIR = "/games/sounds/"

const MUTE_KEY = "spire-sfx-muted"
const MASTER_VOLUME = 0.5
/** 同名声效的最小重播间隔（ms）：一次结算里同类事件可能连发，避免叠成噪音墙 */
const THROTTLE_MS = 35

// ---------------- 运行时状态 ----------------

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
/** null = 尚未探测；AudioBuffer = 可用；false = 探测失败，永久回落合成 */
const fileBufs = new Map<SpireSfx, AudioBuffer | false>()
const lastPlayed = new Map<SpireSfx, number>()

let mutedCache: boolean | null = null

function readMuted(): boolean {
  if (mutedCache !== null) return mutedCache
  try {
    mutedCache = typeof window !== "undefined" && window.localStorage.getItem(MUTE_KEY) === "1"
  } catch {
    mutedCache = false // 隐私模式 / 禁用存储
  }
  return mutedCache
}

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null
  if (ctx && master) return ctx
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  ctx = new Ctor()
  master = ctx.createGain()
  master.gain.value = readMuted() ? 0 : MASTER_VOLUME
  master.connect(ctx.destination)
  return ctx
}

// ---------------- 对外 API ----------------

/** 首次用户手势时调用：浏览器自动播放策略会挂起 AudioContext，需要在手势里唤醒 */
export function unlockSpireAudio(): void {
  const c = ensureCtx()
  if (c && c.state === "suspended") void c.resume()
}

export function isSpireMuted(): boolean {
  return readMuted()
}

export function setSpireMuted(m: boolean): void {
  mutedCache = m
  try {
    window.localStorage.setItem(MUTE_KEY, m ? "1" : "0")
  } catch {
    /* 存储不可用则仅本次会话生效 */
  }
  const c = ensureCtx()
  if (c && master) master.gain.setTargetAtTime(m ? 0 : MASTER_VOLUME, c.currentTime, 0.02)
}

/**
 * 播放一个音效。`rate` 是整体音高倍率（<1 更低沉），用于按伤害轻重变调。
 * 任何异常都被吞掉 —— 音效永远不能影响玩法。
 */
export function sfx(name: SpireSfx, rate = 1): void {
  try {
    const c = ensureCtx()
    if (!c || !master) return
    const now = performance.now()
    if (now - (lastPlayed.get(name) ?? -1e9) < THROTTLE_MS) return
    lastPlayed.set(name, now)
    if (c.state === "suspended") void c.resume()
    if (playFile(c, name, rate)) return
    VOICES[name](c, master, Math.min(1.6, Math.max(0.5, rate)))
  } catch {
    /* 静默：音频不可用时玩法照常 */
  }
}

// ---------------- 合成原语 ----------------

type Voice = (c: AudioContext, out: GainNode, k: number) => void

interface ToneOpts {
  type?: OscillatorType
  /** 起始频率（会被 k 倍率缩放） */
  from: number
  /** 终止频率：填了就做指数滑音 */
  to?: number
  /** 时长（秒） */
  dur: number
  gain?: number
  delay?: number
}

function tone(c: AudioContext, out: GainNode, o: ToneOpts): void {
  const t0 = c.currentTime + (o.delay ?? 0)
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = o.type ?? "sine"
  osc.frequency.setValueAtTime(o.from, t0)
  if (o.to && o.to !== o.from) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t0 + o.dur)
  }
  const peak = o.gain ?? 0.2
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.012, o.dur * 0.3))
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)
  osc.connect(g)
  g.connect(out)
  osc.start(t0)
  osc.stop(t0 + o.dur + 0.02)
}

interface NoiseOpts {
  dur: number
  /** 带通中心频率；填了 to 就做扫频（挥砍/风声靠这个） */
  freq: number
  to?: number
  q?: number
  gain?: number
  delay?: number
}

function noise(c: AudioContext, out: GainNode, o: NoiseOpts): void {
  if (!noiseBuf) noiseBuf = makeNoise(c)
  const t0 = c.currentTime + (o.delay ?? 0)
  const src = c.createBufferSource()
  src.buffer = noiseBuf
  const f = c.createBiquadFilter()
  f.type = "bandpass"
  f.frequency.setValueAtTime(o.freq, t0)
  if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur)
  f.Q.value = o.q ?? 1.2
  const g = c.createGain()
  const peak = o.gain ?? 0.18
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)
  src.connect(f)
  f.connect(g)
  g.connect(out)
  src.start(t0)
  src.stop(t0 + o.dur + 0.02)
}

/** 1 秒白噪声，全局复用一份 */
function makeNoise(c: AudioContext): AudioBuffer {
  const len = Math.floor(c.sampleRate)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  return buf
}

/** 上行三音/多音琶音：增益、治疗、号角这类"明亮"音效的通用骨架 */
function arp(c: AudioContext, out: GainNode, freqs: number[], o: { step: number; dur: number; gain: number; type?: OscillatorType }): void {
  freqs.forEach((f, i) => {
    tone(c, out, { type: o.type ?? "triangle", from: f, dur: o.dur, gain: o.gain, delay: i * o.step })
  })
}

// ---------------- 音色表 ----------------

const VOICES: Record<SpireSfx, Voice> = {
  // —— 出牌：四种卡牌类型各有一套辨识度 ——
  "card-attack": (c, o, k) => {
    // 挥砍：带通噪声自低扫到高，模拟刀锋破空
    noise(c, o, { dur: 0.16, gain: 0.28, freq: 700 * k, to: 3400 * k, q: 1.4 })
    tone(c, o, { type: "sawtooth", from: 320 * k, to: 130 * k, dur: 0.12, gain: 0.1 })
  },
  "card-defense": (c, o, k) => {
    // 举盾：低频闷响 + 金属泛音
    tone(c, o, { type: "sine", from: 160 * k, to: 90 * k, dur: 0.13, gain: 0.3 })
    tone(c, o, { type: "triangle", from: 880 * k, dur: 0.17, gain: 0.1, delay: 0.02 })
  },
  "card-buff": (c, o, k) => {
    arp(c, o, [523 * k, 659 * k, 784 * k], { step: 0.045, dur: 0.16, gain: 0.13 })
  },
  "card-special": (c, o, k) => {
    // 特殊：上滑颤音，带神秘感
    tone(c, o, { type: "sine", from: 420 * k, to: 900 * k, dur: 0.26, gain: 0.16 })
    tone(c, o, { type: "triangle", from: 630 * k, to: 1350 * k, dur: 0.22, gain: 0.08, delay: 0.03 })
  },

  // —— 战斗结算 ——
  hit: (c, o, k) => {
    noise(c, o, { dur: 0.09, gain: 0.3, freq: 1500 * k, to: 380 * k, q: 0.9 })
    tone(c, o, { type: "sine", from: 210 * k, to: 52 * k, dur: 0.11, gain: 0.34 })
  },
  block: (c, o, k) => {
    tone(c, o, { type: "triangle", from: 1150 * k, dur: 0.13, gain: 0.15 })
    tone(c, o, { type: "triangle", from: 1720 * k, dur: 0.1, gain: 0.08, delay: 0.012 })
    noise(c, o, { dur: 0.045, gain: 0.1, freq: 3200 * k, q: 2.2 })
  },
  debuff: (c, o, k) => {
    tone(c, o, { type: "sawtooth", from: 520 * k, to: 170 * k, dur: 0.22, gain: 0.13 })
    noise(c, o, { dur: 0.14, gain: 0.1, freq: 2600 * k, to: 900 * k, q: 1.6 })
  },
  heal: (c, o, k) => {
    arp(c, o, [523 * k, 659 * k, 880 * k], { step: 0.06, dur: 0.3, gain: 0.15, type: "sine" })
  },
  energy: (c, o, k) => {
    tone(c, o, { type: "square", from: 660 * k, to: 1320 * k, dur: 0.12, gain: 0.09 })
  },
  draw: (c, o, k) => {
    // 抽牌：极短的高频纸片声
    noise(c, o, { dur: 0.07, gain: 0.14, freq: 4200 * k, to: 1800 * k, q: 1.1 })
  },
  generate: (c, o, k) => {
    arp(c, o, [880 * k, 1174 * k, 1568 * k], { step: 0.035, dur: 0.2, gain: 0.11, type: "sine" })
  },

  // —— 经济与操作 ——
  gold: (c, o, k) => {
    tone(c, o, { type: "triangle", from: 1568 * k, dur: 0.1, gain: 0.13 })
    tone(c, o, { type: "triangle", from: 2093 * k, dur: 0.14, gain: 0.1, delay: 0.05 })
  },
  potion: (c, o, k) => {
    tone(c, o, { type: "sine", from: 700 * k, to: 1400 * k, dur: 0.22, gain: 0.16 })
    noise(c, o, { dur: 0.12, gain: 0.07, freq: 2600 * k, q: 2 })
  },
  skill: (c, o, k) => {
    arp(c, o, [784 * k, 988 * k, 1319 * k], { step: 0.05, dur: 0.24, gain: 0.14 })
    noise(c, o, { dur: 0.22, gain: 0.07, freq: 1800 * k, to: 4600 * k, q: 1.4 })
  },
  "turn-end": (c, o, k) => {
    noise(c, o, { dur: 0.26, gain: 0.16, freq: 1600 * k, to: 260 * k, q: 0.8 })
    tone(c, o, { type: "sine", from: 300 * k, to: 96 * k, dur: 0.24, gain: 0.16 })
  },
  select: (c, o, k) => {
    tone(c, o, { type: "square", from: 1000 * k, dur: 0.035, gain: 0.07 })
  },
  shop: (c, o, k) => {
    tone(c, o, { type: "triangle", from: 1319 * k, dur: 0.09, gain: 0.13 })
    tone(c, o, { type: "triangle", from: 1760 * k, dur: 0.13, gain: 0.1, delay: 0.055 })
  },
  remove: (c, o, k) => {
    noise(c, o, { dur: 0.2, gain: 0.2, freq: 2200 * k, to: 500 * k, q: 1.2 })
    tone(c, o, { type: "sawtooth", from: 400 * k, to: 110 * k, dur: 0.2, gain: 0.12 })
  },
  upgrade: (c, o, k) => {
    // 锻造：铁砧一击 + 泛音 + 上行确认音
    tone(c, o, { type: "square", from: 440 * k, to: 200 * k, dur: 0.1, gain: 0.18 })
    tone(c, o, { type: "triangle", from: 1760 * k, dur: 0.3, gain: 0.1, delay: 0.01 })
    arp(c, o, [523 * k, 784 * k, 1047 * k], { step: 0.05, dur: 0.3, gain: 0.1, type: "sine" })
  },
  rest: (c, o, k) => {
    // 营地：温暖的持续和弦
    tone(c, o, { type: "sine", from: 392 * k, dur: 0.42, gain: 0.14 })
    tone(c, o, { type: "sine", from: 587 * k, dur: 0.4, gain: 0.09, delay: 0.06 })
    noise(c, o, { dur: 0.3, gain: 0.05, freq: 700 * k, q: 0.8 })
  },
  event: (c, o, k) => {
    arp(c, o, [659 * k, 880 * k], { step: 0.08, dur: 0.36, gain: 0.13, type: "sine" })
  },

  // —— 幕与结局 ——
  "act-clear": (c, o, k) => {
    // 号角：三音上行 + 高八度泛音
    [523, 659, 784].forEach((f, i) => {
      tone(c, o, { type: "triangle", from: f * k, dur: 0.4, gain: 0.17, delay: i * 0.11 })
      tone(c, o, { type: "sine", from: f * 2 * k, dur: 0.34, gain: 0.06, delay: i * 0.11 })
    })
  },
  win: (c, o, k) => {
    // 凯歌：五音上行 + 低音长尾
    [523, 659, 784, 1047, 1319].forEach((f, i) => {
      tone(c, o, { type: "triangle", from: f * k, dur: 0.5, gain: 0.17, delay: i * 0.13 })
      tone(c, o, { type: "sine", from: f * 2 * k, dur: 0.42, gain: 0.06, delay: i * 0.13 })
    })
    tone(c, o, { type: "sine", from: 262 * k, dur: 1.1, gain: 0.14, delay: 0.2 })
  },
  lose: (c, o, k) => {
    // 失败：下行小调，尾部接一声风落
    [660, 554, 440, 330].forEach((f, i) => {
      tone(c, o, { type: "sine", from: f * k, dur: 0.5, gain: 0.16, delay: i * 0.2 })
    })
    tone(c, o, { type: "sine", from: 165 * k, dur: 0.9, gain: 0.13, delay: 0.75 })
    noise(c, o, { dur: 0.7, gain: 0.08, freq: 400 * k, to: 90 * k, q: 0.7, delay: 0.7 })
  },
}

// ---------------- 外部文件通路（默认不启用） ----------------

/**
 * 登记了文件的音效优先走文件；首次播放时惰性拉取并解码，成功后缓存。
 * 失败则标记 false 永久回落合成音 —— 缺文件、断网、格式不支持都不会影响玩法。
 */
function playFile(c: AudioContext, name: SpireSfx, rate: number): boolean {
  const file = FILE_SOURCES[name]
  if (!file || !master) return false
  const cached = fileBufs.get(name)
  if (cached === undefined) {
    fileBufs.set(name, false) // 先占位，防止并发重复拉取
    void fetch(SOUND_DIR + file)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((ab) => c.decodeAudioData(ab))
      .then((b) => fileBufs.set(name, b))
      .catch(() => {
        /* 保持 false：回落合成音 */
      })
    return false
  }
  if (cached === false) return false
  const src = c.createBufferSource()
  src.buffer = cached
  src.playbackRate.value = Math.min(1.6, Math.max(0.5, rate))
  src.connect(master)
  src.start()
  return true
}
