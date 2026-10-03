"use client"

// 全站 C 端埋点接线：初始化 SDK + 自动上报 page_view。
//
// 挂根 layout 即可覆盖所有路由（含 /play/* 全屏游戏台 —— 那里不套 Shell，容易漏埋点）。
// 幂等：initTrack()/wireFlush() 自身只执行一次；autoPageView() 按「会话内同 path 只报一次」去重
// （PRD §4.4 坑 2：React StrictMode 在 dev 会双调用 useEffect）。
//
// ⚠️ LLM 依赖：无。

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { autoPageView, initTrack, wireFlush } from "@/lib/track"

export default function TrackPageView() {
  const pathname = usePathname()

  useEffect(() => {
    initTrack()
    wireFlush()
  }, [])

  useEffect(() => {
    if (pathname) autoPageView()
  }, [pathname])

  return null
}
