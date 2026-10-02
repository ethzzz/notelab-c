import type { SeedItem } from "@/lib/memory";

/**
 * 习惯定义种子。打卡日志另存（不塞进 MemoryItem，避免 body 被列表渲染污染）：
 *   localStorage key = notelab.habits.log.v1  → { "2026-10-02": { mood: 3, note: "" } }
 * 习惯本身走统一记忆层 kind='habit'，这样四个工具共用同一套 CRUD / 导出 / 云同步。
 */
export const SEED_HABITS: SeedItem[] = [
  {
    id: "hb-001",
    kind: "habit",
    title: "review 速查卡",
    body: "每天刷 15 张卡，优先补间隔到期项（SM-2 里 interval 已达上限还要重排的）。",
    tags: ["学习", "daily"],
    extra: { target: 15, color: "#6366f1", icon: "🃏" },
  },
  {
    id: "hb-002",
    kind: "habit",
    title: "写 RECORD 记录",
    body: "收工前在当天记忆日志追加三行：做了什么 / 踩了什么坑 / 明天第一件事。",
    tags: ["复盘", "daily"],
    extra: { target: 1, color: "#0ea5e9", icon: "📝" },
  },
  {
    id: "hb-003",
    kind: "habit",
    title: "身体活动",
    body: "至少 30 分钟走动或拉伸，久坐超过 90 分钟就起来一次。",
    tags: ["健康", " daily"],
    extra: { target: 30, color: "#10b981", icon: "🚶" },
  },
  {
    id: "hb-004",
    kind: "habit",
    title: "部署前备份检查",
    body: "任何改动生产库结构、或要 ssh 改服务器文件的操作，先确认备份已落 /root/backups/。",
    tags: ["纪律", " daily"],
    extra: { target: 1, color: "#f59e0b", icon: "🛟" },
  },
];

export default SEED_HABITS;
