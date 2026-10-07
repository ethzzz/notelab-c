"use client"
// 页面级「根背板」：把一个页面的底色刷到 <html> 上。
//
// 为什么需要它（2026-10-07 实测）：
//   globals.css 里有 `html { scrollbar-gutter: stable }`，配合 `::-webkit-scrollbar{width:8px}`
//   + `::-webkit-scrollbar-track{background:transparent}`，根滚动条**恒定预留 8px 槽位**。
//   这条槽在 <body> 盒子之外（body 只有 1272px 宽，视口 1280px），槽里显示的是**画布**，
//   画布颜色由 html/body 的背景传播而来 → 目前落到 body 的浅色 #f5f6fb。
//   浅色页面上看不出来（body 也是浅色），但暗色页面上右侧会多出一条 8px 白缝。
//
// 为什么不能用「本页加一层 fixed inset-0 背板」：
//   实测无效。fixed 定位参照 ICB（不含滚动条槽），槽不在它的覆盖范围内。
//   唯一有效的做法是把 <html> 自身染色（画布来源变了，槽才跟着变）。
//   证据（同一页面注入后探 x=1275 像素，>120 为露白）：
//     对照 251 → 染 html 19（修好）→ fixed 背板 251（无效）。
//
// 用法：useBackdrop("#0b0e13")。卸载时还原，避免暗色泄漏到后续浅色页。
import { useEffect } from "react"

/** 把 <html> 背景设为 color（同时覆盖 --background 变量），卸载时还原原值。 */
export function useBackdrop(color: string) {
  useEffect(() => {
    const html = document.documentElement
    const prevBg = html.style.backgroundColor
    const prevVar = html.style.getPropertyValue("--background")
    const hadVar = prevVar !== ""

    html.style.backgroundColor = color
    // body 的 background 用的是 var(--background)；一并压过去，
    // 否则 body 那 1272px 盒子仍是浅色（本例被页面根 div 盖住，但换页/滚动时更稳）。
    html.style.setProperty("--background", color)

    return () => {
      if (prevBg) html.style.backgroundColor = prevBg
      else html.style.removeProperty("background-color")
      if (hadVar) html.style.setProperty("--background", prevVar)
      else html.style.removeProperty("--background")
    }
  }, [color])
}
