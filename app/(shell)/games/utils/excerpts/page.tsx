"use client";

/**
 * 知识摘录盒（/games/utils/excerpts）
 *
 * 记忆本体：kind='excerpt'，带 tag + 本地全文检索 + Markdown/JSON 导出。
 * 运行期零大模型依赖 —— 摘录是你自己记的，将来 RAG 恢复可直接拿这份语料喂。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import MemoryShell, { loadKind } from "@/components/MemoryShell";
import { upsert, remove, search, toMarkdown, toJSON, type MemoryItem } from "@/lib/memory";

export default function ExcerptsPage() {
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [q, setQ] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [draft, setDraft] = useState({ id: "", title: "", body: "", tags: "", source: "" });
  const [tagFilter, setTagFilter] = useState("");

  const reload = useCallback(() => setItems(loadKind("excerpt")), []);

  useEffect(() => {
    reload();
    setOpenForm(false);
  }, [reload]);

  /** 全部 tag 的词频，用于侧栏过滤 */
  const tagStats = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) for (const t of it.tags) m.set(t, (m.get(t) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const filtered = useMemo(() => {
    const base = search(items, q);
    return tagFilter ? base.filter((it) => it.tags.includes(tagFilter)) : base;
  }, [items, q, tagFilter]);

  const save = () => {
    const title = draft.title.trim();
    const body = draft.body.trim();
    if (!title || !body) return;
    upsert({
      id: draft.id || undefined,
      kind: "excerpt",
      title,
      body,
      tags: draft.tags
        .split(/[\s,，]+/)
        .map((t) => t.trim())
        .filter(Boolean),
      extra: draft.source.trim() ? { source: draft.source.trim() } : undefined,
    });
    setOpenForm(false);
    setDraft({ id: "", title: "", body: "", tags: "", source: "" });
    reload();
  };

  const openNew = () => {
    setDraft({ id: "", title: "", body: "", tags: "", source: "" });
    setOpenForm(true);
  };

  const openEdit = (it: MemoryItem) => {
    setDraft({
      id: it.id,
      title: it.title,
      body: it.body,
      tags: it.tags.join(" "),
      source: (it.extra?.source as string) || "",
    });
    setOpenForm(true);
  };

  const del = (id: string) => {
    remove(id);
    reload();
  };

  return (
    <MemoryShell
      kind="excerpt"
      title="📦 知识摘录盒"
      subtitle="摘一段原文 → 打 tag → 本地全文检索 → 导出 Markdown / JSON"
    >
      {openForm && (
        <section className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700">{draft.id ? "编辑这条摘录" : "新增摘录"}</h2>
          <input
            value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="标题 / 一句话结论"
            className="mb-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-300"
          />
          <textarea
            value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            rows={6} placeholder="正文（可多行）"
            className="mb-2 w-full resize-y rounded-xl border border-black/10 bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-indigo-300"
          />
          <div className="mb-3 grid gap-2 sm:grid-cols-2">
            <input
              value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
              placeholder="标签，空格分隔"
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-300"
            />
            <input
              value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })}
              placeholder="来源（书 / 文章 / 文档名，可不填）"
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-300"
            />
          </div>
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
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="全文搜索（标题 / 正文 / 标签）"
            className="w-56 rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-indigo-300"
          />
          <button onClick={openNew} className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-white transition hover:bg-zinc-700">
            + 摘一条
          </button>
          <span className="text-xs text-zinc-400">{filtered.length} / {items.length}</span>
        </section>
      )}

      <section className="flex gap-5">
        {/* 标签侧栏 */}
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

        {/* 卡片列表 */}
        <div className="min-w-0 flex-1 space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-black/10 bg-white p-8 text-center shadow-sm">
              <p className="mb-3 text-sm text-zinc-500">
                {items.length === 0 ? "摘录盒还是空的。" : "没有匹配的摘录。"}
              </p>
              {items.length === 0 && (
                <button onClick={openNew} className="rounded-xl bg-indigo-500 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-600">
                  摘第一条
                </button>
              )}
              {items.length === 0 && (
                <p className="mt-3 text-[11px] text-zinc-400">
                  也可以点右上角「初始数据」灌入一批预置工程笔记
                </p>
              )}
            </div>
          ) : (
            filtered.map((it) => (
              <article key={it.id} className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 flex-1 text-sm font-semibold text-zinc-800">{it.title}</h3>
                  <div className="flex shrink-0 gap-1.5">
                    <button onClick={() => openEdit(it)} className="rounded-lg border border-black/10 px-2 py-1 text-[11px] text-zinc-600 transition hover:bg-zinc-50">
                      编辑
                    </button>
                    <button onClick={() => del(it.id)} className="rounded-lg border border-black/10 px-2 py-1 text-[11px] text-red-500 transition hover:bg-red-50">
                      删
                    </button>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-600">{it.body}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {it.tags.map((t) => (
                    <span key={t} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] text-indigo-500">#{t}</span>
                  ))}
                  {it.extra?.source && (
                    <span className="text-[10px] text-zinc-400">来源：{it.extra.source as string}</span>
                  )}
                  <span className="ml-auto text-[10px] text-zinc-400">
                    {new Date(it.updatedAt).toLocaleDateString("zh-CN")}
                  </span>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </MemoryShell>
  );
}
