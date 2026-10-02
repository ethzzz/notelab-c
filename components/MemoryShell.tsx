"use client";

/**
 * 四个效率工具共用的外壳：标题 + 记忆种子注入 + 云端同步 + 导出。
 *
 * 设计要点（2026-10-02）：
 *  - 记忆本体永远在 localStorage，云端只是**可选副本**：未登录 / 接口失败一律不报错、不阻断使用。
 *  - 统一的「初始数据」按钮语义 = 灌种子（seedOnce 按 kind:title 去重，不会覆盖你已经改过的条目）。
 *  - 导出按 kind 过滤，四个工具导出各自那一份，不串。
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  KIND_LABEL,
  download,
  isCLogin,
  pushToCloud,
  toJSON,
  toMarkdown,
  type MemoryItem,
  type MemoryKind,
} from "@/lib/memory";
import { ensureSeed } from "@/lib/seed";

interface Props {
  kind: MemoryKind;
  title: string;
  subtitle?: string;
  back?: string;
  /** 右侧操作区（各工具自己的按钮） */
  actions?: ReactNode;
  children: ReactNode;
}

export default function MemoryShell({ kind, title, subtitle, back = "/games", actions, children }: Props) {
  const [seeded, setSeeded] = useState(false);
  const [logged, setLogged] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState("");

  /** 首次挂载：灌种子 + 探登录态 */
  useEffect(() => {
    setSeeded(ensureSeed() === 0);
    // 登录态探测失败也无所谓，只是隐掉同步按钮
    isCLogin().then(setLogged).catch(() => setLogged(false));
  }, []);

  const onSeed = useCallback(() => {
    const n = ensureSeed();
    setMsg(n === 0 ? "初始数据已在库中（不会覆盖你改过的条目）" : `已补入 ${n} 条初始数据`);
    setTimeout(() => setMsg(""), 2400);
  }, []);

  const onSync = useCallback(async () => {
    setSyncing(true);
    const ok = await pushToCloud();
    setSyncing(false);
    setMsg(ok ? "已同步到云端" : "同步失败（记忆仍在本地，不影响使用）");
    setTimeout(() => setMsg(""), 2600);
  }, []);

  const onExportMd = useCallback(() => {
    const items = loadKind(kind);
    if (!items.length) return setMsg("还没有可导出的内容");
    download(`memory-${kind}-${stamp()}.md`, toMarkdown(items));
  }, [kind]);

  const onExportJson = useCallback(() => {
    const items = loadKind(kind);
    if (!items.length) return setMsg("还没有可导出的内容");
    download(`memory-${kind}-${stamp()}.json`, toJSON(items), "application/json;charset=utf-8");
  }, [kind]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-7 md:py-9">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={back} className="mb-1 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700">
            ← 游戏中心
          </Link>
          <h1 className="text-xl font-bold text-zinc-800 md:text-2xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-xs text-zinc-400">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
          {actions}
          <button onClick={onSeed} className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 font-medium text-zinc-600 shadow-sm transition hover:bg-zinc-50">
            初始数据
          </button>
          <button onClick={onExportMd} className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 font-medium text-zinc-600 shadow-sm transition hover:bg-zinc-50">
            导出 MD
          </button>
          <button onClick={onExportJson} className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 font-medium text-zinc-600 shadow-sm transition hover:bg-zinc-50">
            导出 JSON
          </button>
          {logged && (
            <button onClick={onSync} disabled={syncing}
              className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 font-medium text-indigo-500 shadow-sm transition hover:bg-zinc-50 disabled:opacity-50">
              {syncing ? "同步中…" : "同步云端"}
            </button>
          )}
        </div>
      </header>

      <p className="mb-5 rounded-xl border border-black/5 bg-white/70 px-3.5 py-2.5 text-[11px] leading-relaxed text-zinc-500">
        记忆存在这台设备的浏览器里，未登录也能用；登录后可一键同步云端，换设备不丢。
        当前库里 <b className="text-zinc-700">{KIND_LABEL[kind]}</b> 条目见各工具内部列表。
      </p>

      {msg && <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">{msg}</div>}

      {children}
    </div>
  );
}

/* ===================== 模块级小工具（各工具页共用） ===================== */

const ITEM_STORE = "notelab.memory.v1";

/** 读某 kind 的条目（工具页直接调这个，避免各自再写一遍 localStorage 解析） */
export function loadKind(kind: MemoryKind): MemoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ITEM_STORE);
    const items = raw ? (JSON.parse(raw) as { items?: MemoryItem[] }).items : undefined;
    if (!Array.isArray(items)) return [];
    return items.filter((i) => i.kind === kind).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}
