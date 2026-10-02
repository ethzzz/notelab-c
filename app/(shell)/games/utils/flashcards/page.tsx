"use client";

/**
 * 速查卡 · 间隔重复（/games/utils/flashcards）
 *
 * 运行期零大模型依赖：卡片来自统一记忆层 kind='flashcard'（预置种子 + 用户自己录入），
 * 排期用纯函数 SM-2（lib/sm2.ts），全部本地计算。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import MemoryShell, { loadKind } from "@/components/MemoryShell";
import { KIND_LABEL, upsert, remove, search, type MemoryItem } from "@/lib/memory";
import { grade as sm2Grade, describeDue, strength, isDue, type Sm2State } from "@/lib/sm2";

const GRADES = [
  { g: 5, label: "完全记住" },
  { g: 4, label: "有点模糊" },
  { g: 3, label: "想起来了" },
  { g: 2, label: "勉强" },
  { g: 1, label: "完全不会" },
  { g: 0, label: "重启重来" },
];

export default function FlashcardsPage() {
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<MemoryItem | null>(null);
  const [draft, setDraft] = useState({ title: "", body: "", tags: "", id: "" });
  const [queue, setQueue] = useState<MemoryItem[]>([]);
  const [back, setBack] = useState(true);
  const [lastResult, setLastResult] = useState<string>("");

  const reload = useCallback(() => setItems(loadKind("flashcard")), []);

  useEffect(() => {
    reload();
    // 进入页面先把到期队列排出来
    setQueue(pickDue(loadKind("flashcard")));
    setBack(true);
  }, [reload]);

  const filtered = useMemo(() => search(items, q), [items, q]);

  /* ------------------------- 录入 ------------------------- */

  const openNew = () => {
    setEditing(null);
    setDraft({ id: "", title: "", body: "", tags: "" });
    setBack(false);
  };

  const openEdit = (it: MemoryItem) => {
    setEditing(it);
    setDraft({ id: it.id, title: it.title, body: it.body, tags: it.tags.join(" ") });
    setBack(false);
  };

  const save = () => {
    const title = draft.title.trim();
    const body = draft.body.trim();
    if (!title || !body) return;
    upsert({
      id: draft.id || undefined,
      kind: "flashcard",
      title,
      body,
      tags: draft.tags
        .split(/[\s,，]+/)
        .map((t) => t.trim())
        .filter(Boolean),
      extra: draft.id ? loadKind("flashcard").find((i) => i.id === draft.id)?.extra : undefined,
    });
    setBack(true);
    reload();
    setQueue(pickDue(loadKind("flashcard")));
  };

  const del = (id: string) => {
    remove(id);
    reload();
    setQueue(pickDue(loadKind("flashcard")));
  };

  /* ------------------------- 答题 ------------------------- */

  const current = queue[0] || null;

  const answer = (g: number) => {
    if (!current) return;
    const prev = (current.extra?.sm2 as Sm2State) || { reps: 0, interval: 0, ease: 2.5, due: 0, history: [] };
    const next = sm2Grade(prev, g);
    const card: MemoryItem = {
      ...current,
      extra: { ...(current.extra || {}), sm2: next },
      updatedAt: Date.now(),
    };
    upsert(card);
    setLastResult(`${g >= 3 ? "✅" : "↩️"} ${GRADES.find((x) => x.g === g)?.label} · 下次 ${describeDue(next)}`);
    setQueue((qq) => qq.slice(1));
    reload();
  };

  const dueCount = items.filter((i) => isDue((i.extra?.sm2 as Sm2State) || { reps: 0, interval: 0, ease: 2.5, due: 0, history: [] })).length;
  const total = items.length;

  /* ------------------------- 键盘操作 ------------------------- */
  // subtitle 里承诺了「空格翻面 / 1–6 评分」；输入框聚焦时不劫持按键，否则打不出字。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      // 输入框聚焦时不劫持按键，否则 tag / 正文字段打不出数字
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (!current) return;

      // 空格 = 翻面（只在背面朝上时有效，避免已翻面后误触跳题）
      if (e.code === "Space" && !back) {
        e.preventDefault();
        setBack(true);
        return;
      }
      // 1–6 = 评分（只有背面朝上才给评分）
      if (back) {
        const n = Number(e.key);
        if (n >= 0 && n <= 5) {
          e.preventDefault();
          answer(n);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <MemoryShell
      kind="flashcard"
      title="🃏 速查卡 · 间隔重复"
      subtitle="SM-2 记忆曲线本地排期 · 键盘 1–6 评分 · 空格翻面"
    >
      {/* ---------- 答题区 ---------- */}
      {total > 0 && (
        <section className="mb-6 rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          {current ? (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-600">待复习 {queue.length}</span>
                {current.tags.map((t) => (
                  <span key={t} className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-500">#{t}</span>
                ))}
              </div>

              <div className="min-h-[7.5rem] whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800">
                {back ? current.title : "（先想想，再翻面）"}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => setBack((b) => !b)}
                  className="rounded-xl border border-black/10 bg-white px-3.5 py-2 text-xs font-medium text-zinc-600 shadow-sm transition hover:bg-zinc-50"
                >
                  {back ? "下一题" : "翻面（空格）"}
                </button>
                {back && GRADES.map((x) => (
                  <button key={x.g} onClick={() => answer(x.g)}
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-medium text-zinc-600 shadow-sm transition hover:bg-zinc-50">
                    <span className="mr-1 text-zinc-400">{x.g}</span>{x.label}
                  </button>
                ))}
              </div>

              <div className="mt-3 min-h-[1.25rem] text-[11px] text-indigo-500">{lastResult}</div>
            </>
          ) : (
            <div className="py-6 text-center text-sm text-zinc-400">
              没有到期卡片 —— 隔一会儿再来，或手动补几张新卡
            </div>
          )}
        </section>
      )}

      {/* ---------- 录入 / 编辑 ---------- */}
      {!back && (
        <section className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700">
            {editing ? "编辑这张卡" : "新增一张卡"}
          </h2>
          <input
            value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="正面（问题 / 关键词）"
            className="mb-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-300"
          />
          <textarea
            value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            rows={4} placeholder="背面（答案 / 要点）。支持多行"
            className="mb-2 w-full resize-y rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-300"
          />
          <input
            value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
            placeholder="标签，空格分隔（如：MySQL 索引）"
            className="mb-3 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-300"
          />
          <div className="flex gap-2">
            <button onClick={save} className="rounded-xl bg-indigo-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-600">
              保存
            </button>
            <button onClick={() => setBack(true)} className="rounded-xl border border-black/10 bg-white px-4 py-2 text-xs font-medium text-zinc-600 shadow-sm transition hover:bg-zinc-50">
              取消
            </button>
          </div>
        </section>
      )}

      {total === 0 && back && (
        <section className="mb-6 rounded-2xl border border-black/10 bg-white p-6 text-center shadow-sm">
          <p className="mb-3 text-sm text-zinc-500">库里还没有卡片。</p>
          <button onClick={openNew} className="rounded-xl bg-indigo-500 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-600">
            新增第一张卡
          </button>
          <p className="mt-3 text-[11px] text-zinc-400">
            也可以点右上角「初始数据」灌入一批预置的踩坑速查卡（{KIND_LABEL.flashcard}）
          </p>
        </section>
      )}

      {/* ---------- 列表 ---------- */}
      <section className="rounded-2xl border border-black/10 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 px-5 py-3">
          <div className="text-sm font-semibold text-zinc-700">
            卡片池 <span className="ml-1 text-xs font-normal text-zinc-400">{total} 张 · 到期 {dueCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索…"
              className="w-40 rounded-lg border border-black/10 px-2.5 py-1.5 text-xs outline-none focus:border-indigo-300"
            />
            <button onClick={openNew} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700">
              + 新增
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-zinc-400">没有匹配的卡片</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {filtered.map((it) => {
              const s = (it.extra?.sm2 as Sm2State) || null;
              const pct = s ? strength(s) : 0;
              return (
                <li key={it.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-zinc-800">{it.title}</span>
                        {it.seeded && <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">预置</span>}
                        {it.tags.map((t) => (
                          <span key={t} className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-500">#{t}</span>
                        ))}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500">{it.body}</p>
                      {s && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1 w-24 overflow-hidden rounded-full bg-zinc-100">
                            <div className="h-full rounded-full bg-indigo-400" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] text-zinc-400">
                            强 {pct}% · 间隔 {s.interval || "—"} 天 · 下次 {describeDue(s)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button onClick={() => openEdit(it)} className="rounded-lg border border-black/10 px-2 py-1 text-[11px] text-zinc-600 transition hover:bg-zinc-50">
                        编辑
                      </button>
                      <button onClick={() => del(it.id)} className="rounded-lg border border-black/10 px-2 py-1 text-[11px] text-red-500 transition hover:bg-red-50">
                        删
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </MemoryShell>
  );
}

/* ---------------- 工具 ---------------- */

/** 取「到期在前、无状态排后」的复习队列；最多 30 张 */
function pickDue(items: MemoryItem[], now = Date.now()): MemoryItem[] {
  const score = (it: MemoryItem): number => {
    const s = (it.extra?.sm2 as Sm2State) || null;
    return s ? (isDue(s, now) ? 0 : 1 + s.due) : 0;
  };
  return [...items].sort((a, b) => score(a) - score(b)).slice(0, 30);
}
