// 每日英语翻译练习（C 端）公共类型：接口契约以 notelab-java TranslateController（/api/translate）为准。

/** 逐点错误标注 */
export type GradeError = { type: string; original: string; suggestion: string; note: string }

/** 已有/刚返回的判分结果 */
export type Submission = {
  en_text: string
  accurate: boolean | null
  score: number | null
  corrected: string | null
  explanation: string | null
  errors: GradeError[]
  updated_at?: string
  /** 判分来源：模型名 / "local-diff" 本地对照 / "manual" 无参考译文自评 */
  model?: string | null
}

/** 判分模式：用于诚实标注，本地比对绝不能显示成 AI 批改 */
export type GradeMode = "llm" | "local" | "manual"

export function modeOf(sub: Submission | null | undefined): GradeMode {
  const m = sub?.model || ""
  if (m === "local-diff") return "local"
  if (m === "manual") return "manual"
  if (!m) return "llm"
  return "llm"
}

export const MODE_LABEL: Record<GradeMode, string> = {
  llm: "AI 批改",
  local: "本地对照判分",
  manual: "自评（无参考译文）",
}

export type Sentence = {
  id: number
  tier: number
  zh_text: string
  sort_order: number
  submission: Submission | null
}

export type TierMeta = { tier: number; name: string; desc: string }

export type TodayPayload = {
  group: { id: number; title: string; activated_date: string } | null
  date: string
  tiers: TierMeta[]
  sentences: Sentence[]
}

/** 阶梯视觉：徽章底色/文字色（与 B 端 green/gold/volcano 语义对应） */
export const TIER_STYLE: Record<number, string> = {
  1: "bg-emerald-50 text-emerald-600",
  2: "bg-amber-50 text-amber-600",
  3: "bg-rose-50 text-rose-600",
}

// ---------------- 进度 / 习惯闭环（GET /api/translate/progress） ----------------

/** 单日进度：done 已提交句数、correct 判为准确句数、total 当天应做句数 */
export type DailyRow = { date: string; done: number; correct: number; total: number }

/** 弱项：错误类型聚合 */
export type ErrorTypeRow = { type: string; count: number }

export type ProgressPayload = {
  date: string
  days: number
  daily: DailyRow[]
  streak: number
  error_types: ErrorTypeRow[]
  totals: { done: number; correct: number; active_days: number; rate: number }
  llm?: { available: boolean; mode: string; reason?: string }
}
