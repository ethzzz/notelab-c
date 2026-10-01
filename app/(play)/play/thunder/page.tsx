"use client"
// 雷霆战机：C 端包装页（登录墙由 thunder/layout.tsx 挂 RequireAuth，与 /vs 同款）。
// iframe 内嵌 nginx 静态站 /thunder/（alias /var/www/thunder，尾斜杠与 Next 路由 /thunder 天然分流）；
// 游戏本体 480×800 竖版 letterbox 自适应，直接撑满容器即可。
export default function ThunderPage() {
  // ⚠️ 2026-10-01：全屏游戏台下不再留页内标题行（原来 h1 + 副标题要吃掉约 60px，
  //    iframe 只吃到 93% 高度）。「新窗口打开」改挂到 iframe 右下角浮标，不占文档流高度。
  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-black/10 bg-black shadow-xl">
      <iframe src="/thunder/" title="雷霆战机" className="h-full w-full border-0" allow="fullscreen" />
      <a href="/thunder/" target="_blank" rel="noreferrer"
        className="absolute bottom-3 right-3 z-10 rounded-xl border border-black/5 bg-white/70 px-3 py-1.5 text-xs font-medium text-indigo-500 shadow-sm backdrop-blur transition hover:bg-white">
        新窗口打开 ↗
      </a>
    </div>
  )
}
