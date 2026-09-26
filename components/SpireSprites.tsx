"use client"

// —— 尖塔形象精灵：全部内联 SVG（几何堆叠 + 纵向渐变体现体积 + 细描边），与地图线图标语言统一 ——
// 资源约束：无外链图片 / 无 emoji 主形象 / 无第三方图标库 / 无受版权素材。
// 每个精灵绘制在 100×100 画布内，脚下自带投影椭圆（站在地面感）；待机浮动由调用方加 CSS 动画。
// 找不到对应 id 时组件返回 null，由调用方回退显示原 emoji（健壮性）。

import type { ReactNode } from "react"
import { charArtUrl } from "@/lib/spire-assets"

/** 两段纵向渐变（用于体积感），id 必须全局唯一 */
const lg = (id: string, c1: string, c2: string) => (
  <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stopColor={c1} />
    <stop offset="1" stopColor={c2} />
  </linearGradient>
)

/** 脚下投影 */
const Ground = ({ rx = 22, ry = 4.5 }: { rx?: number; ry?: number }) => (
  <ellipse cx="50" cy="93" rx={rx} ry={ry} fill="rgba(0,0,0,.5)" stroke="none" />
)

// ---------------- 玩家角色 ----------------
const blade = (
  <>
    <defs>{lg("spr-blade-body", "#3d4c7d", "#1b2340")}{lg("spr-blade-head", "#3b4878", "#232c50")}</defs>
    <Ground />
    {/* 腿 */}
    <path d="M42 72 L39 90 L47 90 L48 74 Z" fill="#1a1f38" />
    <path d="M56 72 L59 90 L51 90 L50 74 Z" fill="#1a1f38" />
    {/* 身体 */}
    <path d="M38 42 C 36 56 34 68 36 76 L64 76 C 66 68 64 56 62 42 Z" fill="url(#spr-blade-body)" />
    {/* 飘动的围巾：画在身体之上才看得见（浅色提亮，否则深底上糊成一片） */}
    <path d="M42 42 C 30 46 20 42 12 33 C 22 40 32 38 40 40 Z" fill="#6ea8d8" />
    <path d="M40 45 C 30 50 22 49 14 43 C 24 50 32 51 39 47 Z" fill="#4b7fae" />
    {/* 腰带 */}
    <path d="M36 62 L64 62" stroke="#8fb6ff" strokeWidth="2" />
    {/* 手臂 */}
    <path d="M39 46 C 33 52 29 58 28 64" stroke="#222a4d" strokeWidth="6" />
    <path d="M61 46 C 67 52 71 58 72 64" stroke="#222a4d" strokeWidth="6" />
    {/* 头兜 */}
    <circle cx="50" cy="30" r="14" fill="url(#spr-blade-head)" />
    <path d="M36 30 C 36 18 44 12 50 12 C 56 12 64 18 64 30 C 58 26 42 26 36 30 Z" fill="#39477a" />
    {/* 眼缝 */}
    <path d="M43 30 L48 30 M52 30 L57 30" stroke="#7ff0ff" strokeWidth="3" />
    {/* 反握双刃：刃尖朝外下 */}
    <path d="M28 63 L15 74 L20 79 L32 68 Z" fill="#cfe3ff" stroke="#5b6b8f" />
    <path d="M72 63 L85 74 L80 79 L68 68 Z" fill="#cfe3ff" stroke="#5b6b8f" />
  </>
)

const guard = (
  <>
    <defs>{lg("spr-guard-body", "#7c8798", "#3d4553")}{lg("spr-guard-shield", "#cbd6e4", "#7d8899")}</defs>
    <Ground rx={26} ry={5} />
    <path d="M40 70 L37 90 L47 90 L48 72 Z" fill="#39414f" />
    <path d="M60 70 L63 90 L53 90 L52 72 Z" fill="#39414f" />
    {/* 躯干 */}
    <path d="M36 40 C 34 56 33 68 36 76 L64 76 C 67 68 66 56 64 40 Z" fill="url(#spr-guard-body)" />
    {/* 颈 */}
    <path d="M46 34 L54 34 L54 42 L46 42 Z" fill="#4b5566" />
    {/* 肩甲：厚实的圆角块（不用细三角，否则远看像翅膀） */}
    <rect x="24" y="40" width="18" height="20" rx="7" fill="#d9b25f" stroke="#6d5322" strokeWidth="1.2" />
    <rect x="58" y="40" width="18" height="20" rx="7" fill="#d9b25f" stroke="#6d5322" strokeWidth="1.2" />
    {/* 塔盾 */}
    <path d="M13 38 L35 38 C 37 58 32 76 24 86 C 16 76 11 58 13 38 Z" fill="url(#spr-guard-shield)" stroke="#4b5566" strokeWidth="1.4" />
    <path d="M24 43 L24 79 M15 52 L33 52" stroke="#798394" strokeWidth="1.2" />
    {/* 头盔 */}
    <rect x="38" y="15" width="24" height="23" rx="8" fill="#c3ccd9" stroke="#4b5566" strokeWidth="1.4" />
    <path d="M38 26 L62 26" stroke="#2b3240" strokeWidth="3" />
    <path d="M50 6 L54 15 L46 15 Z" fill="#e0a94f" stroke="#7a5a1e" strokeWidth="1.2" />
  </>
)

const mage = (
  <>
    <defs>{lg("spr-mage-robe", "#4a3a8f", "#241a52")}{lg("spr-mage-orb", "#c9a8ff", "#6f45d6")}</defs>
    <Ground rx={24} ry={4.5} />
    {/* 长袍 */}
    <path d="M50 38 C 40 40 32 62 28 90 L72 90 C 68 62 60 40 50 38 Z" fill="url(#spr-mage-robe)" />
    <path d="M50 42 L50 90" stroke="#6d5bb5" strokeWidth="1.2" />
    {/* 兜帽 */}
    <path d="M34 34 C 34 16 42 8 50 8 C 58 8 66 16 66 34 C 58 28 42 28 34 34 Z" fill="#3b2f6e" />
    <path d="M40 30 C 42 22 58 22 60 30 C 58 39 42 39 40 30 Z" fill="#1b1440" />
    <circle cx="45" cy="30" r="2.4" fill="#c9a8ff" stroke="none" />
    <circle cx="55" cy="30" r="2.4" fill="#c9a8ff" stroke="none" />
    {/* 法杖 */}
    <path d="M75 34 L70 90" stroke="#7a6242" strokeWidth="3" />
    <circle cx="76" cy="27" r="7.5" fill="url(#spr-mage-orb)" stroke="#5a3fa8" strokeWidth="1.4" />
    <circle cx="76" cy="27" r="3" fill="#f2eaff" stroke="none" />
    {/* 浮空符文 */}
    <path d="M22 20 l4 4 l-4 4 l-4 -4 z" fill="#a77bff" opacity=".8" stroke="none" />
    <path d="M31 11 l3 3 l-3 3 l-3 -3 z" fill="#7ff0ff" opacity=".7" stroke="none" />
  </>
)

const wuzhuge = (
  <>
    <defs>{lg("spr-wz-robe", "#4a9c88", "#245c50")}{lg("spr-wz-fan", "#f7f3e6", "#c9bd9c")}</defs>
    <Ground rx={25} ry={5} />
    {/* 袍身 */}
    <path d="M50 36 C 40 40 33 62 30 90 L70 90 C 67 62 60 40 50 36 Z" fill="url(#spr-wz-robe)" />
    <path d="M50 40 C 46 52 44 70 44 90 M50 40 C 54 52 56 70 56 90" stroke="#2f6b5e" strokeWidth="1.2" />
    {/* 宽袖 */}
    <path d="M38 44 C 30 50 26 60 26 68 L41 70 C 43 60 44 52 44 46 Z" fill="#3f8a78" />
    <path d="M62 44 C 70 50 74 60 74 68 L59 70 C 57 60 56 52 56 46 Z" fill="#3f8a78" />
    {/* 头 */}
    <circle cx="50" cy="28" r="13" fill="#e8c9a0" stroke="#8a6b46" strokeWidth="1.4" />
    {/* 束发巾 + 飘带 */}
    <path d="M36 24 C 36 14 44 8 50 8 C 56 8 64 14 64 24 C 58 19 42 19 36 24 Z" fill="#2f6b5e" />
    <path d="M64 24 C 72 26 77 32 79 39" stroke="#2f6b5e" strokeWidth="2.4" />
    {/* 面带 */}
    <path d="M44 27 L47 27 M53 27 L56 27" stroke="#3b2a18" strokeWidth="2.4" />
    <path d="M46 35 C 49 37 51 37 54 35" stroke="#8a6b46" strokeWidth="1.4" />
    {/* 羽扇 */}
    <path d="M79 42 C 87 46 91 56 89 64 C 83 62 77 55 75 49 Z" fill="url(#spr-wz-fan)" stroke="#a89a76" strokeWidth="1.2" />
    <path d="M75 49 L89 64" stroke="#a89a76" strokeWidth="1" />
    {/* 卷轴 */}
    <rect x="15" y="58" width="14" height="21" rx="3" fill="#e8dcc0" stroke="#8a6b46" strokeWidth="1.3" />
    <path d="M19 64 h6 M19 70 h6" stroke="#b5a17c" strokeWidth="1.2" />
  </>
)

// ---------------- 敌人 / 精英 / BOSS ----------------
const cultist = (
  <>
    <defs>{lg("spr-cult-robe", "#4a3f63", "#1f1a2c")}</defs>
    <Ground rx={20} ry={4} />
    <path d="M50 30 C 36 34 26 62 24 90 L76 90 C 74 62 64 34 50 30 Z" fill="url(#spr-cult-robe)" />
    {/* 兜帽 */}
    <path d="M34 30 C 34 13 42 5 50 5 C 58 5 66 13 66 30 C 58 23 42 23 34 30 Z" fill="#2a2436" />
    <path d="M40 26 C 42 19 58 19 60 26 C 58 37 42 37 40 26 Z" fill="#0d0a16" stroke="none" />
    <circle cx="45" cy="27" r="2.2" fill="#ff6b6b" stroke="none" />
    <circle cx="55" cy="27" r="2.2" fill="#ff6b6b" stroke="none" />
    {/* 法杖 + 珠 */}
    <path d="M72 44 L76 90" stroke="#6b5a45" strokeWidth="3" />
    <circle cx="71" cy="37" r="6" fill="#8f4a8f" stroke="#3d1c3d" strokeWidth="1.4" />
  </>
)

const worm = (
  <>
    <defs>{lg("spr-worm-body", "#9c7549", "#5c4227")}</defs>
    <Ground rx={26} ry={4.5} />
    {/* 分节躯干 */}
    <path d="M22 82 C 22 62 34 54 50 54 C 66 54 78 62 78 82 C 66 89 34 89 22 82 Z" fill="url(#spr-worm-body)" />
    <path d="M28 70 C 34 64 66 64 72 70" stroke="#4a3623" strokeWidth="1.3" />
    <path d="M30 79 C 38 73 62 73 70 79" stroke="#4a3623" strokeWidth="1.3" />
    {/* 抬头 */}
    <path d="M40 56 C 36 44 42 34 50 34 C 58 34 64 44 60 56 Z" fill="#8a6a44" />
    {/* 颚 */}
    <path d="M42 38 L33 30 L40 27 Z" fill="#e6e0cf" stroke="#8a8168" strokeWidth="1.2" />
    <path d="M58 38 L67 30 L60 27 Z" fill="#e6e0cf" stroke="#8a8168" strokeWidth="1.2" />
    <circle cx="45" cy="44" r="2.4" fill="#f0d060" stroke="none" />
    <circle cx="55" cy="44" r="2.4" fill="#f0d060" stroke="none" />
  </>
)

const louse = (
  <>
    <defs>{lg("spr-louse-shell", "#8a7350", "#4d3f2c")}</defs>
    <Ground rx={24} ry={4} />
    <path d="M30 68 L15 77 M30 77 L15 86 M70 68 L85 77 M70 77 L85 86" stroke="#4d3f2c" strokeWidth="2.4" />
    <ellipse cx="50" cy="56" rx="26" ry="22" fill="url(#spr-louse-shell)" />
    <path d="M32 48 C 40 42 60 42 68 48" stroke="#3d3223" strokeWidth="1.3" />
    <path d="M30 60 C 40 54 60 54 70 60" stroke="#3d3223" strokeWidth="1.3" />
    <circle cx="50" cy="31" r="12" fill="#6b583d" />
    <circle cx="44" cy="29" r="3" fill="#ffd76b" stroke="none" />
    <circle cx="56" cy="29" r="3" fill="#ffd76b" stroke="none" />
    <path d="M42 21 C 36 13 30 11 25 11 M58 21 C 64 13 70 11 75 11" stroke="#4d3f2c" strokeWidth="2" />
  </>
)

const slime = (
  <>
    <defs>{lg("spr-slime-body", "#8fdc7a", "#2f7a35")}</defs>
    <Ground rx={28} ry={5} />
    <path d="M14 84 C 14 56 30 38 50 38 C 70 38 86 56 86 84 C 86 90 82 92 76 92 L24 92 C 18 92 14 90 14 84 Z" fill="url(#spr-slime-body)" />
    <path d="M26 60 C 30 50 38 46 44 46" stroke="#dcffd0" strokeWidth="2.4" opacity=".7" />
    <circle cx="40" cy="62" r="4" fill="#0e2a10" stroke="none" />
    <circle cx="60" cy="62" r="4" fill="#0e2a10" stroke="none" />
    <path d="M44 74 C 48 78 52 78 56 74" stroke="#0e2a10" strokeWidth="2" />
    <circle cx="70" cy="48" r="4" fill="#c8ffbe" opacity=".6" stroke="none" />
    <circle cx="78" cy="60" r="2.6" fill="#c8ffbe" opacity=".5" stroke="none" />
    <circle cx="30" cy="40" r="3" fill="#c8ffbe" opacity=".5" stroke="none" />
  </>
)

const fungi = (
  <>
    <defs>{lg("spr-fungi-cap", "#d98f8f", "#7d3a45")}</defs>
    <Ground rx={24} ry={4.5} />
    <path d="M42 88 C 40 70 40 60 44 54 L58 54 C 62 60 62 70 60 88 Z" fill="#e3d6bb" stroke="#9a8a6c" strokeWidth="1.3" />
    <path d="M20 56 C 20 34 34 22 50 22 C 66 22 80 34 80 56 C 70 62 30 62 20 56 Z" fill="url(#spr-fungi-cap)" />
    <circle cx="36" cy="42" r="5" fill="#f0cccc" stroke="none" />
    <circle cx="56" cy="36" r="4" fill="#f0cccc" stroke="none" />
    <circle cx="66" cy="48" r="3.4" fill="#f0cccc" stroke="none" />
    <circle cx="44" cy="68" r="2.6" fill="#3a2f22" stroke="none" />
    <circle cx="56" cy="68" r="2.6" fill="#3a2f22" stroke="none" />
    <circle cx="21" cy="26" r="3" fill="#d8c9a4" opacity=".7" stroke="none" />
    <circle cx="81" cy="30" r="3.4" fill="#d8c9a4" opacity=".6" stroke="none" />
  </>
)

const nob = (
  <>
    <defs>{lg("spr-nob-head", "#9a7f63", "#5c4a3f")}</defs>
    <Ground rx={28} ry={5} />
    <path d="M30 66 C 26 76 24 86 24 92 L76 92 C 76 86 74 76 70 66 Z" fill="#5c4a3f" />
    <circle cx="50" cy="44" r="24" fill="url(#spr-nob-head)" />
    {/* 耳 */}
    <path d="M30 38 C 18 30 12 34 14 44 C 18 50 26 48 32 46 Z" fill="#7a6350" />
    <path d="M70 38 C 82 30 88 34 86 44 C 82 50 74 48 68 46 Z" fill="#7a6350" />
    {/* 角 */}
    <path d="M34 28 C 28 18 30 12 36 10 C 38 18 40 22 44 24 Z" fill="#d9cbb2" stroke="#8a8168" strokeWidth="1.2" />
    <path d="M66 28 C 72 18 70 12 64 10 C 62 18 60 22 56 24 Z" fill="#d9cbb2" stroke="#8a8168" strokeWidth="1.2" />
    <circle cx="41" cy="42" r="4" fill="#ff4d4d" stroke="none" />
    <circle cx="59" cy="42" r="4" fill="#ff4d4d" stroke="none" />
    <path d="M42 56 L44 65 L46 56 Z M54 56 L56 65 L58 56 Z" fill="#f0ece0" stroke="#8a8168" strokeWidth="1.1" />
    {/* 狼牙棒 */}
    <path d="M76 64 L88 30" stroke="#6b5433" strokeWidth="4" />
    <circle cx="89" cy="26" r="8" fill="#8a7350" stroke="#4a3a22" strokeWidth="1.4" />
  </>
)

const sentry = (
  <>
    <defs>{lg("spr-sentry-body", "#9aa1a9", "#5a6068")}</defs>
    <Ground rx={26} ry={5} />
    <path d="M26 92 L32 78 L68 78 L74 92 Z" fill="#6b7078" />
    <path d="M34 88 L36 46 L64 46 L66 88 Z" fill="url(#spr-sentry-body)" />
    {/* 石臂：厚块而非薄翼 */}
    <rect x="15" y="48" width="20" height="17" rx="5" fill="#7f858d" stroke="#5a6068" strokeWidth="1.2" />
    <rect x="65" y="48" width="20" height="17" rx="5" fill="#7f858d" stroke="#5a6068" strokeWidth="1.2" />
    <path d="M38 44 L40 20 L60 20 L62 44 Z" fill="#8b9199" />
    <path d="M40 26 L60 26" stroke="#5a6068" strokeWidth="1.4" />
    <circle cx="50" cy="34" r="7" fill="#1d2126" stroke="none" />
    <circle cx="50" cy="34" r="3.4" fill="#7ff0ff" stroke="none" />
    <path d="M44 52 L48 62 L44 68 M58 60 L62 70" stroke="#4d5259" strokeWidth="1.3" />
  </>
)

const king = (
  <>
    <defs>{lg("spr-king-body", "#7fc8e8", "#1f4f74")}{lg("spr-king-crown", "#f0d276", "#a8811f")}</defs>
    <Ground rx={34} ry={6} />
    <path d="M8 86 C 8 52 26 30 50 30 C 74 30 92 52 92 86 C 92 92 88 94 80 94 L20 94 C 12 94 8 92 8 86 Z" fill="url(#spr-king-body)" />
    <circle cx="36" cy="58" r="5" fill="#0d2a3a" stroke="none" />
    <circle cx="64" cy="58" r="5" fill="#0d2a3a" stroke="none" />
    <path d="M40 74 C 46 80 54 80 60 74" stroke="#0d2a3a" strokeWidth="2.4" />
    <path d="M20 62 C 24 48 34 40 42 38" stroke="#d9f2ff" strokeWidth="2.6" opacity=".55" />
    <circle cx="78" cy="52" r="4" fill="#bfe9ff" opacity=".5" stroke="none" />
    <path d="M28 30 L24 10 L38 20 L50 6 L62 20 L76 10 L72 30 Z" fill="url(#spr-king-crown)" stroke="#8a6b1e" strokeWidth="1.4" />
    <circle cx="50" cy="13" r="3" fill="#ff6b6b" stroke="none" />
  </>
)

const jadeGolem = (
  <>
    <defs>{lg("spr-golem-body", "#63c4b3", "#26695f")}{lg("spr-golem-arm", "#4f9f93", "#1f554e")}</defs>
    <Ground rx={34} ry={6} />
    {/* 石柱腿 */}
    <path d="M32 74 L27 92 L45 92 L45 76 Z" fill="#26695f" stroke="#1c4a44" strokeWidth="1.2" />
    <path d="M68 74 L73 92 L55 92 L55 76 Z" fill="#26695f" stroke="#1c4a44" strokeWidth="1.2" />
    {/* 躯干 */}
    <path d="M34 38 C 30 54 30 66 34 78 L66 78 C 70 66 70 54 66 38 Z" fill="url(#spr-golem-body)" />
    {/* 巨大肩甲：实心厚块，一眼看出"重装" */}
    <rect x="10" y="32" width="26" height="26" rx="9" fill="url(#spr-golem-arm)" stroke="#1c4a44" strokeWidth="1.3" />
    <rect x="64" y="32" width="26" height="26" rx="9" fill="url(#spr-golem-arm)" stroke="#1c4a44" strokeWidth="1.3" />
    {/* 粗臂 + 拳 */}
    <path d="M22 58 L20 70 M78 58 L80 70" stroke="#2f7f74" strokeWidth="11" strokeLinecap="round" />
    <circle cx="20" cy="76" r="8.5" fill="#3f8f84" stroke="#1c4a44" strokeWidth="1.3" />
    <circle cx="80" cy="76" r="8.5" fill="#3f8f84" stroke="#1c4a44" strokeWidth="1.3" />
    {/* 头（横向石面，留一条刻痕） */}
    <rect x="39" y="12" width="22" height="26" rx="5" fill="#6fcbbd" stroke="#1c4a44" strokeWidth="1.3" />
    <path d="M43 24 L57 24" stroke="#1c4a44" strokeWidth="2" />
    {/* 胸口青玉核心 */}
    <circle cx="50" cy="56" r="9" fill="#0b2b28" stroke="none" />
    <circle cx="50" cy="56" r="5" fill="#7dffe0" stroke="none" />
    {/* 躯干裂纹 */}
    <path d="M37 48 L41 58 L37 68 M63 46 L59 56 L63 68" stroke="#1c4a44" strokeWidth="1.3" />
    {/* 肩顶晶簇 */}
    <path d="M16 32 L12 18 L24 26 Z M84 32 L88 18 L76 26 Z" fill="#9ff0dc" opacity=".85" stroke="none" />
  </>
)

const spireLord = (
  <>
    <defs>{lg("spr-lord-cloak", "#6d1230", "#260610")}{lg("spr-lord-crown", "#f0d276", "#a8811f")}</defs>
    <Ground rx={32} ry={6} />
    <path d="M50 38 C 30 42 16 64 12 92 L88 92 C 84 64 70 42 50 38 Z" fill="url(#spr-lord-cloak)" />
    <path d="M50 44 L50 92" stroke="#5a1030" strokeWidth="1.4" />
    {/* 胸口邪能结晶 */}
    <path d="M50 50 L58 62 L50 77 L42 62 Z" fill="#ff4d6d" opacity=".9" stroke="none" />
    <circle cx="50" cy="63" r="4" fill="#fff0f3" stroke="none" />
    {/* 肩刺 */}
    <path d="M34 46 L19 31 L38 42 Z" fill="#8a1f38" stroke="#4a0e1d" strokeWidth="1.2" />
    <path d="M66 46 L81 31 L62 42 Z" fill="#8a1f38" stroke="#4a0e1d" strokeWidth="1.2" />
    {/* 头 */}
    <path d="M40 40 C 40 23 44 15 50 15 C 56 15 60 23 60 40 C 56 45 44 45 40 40 Z" fill="#20060f" />
    <circle cx="45" cy="30" r="2.8" fill="#ff5a5a" stroke="none" />
    <circle cx="55" cy="30" r="2.8" fill="#ff5a5a" stroke="none" />
    {/* 尖塔冠 */}
    <path d="M34 20 L30 6 L42 14 L50 2 L58 14 L70 6 L66 20 Z" fill="url(#spr-lord-crown)" stroke="#8a6b1e" strokeWidth="1.4" />
    <circle cx="50" cy="5" r="2.6" fill="#ff4d6d" stroke="none" />
    {/* 浮空血珠 */}
    <circle cx="13" cy="44" r="4" fill="#ff4d6d" opacity=".75" stroke="none" />
    <circle cx="87" cy="52" r="3.2" fill="#ff4d6d" opacity=".65" stroke="none" />
  </>
)

const SPRITES: Record<"player" | "enemy", Record<string, ReactNode>> = {
  player: { blade, guard, mage, wuzhuge },
  enemy: { cultist, worm, louse, slime, fungi, nob, sentry, king, jadeGolem, spireLord },
}

// 配了 char.<id> 立绘的角色也算"有形象" —— 否则调用点会走 emoji 回退，
// 后台配的图永远不会被渲染（工坊自定义角色尤其容易出现：它们本来就没有内置 SVG）
export const hasSpireSprite = (kind: "player" | "enemy", id: string) =>
  !!SPRITES[kind]?.[id] || (kind === "player" && !!charArtUrl(id))

/**
 * 渲染形象精灵；未知 id 返回 null（调用方负责回退 emoji）。
 *
 * 玩家角色可被后台「素材资源配置」的 `char.<id>` 槽位覆盖成图片（透明底 PNG 效果最好）：
 * 覆盖时直接出 <img>，不再渲染内部 SVG —— 这样各调用点（选角卡 / 战斗立绘 / 图例）
 * 都自动跟着换，无需改它们的代码。
 * 敌人形象**暂不可配**：敌人 id 清单只在引擎里，已发布配置没有镜像常量（见 B 端槽位注册表说明）。
 */
export function SpireSprite({ kind, id, className }: { kind: "player" | "enemy"; id: string; className?: string }) {
  const custom = kind === "player" ? charArtUrl(id) : ""
  if (custom) {
    return (
      <img
        src={custom} alt="" aria-hidden="true" draggable={false}
        className={className}
        // maxWidth/Height:none —— Tailwind preflight 的 img{max-width:100%} 会挤压尺寸，
        // objectFit:contain 保证非正方形立绘不被拉伸变形
        style={{ objectFit: "contain", maxWidth: "none", maxHeight: "none" }}
      />
    )
  }
  const node = SPRITES[kind]?.[id]
  if (!node) return null
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true"
      fill="none" stroke="#0d0f14" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round">
      {node}
    </svg>
  )
}
