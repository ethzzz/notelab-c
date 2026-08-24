import type { CSSProperties } from "react"

// 背景主题预设：每个主题 = 一组可直接应用到 <main> 的背景样式
// 选中后以 { theme: id } 形式存入 /api/ui-config 的 background（后端原样透传，无需改 Java）
export type Theme = {
  id: string
  name: string
  emoji: string
  desc: string
  dark?: boolean // 深色主题：外壳文字需反色适配
  style: CSSProperties
}

export const THEMES: Theme[] = [
  { id: "default", name: "默认灰", emoji: "⚪", desc: "原版简约灰白背景", style: { backgroundColor: "#f6f7f9" } },
  { id: "ocean", name: "海风蓝", emoji: "🌊", desc: "清爽蓝色渐变", style: { backgroundImage: "linear-gradient(135deg,#e0f2fe 0%,#dbeafe 45%,#e0e7ff 100%)", backgroundAttachment: "fixed" } },
  { id: "sunset", name: "落日橙", emoji: "🌇", desc: "温暖橙粉渐变", style: { backgroundImage: "linear-gradient(135deg,#fff7ed 0%,#ffedd5 50%,#ffe4e6 100%)", backgroundAttachment: "fixed" } },
  { id: "forest", name: "森林绿", emoji: "🌲", desc: "自然清新绿渐变", style: { backgroundImage: "linear-gradient(160deg,#ecfdf5 0%,#dcfce7 55%,#f7fee7 100%)", backgroundAttachment: "fixed" } },
  { id: "sakura", name: "樱花粉", emoji: "🌸", desc: "甜美粉紫渐变", style: { backgroundImage: "linear-gradient(135deg,#fdf2f8 0%,#fce7f3 50%,#fae8ff 100%)", backgroundAttachment: "fixed" } },
  { id: "violet", name: "梦幻紫", emoji: "🔮", desc: "紫蓝梦幻渐变", style: { backgroundImage: "linear-gradient(135deg,#f5f3ff 0%,#ede9fe 50%,#e0e7ff 100%)", backgroundAttachment: "fixed" } },
  { id: "starry", name: "星空", emoji: "🌌", desc: "暮光星野，星点闪烁", style: {
    backgroundImage: "radial-gradient(1px 1px at 25% 15%, rgba(255,255,255,0.95) 50%, transparent 51%), radial-gradient(1.5px 1.5px at 65% 45%, rgba(255,255,255,0.9) 50%, transparent 51%), radial-gradient(1px 1px at 85% 25%, rgba(255,255,255,0.95) 50%, transparent 51%), radial-gradient(2px 2px at 45% 75%, rgba(255,255,255,0.85) 50%, transparent 51%), radial-gradient(1px 1px at 10% 60%, rgba(255,255,255,0.8) 50%, transparent 51%), radial-gradient(1.5px 1.5px at 90% 80%, rgba(255,255,255,0.85) 50%, transparent 51%), radial-gradient(circle at 82% 8%, rgba(255,255,255,0.65), transparent 38%), linear-gradient(160deg, #e0e7ff 0%, #c7d2fe 38%, #ddd6fe 72%, #fce7f3 100%)",
    backgroundSize: "260px 260px, 340px 340px, 300px 300px, 420px 420px, 380px 380px, 460px 460px, 100% 100%, 100% 100%",
    backgroundAttachment: "fixed",
  } },
  { id: "starrynight", name: "深色星空", emoji: "🌃", desc: "深邃夜幕，繁星与星云微光", dark: true, style: {
    backgroundImage: "radial-gradient(1px 1px at 20% 12%, rgba(255,255,255,0.95) 50%, transparent 51%), radial-gradient(1.5px 1.5px at 60% 35%, rgba(255,255,255,0.9) 50%, transparent 51%), radial-gradient(1px 1px at 82% 20%, rgba(255,255,255,0.95) 50%, transparent 51%), radial-gradient(2px 2px at 42% 68%, rgba(255,255,255,0.8) 50%, transparent 51%), radial-gradient(1px 1px at 8% 55%, rgba(255,255,255,0.75) 50%, transparent 51%), radial-gradient(1.5px 1.5px at 92% 75%, rgba(255,255,255,0.85) 50%, transparent 51%), radial-gradient(1px 1px at 35% 88%, rgba(255,255,255,0.7) 50%, transparent 51%), radial-gradient(1px 1px at 70% 58%, rgba(255,255,255,0.8) 50%, transparent 51%), radial-gradient(1.5px 1.5px at 50% 8%, rgba(255,255,255,0.85) 50%, transparent 51%), radial-gradient(1px 1px at 15% 30%, rgba(255,255,255,0.7) 50%, transparent 51%), radial-gradient(circle at 78% 12%, rgba(147,197,253,0.22), transparent 42%), radial-gradient(circle at 12% 82%, rgba(167,139,250,0.18), transparent 45%), radial-gradient(circle at 55% 45%, rgba(56,189,248,0.08), transparent 55%), linear-gradient(160deg, #0b1026 0%, #141a3a 40%, #1a1440 70%, #0d0d2b 100%)",
    backgroundSize: "260px 260px, 340px 340px, 300px 300px, 420px 420px, 380px 380px, 460px 460px, 320px 320px, 400px 400px, 360px 360px, 300px 300px, 100% 100%, 100% 100%, 100% 100%, 100% 100%",
    backgroundAttachment: "fixed",
  } },
  { id: "dark", name: "暗黑", emoji: "🌑", desc: "纯净深色，护眼专注", dark: true, style: {
    backgroundImage: "radial-gradient(circle at 18% 0%, rgba(99,102,241,0.12), transparent 42%), radial-gradient(circle at 85% 100%, rgba(139,92,246,0.10), transparent 45%), linear-gradient(160deg, #0a0a10 0%, #0e0e16 45%, #121218 100%)",
    backgroundAttachment: "fixed",
  } },
  { id: "tech", name: "科技矩阵", emoji: "⚡", desc: "青蓝电路网格，HUD 科技感", style: {
    backgroundImage: "radial-gradient(circle at 12% 12%, rgba(34,211,238,0.28), transparent 42%), radial-gradient(circle at 88% 85%, rgba(59,130,246,0.22), transparent 45%), radial-gradient(2px 2px at 30% 40%, rgba(14,165,233,0.5) 50%, transparent 51%), linear-gradient(rgba(14,165,233,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(14,165,233,0.09) 1px, transparent 1px), linear-gradient(135deg, #f0fdff 0%, #e3f8fd 45%, #e6f2fd 100%)",
    backgroundSize: "100% 100%, 100% 100%, 320px 320px, 28px 28px, 28px 28px, 100% 100%",
    backgroundAttachment: "fixed",
  } },
  { id: "cyber", name: "赛博霓虹", emoji: "🌆", desc: "粉青霓虹网格，蒸汽波暮色", style: {
    backgroundImage: "radial-gradient(circle at 80% 12%, rgba(217,70,239,0.22), transparent 40%), radial-gradient(circle at 15% 85%, rgba(34,211,238,0.25), transparent 42%), radial-gradient(circle at 50% 50%, rgba(167,139,250,0.12), transparent 55%), linear-gradient(rgba(217,70,239,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.10) 1px, transparent 1px), linear-gradient(160deg, #fdf4ff 0%, #fae8ff 35%, #e8f7fe 70%, #cffafe 100%)",
    backgroundSize: "100% 100%, 100% 100%, 100% 100%, 30px 30px, 30px 30px, 100% 100%",
    backgroundAttachment: "fixed",
  } },
  { id: "anime", name: "动漫天空", emoji: "🌸", desc: "新海诚式暮色天空与云", style: {
    backgroundImage: "radial-gradient(circle at 72% 18%, rgba(255,237,213,0.95), rgba(255,237,213,0) 32%), radial-gradient(ellipse 45% 22% at 25% 30%, rgba(255,255,255,0.75), transparent 70%), radial-gradient(ellipse 50% 20% at 70% 55%, rgba(255,255,255,0.6), transparent 70%), radial-gradient(ellipse 40% 18% at 40% 75%, rgba(255,255,255,0.5), transparent 70%), linear-gradient(180deg, #dbeafe 0%, #e9d5ff 35%, #fce7f3 65%, #ffedd5 100%)",
    backgroundAttachment: "fixed",
  } },
  { id: "aurora", name: "极光", emoji: "✨", desc: "薄荷绿极光绸带", style: {
    backgroundImage: "radial-gradient(ellipse 80% 40% at 20% 10%, rgba(52,211,153,0.28), transparent 60%), radial-gradient(ellipse 70% 35% at 75% 20%, rgba(34,211,238,0.25), transparent 60%), radial-gradient(ellipse 90% 40% at 50% 45%, rgba(167,139,250,0.20), transparent 65%), linear-gradient(150deg, #f0fdfa 0%, #ecfeff 40%, #f0f9ff 70%, #f5f3ff 100%)",
    backgroundAttachment: "fixed",
  } },
  { id: "grid", name: "网格纸", emoji: "📐", desc: "坐标网格纸，学习感", style: { backgroundColor: "#f8fafc", backgroundImage: "linear-gradient(#e2e8f0 1px,transparent 1px),linear-gradient(90deg,#e2e8f0 1px,transparent 1px)", backgroundSize: "24px 24px", backgroundAttachment: "fixed" } },
  { id: "paper", name: "暖纸", emoji: "📜", desc: "温暖纸张色，柔和护眼", style: { backgroundColor: "#faf5ea" } },
]

export function themeById(id: string | undefined | null): Theme | undefined {
  return THEMES.find((t) => t.id === id)
}

// background 配置对象 -> 主内容区背景样式。优先级：主题 > 自定义背景图 > 自定义颜色
export function resolveBgStyle(bg: any): CSSProperties {
  const t = themeById(bg?.theme)
  if (t) return t.style
  if (bg?.type === "image" && bg.image_url) {
    return { backgroundImage: `url(${bg.image_url})`, backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed", backgroundColor: "#f6f7f9" }
  }
  return { backgroundColor: bg?.color || "#f6f7f9" }
}
