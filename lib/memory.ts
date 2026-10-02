/**
 * 统一「记忆」层 —— 四个效率工具（速查卡 / 摘录盒 / 片段库 / 习惯打卡）共用的地基。
 *
 * 设计口径（2026-10-02 立）：
 *  1. **运行期零大模型依赖**。记忆是结构化数据 + 用户自己的录入，工具逻辑全是本地算法。
 *  2. **本地优先**：数据先落 localStorage，游客不登录也能用；登录后可选「同步到云端」，
 *     复用现成的 `/api/c/game/save`（GameSaveController）通道，**不新造表**。
 *  3. **预置种子**：首次打开时把 lib/seed 里的初始条目灌进本地（用户可增删改、可导出）。
 *     种子由大模型在开发阶段产出并固化成代码常量 —— 见 lib/seed/gen-seed.mjs 的可插拔入口，
 *     将来大模型 key 恢复后重灌第二批不用改任何工具代码。
 *  4. 每个工具通过 `kind` 过滤自己那一份记忆，互不串数据。
 */

export type MemoryKind = "flashcard" | "excerpt" | "snippet" | "habit";

/** 各 kind 的展示名（卡片列表 / 分类标签用） */
export const KIND_LABEL: Record<MemoryKind, string> = {
  flashcard: "速查卡",
  excerpt: "摘录",
  snippet: "片段",
  habit: "习惯",
};

export interface MemoryItem {
  id: string;
  kind: MemoryKind;
  title: string;
  body: string;
  tags: string[];
  /** 创建时间戳（ms） */
  createdAt: number;
  /** 最后修改时间戳（ms） */
  updatedAt: number;
  /** 派生数据：各 kind 自己解释（速查卡的反应时间、摘录的来源、片段的变量表…） */
  extra?: Record<string, unknown>;
  /** 是否为预置种子（界面可标「预置」，但不阻止编辑） */
  seeded?: boolean;
}

/**
 * 种子条目：只描述内容，时间戳入库时统一生成。
 * 四个 seed 文件用它，避免把 createdAt/updatedAt 写成固定值或者在常量里算 Date.now()。
 */
export type SeedItem = Omit<MemoryItem, "createdAt" | "updatedAt">;

const STORE_KEY = "notelab.memory.v1";

/* ============================ 存储 ============================ */

type Store = { items: MemoryItem[]; syncedAt?: number };

function readStore(): Store {
  if (typeof window === "undefined") return { items: [] };
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return { items: [] };
    const parsed = JSON.parse(raw) as Store;
    return Array.isArray(parsed?.items) ? parsed : { items: [] };
  } catch {
    // 坏数据不要命，退回空库
    return { items: [] };
  }
}

function writeStore(s: Store): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    // 配额满（摘录多的时候会）→ 静默失败，界面层会有 toast 提示
  }
}

/* ============================ 基础 CRUD ============================ */

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 读某 kind 的全部条目，按最近修改在前排 */
export function listByKind(kind: MemoryKind): MemoryItem[] {
  return readStore()
    .items.filter((it) => it.kind === kind)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getItem(id: string): MemoryItem | null {
  return readStore().items.find((it) => it.id === id) || null;
}

export interface UpsertInput {
  id?: string;
  kind: MemoryKind;
  title: string;
  body: string;
  tags?: string[];
  extra?: Record<string, unknown>;
}

export function upsert(input: UpsertInput): MemoryItem {
  const store = readStore();
  const now = Date.now();
  if (input.id) {
    const i = store.items.findIndex((it) => it.id === input.id);
    if (i >= 0) {
      const next: MemoryItem = {
        ...store.items[i],
        title: input.title,
        body: input.body,
        tags: input.tags ?? store.items[i].tags,
        extra: input.extra ?? store.items[i].extra,
        updatedAt: now,
      };
      store.items[i] = next;
      writeStore(store);
      return next;
    }
  }
  const item: MemoryItem = {
    id: input.id || newId(),
    kind: input.kind,
    title: input.title,
    body: input.body,
    tags: input.tags ?? [],
    createdAt: now,
    updatedAt: now,
    extra: input.extra,
    seeded: false,
  };
  store.items.push(item);
  writeStore(store);
  return item;
}

export function remove(id: string): void {
  const store = readStore();
  store.items = store.items.filter((it) => it.id !== id);
  writeStore(store);
}

/** 精确同步：以远端为准整体替换本地 items（云端同步用） */
export function replaceAll(items: MemoryItem[]): void {
  writeStore({ items, syncedAt: Date.now() });
}

export function countByKind(): Record<MemoryKind, number> {
  const items = readStore().items;
  const out = { flashcard: 0, excerpt: 0, snippet: 0, habit: 0 } as Record<MemoryKind, number>;
  for (const it of items) if (out[it.kind] !== undefined) out[it.kind] += 1;
  return out;
}

/* ============================ 全文检索 ============================ */

export function search(items: MemoryItem[], q: string): MemoryItem[] {
  const kw = q.trim().toLowerCase();
  if (!kw) return items;
  return items.filter(
    (it) =>
      it.title.toLowerCase().includes(kw) ||
      it.body.toLowerCase().includes(kw) ||
      it.tags.some((t) => t.toLowerCase().includes(kw)),
  );
}

/* ============================ 种子注入 ============================ */

export function seedOnce(items: MemoryItem[]): number {
  const store = readStore();
  const have = new Set(store.items.map((it) => `${it.kind}:${it.title}`));
  let added = 0;
  for (const s of items) {
    const key = `${s.kind}:${s.title}`;
    if (have.has(key)) continue;
    const now = Date.now();
    store.items.push({
      id: s.id || newId(),
      kind: s.kind,
      title: s.title,
      body: s.body,
      tags: s.tags ?? [],
      createdAt: now,
      updatedAt: now,
      extra: s.extra,
      seeded: true,
    });
    have.add(key);
    added += 1;
  }
  if (added) writeStore(store);
  return added;
}

/* ============================ 导出 ============================ */

export function toMarkdown(items: MemoryItem[]): string {
  const head = `# 记忆导出 · ${new Date().toLocaleDateString("zh-CN")}\n\n`;
  return (
    head +
    items.map((it) => {
      const tag = it.tags.length ? ` \`${it.tags.map((t) => `#${t}`).join("` `")}\`` : "";
      return `## ${it.title}${tag}\n\n${it.body}\n`;
    }).join("\n---\n\n")
  );
}

export function toJSON(items: MemoryItem[]): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), count: items.length, items }, null, 2);
}

/** 下载为文件（浏览器端） */
export function download(filename: string, content: string, mime = "text/markdown;charset=utf-8"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ============================ 云端同步（可选） ============================ */

/**
 * 登录可选的记忆云同步。复用 C 端通用存档通道 `/api/c/game/save`，不新造表。
 * ⚠️ 未登录 / 接口失败一律静默返回 false —— 记忆本体永远在 localStorage，云端只是副本。
 */
export async function pushToCloud(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const items = readStore().items;
  try {
    const r = await fetch("/api/c/game/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // C 端会话 cookie 会自动带；未被 PermGuard 拦的前提是未登录接口也放行
      },
      body: JSON.stringify({ game: "memory", version: 1, data: { items } }),
    });
    if (!r.ok) return false;
    writeStore({ items, syncedAt: Date.now() });
    return true;
  } catch {
    return false;
  }
}

export async function pullFromCloud(): Promise<MemoryItem[] | null> {
  if (typeof window === "undefined") return null;
  try {
    const r = await fetch("/api/c/game/save?game=memory", { method: "GET" });
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: { items?: MemoryItem[] } | null };
    const items = j?.data?.items;
    return Array.isArray(items) ? items : null;
  } catch {
    return null;
  }
}

/** 是否已登录（用于决定要不要显示「同步到云端」按钮） */
export async function isCLogin(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const r = await fetch("/api/c/auth/me", { cache: "no-store" });
    if (!r.ok) return false;
    const j = (await r.json()) as { username?: string };
    return Boolean(j?.username);
  } catch {
    return false;
  }
}
