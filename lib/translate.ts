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
