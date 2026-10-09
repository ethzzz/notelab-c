"use client"

/**
 * 四个「记忆型」工具（速查卡 / 摘录盒 / 片段库 / 习惯打卡）共用的说明条。
 * 原先是 MemoryShell 整页头下面的一行提示，2026-10-10 工具搬进主页内容区后单独成件，
 * 让标题归主页顶栏、说明归内容区。
 */

import { KIND_LABEL, type MemoryKind } from "@/lib/memory"

export default function MemoryNotes({ kind }: { kind: MemoryKind }) {
  return (
    <p className="mb-5 rounded-xl border border-black/5 bg-white/70 px-3.5 py-2.5 text-[11px] leading-relaxed text-zinc-500">
      记忆存在这台设备的浏览器里，未登录也能用；登录后可一键同步云端，换设备不丢。当前库里{" "}
      <b className="text-zinc-700">{KIND_LABEL[kind]}</b> 条目见下方列表。
    </p>
  )
}
