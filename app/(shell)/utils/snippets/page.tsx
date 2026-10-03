"use client";

/**
 * 模板 / 片段库（/utils/snippets）
 *
 * 变量用 {{name}} 占位，界面自动抽出输入框批量插值，一键复制到剪贴板。
 * 运行期零大模型依赖：片段是预置种子 + 自己攒的，预置这批是我（大模型）在开发阶段直接产出的常量。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import MemoryShell, { loadKind } from "@/components/MemoryShell";
import { upsert, remove, search, newId, type MemoryItem } from "@/lib/memory";
import { extractVars, interpolate, SNIPPET_DEFAULTS } from "@/lib/seed/snippets";

export default function SnippetsPage() {
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [q, setQ] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [draft, setDraft] = useState({ id: "", title: "", body: "", tags: "" });
  const [copied, setCopied] = useState("");
  /** itemId → { 变量名: 值 } */
  const [vars, setVars] = useState<Record<string, Record<string, string>>>({});

  const reload = useCallback(() => setItems(loadKind("snippet")), []);

  useEffect(() => {
    reload();
    setOpenForm(false);
  }, [reload]);

  const tagStats = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) for (const t of it.tags) m.set(t, (m.get(t) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const filtered = useMemo(() => {
    const base = search(items, q);
    return tagFilter ? base.filter((it) => it.tags.includes(tagFilter)) : base;
  }, [items, q, tagFilter]);

  // ⚠️ 变量表必须**逐卡独立**（按 itemId 分桶）：早期版本绑在 filtered[0] 上，
  // 复制第二张卡时会拿第一张卡填的变量去插值，复制出来是错的。
  const setVar = useCallback((id: string, k: string, v: string) => {
    setVars((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [k]: v } }));
  }, []);
  // 没有手动填过就回落到 seed 里的默认值 —— 否则点「复制」拿到的是 {{repo}} 字面量
  const varsOf = useCallback(
    (id: string, body: string, defaults?: Record<string, string>): Record<string, string> => {
      const bucket = vars[id] || {};
      const out: Record<string, string> = {};
      for (const k of extractVars(body)) out[k] = bucket[k] ?? defaults?.[k] ?? "";
      return out;
    },
    [vars],
  );

  const save = () => {
    const title = draft.title.trim();
    const body = draft.body.trim();
    if (!title || !body) return;
    upsert({
      id: draft.id || undefined,
      kind: "snippet",
      title,
      body,
      tags: draft.tags
        .split(/[\s,，]+/)
        .map((t) => t.trim())
        .filter(Boolean),
    });
    setOpenForm(false);
    setDraft({ id: "", title: "", body: "", tags: "" });
    reload();
  };

  const openNew = () => {
    setDraft({ id: "", title: "", body: "", tags: "" });
    setOpenForm(true);
  };

  const openEdit = (it: MemoryItem) => {
    setDraft({ id: it.id, title: it.title, body: it.body, tags: it.tags.join(" ") });
    setOpenForm(true);
  };

  const copy = async (it: MemoryItem) => {
    const text = interpolate(it.body, varsOf(it.id, it.body, SNIPPET_DEFAULTS[it.id]), SNIPPET_DEFAULTS[it.id]);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(it.title);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      // 非 HTTPS / 无权限时降级到 textarea + execCommand
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(it.title);
      setTimeout(() => setCopied(""), 1800);
    }
  };

  const del = (id: string) => {
    remove(id);
    reload();
  };

  return (
    <MemoryShell
      kind="snippet"
      title="🧩 模板 / 片段库"
      subtitle="{{变量}} 自动抽成输入框 · 一键复制 · 本地全文搜索"
    >
      {openForm && (
        <section className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700">{draft.id ? "编辑片段" : "新增片段"}</h2>
          <input
            value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="片段名（如：git 拉齐服务器代码）"
            className="mb-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-300"
          />
          <textarea
            value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            rows={7} placeholder="片段内容。需要填的地方写 {{变量名}}，例如 cd {{repo}}"
            className="mb-2 w-full resize-y rounded-xl border border-black/10 bg-white px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:border-indigo-300"
          />
          <input
            value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
            placeholder="标签，空格分隔（如：Git 部署）"
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

      {!openForm && (
        <section className="mb-6 flex flex-wrap items-center gap-2">
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索片段名 / 内容 / 标签"
            className="w-56 rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-indigo-300"
          />
          <button onClick={openNew} className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-white transition hover:bg-zinc-700">
            + 加片段
          </button>
          <span className="text-xs text-zinc-400">{filtered.length} / {items.length}</span>
        </section>
      )}

      <section className="flex gap-5">
        {tagStats.length > 0 && (
          <aside className="hidden w-32 shrink-0 sm:block">
            <div className="sticky top-6 space-y-1">
              <div className="mb-2 text-[11px] font-semibold text-zinc-400">标签</div>
              <button
                onClick={() => setTagFilter("")}
                className={`block w-full rounded-lg px-2 py-1 text-left text-xs transition ${
                  tagFilter === "" ? "bg-indigo-50 font-medium text-indigo-600" : "text-zinc-500 hover:bg-zinc-50"
                }`}
              >
                全部 {items.length}
              </button>
              {tagStats.map(([t, n]) => (
                <button
                  key={t} onClick={() => setTagFilter(tagFilter === t ? "" : t)}
                  className={`block w-full rounded-lg px-2 py-1 text-left text-xs transition ${
                    tagFilter === t ? "bg-indigo-50 font-medium text-indigo-600" : "text-zinc-500 hover:bg-zinc-50"
                  }`}
                >
                  #{t} <span className="text-zinc-400">{n}</span>
                </button>
              ))}
            </div>
          </aside>
        )}

        <div className="min-w-0 flex-1 space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-black/10 bg-white p-8 text-center shadow-sm">
              <p className="mb-3 text-sm text-zinc-500">
                {items.length === 0 ? "片段库还是空的。" : "没有匹配的片段。"}
              </p>
              {items.length === 0 && (
                <button onClick={openNew} className="rounded-xl bg-indigo-500 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-600">
                  加第一个片段
                </button>
              )}
              {items.length === 0 && (
                <p className="mt-3 text-[11px] text-zinc-400">也可以点右上角「初始数据」灌入一批预置命令片段</p>
              )}
            </div>
          ) : (
            filtered.map((it) => {
              const names = extractVars(it.body);
              return (
                <article key={it.id} className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-zinc-800">{it.title}</h3>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {it.tags.map((t) => (
                          <span key={t} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-500">#{t}</span>
                        ))}
                        {names.length > 0 && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">
                            {names.length} 个变量
                          </span>
                        )}
                      </div>
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

                  {/* 变量填充区 */}
                  {names.length > 0 && (
                    <div className="mt-3 grid gap-2 rounded-xl bg-zinc-50 p-3 sm:grid-cols-2">
                      {names.map((k) => (
                        <label key={k} className="block">
                          <span className="mb-1 block font-mono text-[10px] text-zinc-400">{`{{${k}}}`}</span>
                          <input
                            value={varsOf(it.id, it.body)[k] ?? ""}
                            onChange={(e) => setVar(it.id, k, e.target.value)}
                            className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 font-mono text-xs outline-none focus:border-indigo-300"
                          />
                        </label>
                      ))}
                    </div>
                  )}

                  <pre className="mt-3 overflow-x-auto rounded-xl bg-zinc-900 px-3.5 py-3 font-mono text-[11px] leading-relaxed text-zinc-100">
                    {interpolate(it.body, varsOf(it.id, it.body, SNIPPET_DEFAULTS[it.id]), SNIPPET_DEFAULTS[it.id])}
                  </pre>

                  <div className="mt-3 flex items-center gap-2">
                    <button onClick={() => copy(it)} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700">
                      复制
                    </button>
                    {copied === it.title && <span className="text-[11px] text-emerald-600">已复制 ✓</span>}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </MemoryShell>
  );
}
