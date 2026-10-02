"use client";

/**
 * 习惯打卡 · 连续天数（/games/utils/habits）
 *
 * 习惯定义走统一记忆层 kind='habit'（复用 CRUD / 导出 / 云同步）；
 * 每日打卡日志单独存 notelab.habits.log.v1 —— 塞进 MemoryItem.body 会污染列表渲染。
 * 运行期零大模型依赖、零后端依赖。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import MemoryShell, { loadKind } from "@/components/MemoryShell";
import { upsert, remove, type MemoryItem } from "@/lib/memory";

const LOG_KEY = "notelab.habits.log.v1";

type LogMap = Record<string, { mood?: number; note?: string }>;

function readLog(): LogMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LOG_KEY);
    return raw ? (JSON.parse(raw) as LogMap) : {};
  } catch {
    return {};
  }
}

function writeLog(log: LogMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch {
    /* 配额满，静默 */
  }
}

const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** 今天 00:00 的时间戳 */
function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default function HabitsPage() {
  const [habits, setHabits] = useState<MemoryItem[]>([]);
  const [log, setLog] = useState<LogMap>({});
  const [openForm, setOpenForm] = useState(false);
  const [draft, setDraft] = useState({ id: "", title: "", body: "", tags: "", target: "1" });
  const [flash, setFlash] = useState("");

  const reload = useCallback(() => {
    setHabits(loadKind("habit"));
    setLog(readLog());
  }, []);

  useEffect(() => {
    reload();
    setOpenForm(false);
  }, [reload]);

  const todayKey = useMemo(() => dayKey(new Date()), []);
  const todayDone = habits.filter((h) => log[dayKey(new Date())]?.[h.id]).length;

  /* ------------------------- 打卡 ------------------------- */

  const toggle = (h: MemoryItem) => {
    const next = { ...readLog() };
    const k = dayKey(new Date());
    next[k] = { ...(next[k] || {}), [h.id]: !next[k]?.[h.id] };
    writeLog(next);
    setLog(next);
    setFlash(`${next[k][h.id] ? "✅" : "↩️"} ${h.title} ${next[k][h.id] ? "已打卡" : "已取消"}`);
    setTimeout(() => setFlash(""), 1800);
  };

  /** 某习惯的连续天数（从今天或昨天往前数） */
  const streakOf = useCallback((h: MemoryItem): number => {
    const l = readLog();
    let n = 0;
    const cursor = new Date();
    // 今天没打卡时从昨天开始算，不然「连续 3 天」今天没打就变 0，体感很糟
    if (!l[dayKey(cursor)]?.[h.id]) cursor.setDate(cursor.getDate() - 1);
    while (l[dayKey(cursor)]?.[h.id]) {
      n += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return n;
  }, []);

  /** 最近 12 周的热力图（按习惯聚合） */
  const heat = useMemo(() => {
    const l = readLog();
    const weeks: { key: string; date: string; day: number }[][] = [];
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + (6 - end.getDay())); // 补齐到本周周日
    for (let w = 11; w >= 0; w--) {
      const week: { key: string; date: string; day: number }[] = [];
      for (let d = 0; d < 7; d++) {
        const cur = new Date(end);
        cur.setDate(cur.getDate() - w * 7 - (6 - d));
        week.push({ key: dayKey(cur), date: dayKey(cur), day: cur.getDay() });
      }
      weeks.push(week);
    }
    return weeks.map((week) => ({
      week: week.map((cell) => ({ ...cell, count: habits.filter((h) => l[cell.key]?.[h.id]).length })),
    }));
  }, [log, habits]);

  /* ------------------------- 录入 ------------------------- */

  const save = () => {
    const title = draft.title.trim();
    if (!title) return;
    const target = Number(draft.target) || 1;
    upsert({
      id: draft.id || undefined,
      kind: "habit",
      title,
      body: draft.body.trim() || "（无备注）",
      tags: draft.tags
        .split(/[\s,，]+/)
        .map((t) => t.trim())
        .filter(Boolean),
      extra: { target },
    });
    setOpenForm(false);
    setDraft({ id: "", title: "", body: "", tags: "", target: "1" });
    reload();
  };

  const openNew = () => {
    setDraft({ id: "", title: "", body: "", tags: "", target: "1" });
    setOpenForm(true);
  };

  const openEdit = (h: MemoryItem) => {
    setDraft({
      id: h.id,
      title: h.title,
      body: h.body,
      tags: h.tags.join(" "),
      target: String(h.extra?.target ?? 1),
    });
    setOpenForm(true);
  };

  const del = (id: string) => {
    remove(id);
    reload();
  };

  return (
    <MemoryShell
      kind="habit"
      title="✅ 习惯打卡"
      subtitle="每日打卡 · 连续天数 · 12 周热力图 · 全本地存储"
    >
      {openForm && (
        <section className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700">{draft.id ? "编辑习惯" : "新增习惯"}</h2>
          <div className="mb-2 grid gap-2 sm:grid-cols-[2fr_1fr]">
            <input
              value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="习惯名（如：刷速查卡）"
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-300"
            />
            <input
              value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })}
              type="number" min={1}
              placeholder="每日目标次数"
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-300"
            />
          </div>
          <input
            value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
            placeholder="标签，空格分隔（如：学习 daily）"
            className="mb-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-300"
          />
          <input
            value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            placeholder="备注（怎么算完成）"
            className="mb-3 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-300"
          />
          <div className="flex gap-2">
            <button onClick={save} className="rounded-xl bg-indigo-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-600">
              保存
            </button>
            <button onClick={() => setOpenForm(false)} className="rounded-xl border border-black/10 bg-white px-4 py-2 text-xs font-medium text-zinc-600 shadow-sm transition hover:bg-zinc-50">
              取消
            </button>
          </div>
        </section>
      )}

      {/* 今日概览 */}
      <section className="mb-5 rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-zinc-700">今天 {todayDone} / {habits.length}</div>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              {todayDone === habits.length && habits.length > 0 ? "全部完成 ✓" : "还差几项"}
            </p>
          </div>
          <button onClick={openNew} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700">
            + 新习惯
          </button>
        </div>

        {flash && <div className="mt-3 text-xs text-emerald-600">{flash}</div>}

        {habits.length === 0 ? (
          <p className="mt-4 text-center text-xs text-zinc-400">
            还没有习惯。点「新习惯」加一个，或点右上角「初始数据」灌入 4 条预置（学习 / 复盘 / 身体 / 纪律）
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {habits.map((h) => {
              const done = Boolean(log[todayKey]?.[h.id]);
              const streak = streakOf(h);
              return (
                <li key={h.id} className="flex items-center gap-3 rounded-xl border border-black/5 bg-zinc-50/60 px-3 py-2.5">
                  <button
                    onClick={() => toggle(h)}
                    aria-pressed={done}
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm transition ${
                      done
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-black/15 bg-white text-zinc-300 hover:border-emerald-300"
                    }`}
                  >
                    {done ? "✓" : "○"}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-zinc-800">{h.title}</span>
                      {h.extra?.target && h.extra.target !== 1 && (
                        <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">
                          {h.extra.target} 次/天
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[11px] text-zinc-400">
                      {h.body} · 连续 <b className={streak > 0 ? "text-amber-600" : "text-zinc-400"}>{streak}</b> 天
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button onClick={() => openEdit(h)} className="rounded-lg border border-black/10 px-2 py-1 text-[11px] text-zinc-600 transition hover:bg-zinc-50">
                      编辑
                    </button>
                    <button onClick={() => del(h.id)} className="rounded-lg border border-black/10 px-2 py-1 text-[11px] text-red-500 transition hover:bg-red-50">
                      删
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 热力图 */}
      {habits.length > 0 && (
        <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-zinc-700">
            近 12 周热力 <span className="ml-1 text-xs font-normal text-zinc-400">越深打得越多</span>
          </div>
          <div className="overflow-x-auto">
            <div className="flex gap-[3px]">
              {heat.map((w, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {w.week.map((c) => {
                    const future = c.date > todayKey;
                    const lvl = c.count === 0 ? 0 : c.count < habits.length ? 1 : 2;
                    return (
                      <div
                        key={c.key}
                        title={`${c.date} · ${c.count}/${habits.length}`}
                        className={`h-3 w-3 rounded-[2px] ${
                          future
                            ? "bg-zinc-50"
                            : lvl === 0
                              ? "bg-zinc-100"
                              : lvl === 1
                                ? "bg-amber-200"
                                : "bg-amber-500"
                        }`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[10px] text-zinc-400">
            <span>少</span>
            <span className="h-3 w-3 rounded-[2px] bg-zinc-100" />
            <span className="h-3 w-3 rounded-[2px] bg-amber-200" />
            <span className="h-3 w-3 rounded-[2px] bg-amber-500" />
            <span>多</span>
          </div>
        </section>
      )}
    </MemoryShell>
  );
}
