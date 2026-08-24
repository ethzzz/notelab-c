"use client"
import { useEffect, useRef, useState } from "react"

/**
 * TypingText —— AI 回复打字机公共组件（流式场景复用）
 * - text：目标文本，可随 stream 增量变长；组件持续打字、不会重置
 * - done：目标文本是否已停止增长（流结束）；结束后适度加速收尾
 * - 速率随积压自适应：积压少 → 从容逐字；积压多 → 自动提速追赶，
 *   避免"模型早答完了字还在慢慢爬"
 * - onFinished：全部打完回调；onTick：每步回调（可用于跟随滚动）
 */
export default function TypingText({ text, done = false, onFinished, onTick, cursor = true, className = "" }: {
  text: string
  done?: boolean
  onFinished?: () => void
  onTick?: () => void
  cursor?: boolean
  className?: string
}) {
  const [shownLen, setShownLen] = useState(0)
  const propsRef = useRef({ text, done })
  propsRef.current.text = text
  propsRef.current.done = done
  const cbRef = useRef({ onFinished, onTick })
  cbRef.current.onFinished = onFinished
  cbRef.current.onTick = onTick

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | null = null
    let len = 0
    let finishedNotified = false
    const tick = () => {
      if (!alive) return
      const { text: t, done: d } = propsRef.current
      if (len >= t.length) {
        if (d) {
          if (!finishedNotified) { finishedNotified = true; cbRef.current.onFinished?.() }
          return
        }
        timer = setTimeout(tick, 120) // 等待新的流式文本
        return
      }
      const backlog = t.length - len
      let step = 1, delay = 26
      if (backlog > 40) { step = 2; delay = 20 }
      if (backlog > 120) { step = 4; delay = 14 }
      if (backlog > 300) { step = 10; delay = 10 }
      if (d) delay = Math.max(8, Math.floor(delay * 0.6)) // 流已收尾，加快写完
      len = Math.min(t.length, len + step)
      setShownLen(len)
      cbRef.current.onTick?.()
      timer = setTimeout(tick, delay)
    }
    tick()
    return () => { alive = false; if (timer) clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const typing = shownLen < text.length || !done
  return (
    <span className={className}>
      {text.slice(0, shownLen)}
      {cursor && typing && <span className="typing-cursor" />}
    </span>
  )
}

/** SkeletonText —— 等待 AI 回复的骨架屏（灰色流光条） */
export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  const widths = ["w-11/12", "w-full", "w-4/5", "w-2/3", "w-5/6"]
  return (
    <div className={`flex flex-col gap-2 py-1 w-48 ${className}`} aria-busy="true" aria-label="AI 正在思考">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i}
          className={`h-3 rounded-full bg-zinc-300/80 animate-pulse ${widths[i % widths.length]}`}
          style={{ animationDelay: `${i * 130}ms` }} />
      ))}
    </div>
  )
}