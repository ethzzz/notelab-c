/**
 * SM-2 间隔重复算法（Superior Memory II / Piotr Wozniak 1987 原始版）。
 *
 * 刻意做成**纯函数 + 无副作用**，方便单独验算；UI 只负责调 grade() 拿到新状态再存盘。
 *
 * 边界（踩过的坑）：
 *  - 首答（reps=0）interval 固定 1 天，不按公式算，避免「学一次就排到下个月」。
 *  - 评分 grade ∈ [0,5]，personally 0–2 记「忘记」→ 重排到当天重来（interval 归 1）。
 *  - easeFactor 下限 1.3（原论文），否则卡片会永远排不出来。
 */

export interface Sm2State {
  /** 连续答对次数 */
  reps: number;
  /** 复习间隔（天） */
  interval: number;
  /** 难度系数，初始 2.5 */
  ease: number;
  /** 下次复习时间戳（ms） */
  due: number;
  /** 历史评分 */
  history: number[];
}

export const NEW_STATE: Sm2State = {
  reps: 0,
  interval: 0,
  ease: 2.5,
  due: 0,
  history: [],
};

const DAY = 86400_000;

/** 评分并推进状态。grade ∈ [0,5]，低于 3 视为忘记。 */
export function grade(state: Sm2State, grade_: number, now = Date.now()): Sm2State {
  const g = Math.max(0, Math.min(5, Math.round(grade_)));
  const forgotten = g < 3;

  let { reps, interval, ease } = state;

  if (forgotten) {
    reps = 0;
    interval = 0;
    // ⚠️ 答错也要降 ease（2026-10-02 验算发现漏了这条）：
    // 同一张卡反复记不住 ≈ 它确实难，若 ease 停在初值 2.5，下次答对 6 天间隔直接虚高。
    // g=2 小惩、g=0 重惩；下限 1.3 照旧。
    ease = Math.max(1.3, ease - (g <= 1 ? 0.2 : 0.12));
  } else {
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 6;
    else interval = Math.round(interval * ease);
    ease = Math.max(1.3, ease + (0.1 - (5 - g) * (0.08 + (5 - g) * 0.02)));
  }

  // 0 分卡（彻底不会）也别排到明天，给 10 分钟后再来
  const dueIn = forgotten ? (g === 0 ? 10 * 60_000 : 0) : interval * DAY;

  return {
    reps,
    interval: forgotten ? 0 : interval,
    ease,
    due: now + dueIn,
    history: [...state.history, g].slice(-40),
  };
}

/** 到期（含今天）的卡片 */
export function isDue(s: Sm2State, now = Date.now()): boolean {
  return s.due <= now;
}

/** 下次复习的中文描述 */
export function describeDue(s: Sm2State): string {
  if (!s.due) return "待开始";
  const delta = s.due - Date.now();
  if (delta <= 0) return "今天到期";
  if (delta < 3600_000) return `${Math.max(1, Math.round(delta / 60000))} 分钟后`;
  if (delta < DAY) return `${Math.round(delta / 3600_000)} 小时后`;
  return `${Math.round(delta / DAY)} 天后`;
}

/** 记忆强度粗估（0–100），用于进度条：答得越顺、间隔越长越高 */
export function strength(s: Sm2State): number {
  if (!s.reps) return 0;
  const base = Math.min(1, s.interval / 21);
  const easePart = Math.min(1, (s.ease - 1.3) / 1.2);
  return Math.min(100, Math.round((base * 0.7 + easePart * 0.3) * 100));
}
