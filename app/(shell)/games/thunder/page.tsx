"use client"
// 雷霆战机：C 端包装页（登录墙由 thunder/layout.tsx 挂 RequireAuth，与 /vs 同款）。
// iframe 内嵌 nginx 静态站 /thunder/（alias /var/www/thunder，尾斜杠与 Next 路由 /thunder 天然分流）；
// 游戏本体 480×800 竖版 letterbox 自适应，直接撑满容器即可。
export default function ThunderPage() {
  return (
    <div className="mx-auto flex h-[calc(100dvh-10rem)] max-w-5xl flex-col gap-3 md:h-[calc(100dvh-7.5rem)]">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-800 md:text-2xl">雷霆战机</h1>
          <p className="mt-0.5 text-xs text-zinc-400">纵版弹幕 · 三机体 · 三关六首领</p>
        </div>
        <a href="/thunder/" target="_blank" rel="noreferrer"
          className="shrink-0 rounded-xl border border-black/5 bg-white/70 px-3 py-1.5 text-xs font-medium text-indigo-500 shadow-sm backdrop-blur transition hover:bg-white">
          新窗口打开 ↗
        </a>
      </div>
      <div className="flex-1 overflow-hidden rounded-2xl border border-black/10 bg-black shadow-xl">
        <iframe src="/thunder/" title="雷霆战机" className="h-full w-full border-0" allow="fullscreen" />
      </div>
    </div>
  )
}
