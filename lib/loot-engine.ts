// 摸金行动 · 纯逻辑引擎（**无 DOM / 无网络依赖**）
//
// 为什么必须纯函数：验收要用 Node 跑「10,000 局掉落模拟 + 卡方检验」，要求掉落逻辑能在
// 没有浏览器的环境里直接 import 执行（与爬塔 SM-2 / ArchGuard 同一套验法）。
// 本文件**不得**出现任何大模型调用（PRD-P3 铁律：LLM 零依赖）。
//
// 净化口径与 notelab-java 的 LootContentController、notelab-b 的 loot-editor/_shared/model.ts 一致。
//
// ⚠️ 2026-10-06 形状化改造：局内模型从「线性槽」换成「格子板」
//   - 容器：不再是有 N 个槽，而是 cols×rows 的网格（区间由后台配，开局按 seed 掷）；
//   - 物品：带上形状（占 1~4 格），开局就把掉落结果**摆进**网格；
//   - 背包：同样是一张网格，取出的东西自动找位塞入，塞不下才丢弃。
//   旧字段 slots / backpackCap 只作迁移输入，不再参与玩法。

// ---------------- 稀有度（动态） ----------------
//
// 稀有度不再是代码里的 5 个常量，而是后台配置的一条数组（`ui_config.loot.rarities`）。
// 数组顺序 = 由低到高。代码里所有"比大小"的地方都必须拿 order 来比，不能假设有 5 档。
export type Rarity = string

export interface RarityDef {
  key: string
  label: string
  /**
   * 色板 key（见 `loot-palette.ts`）。
   * ⚠️ 存的是**色板 key 而不是十六进制色值**：C 端要把它翻译成 Tailwind 类名，
   *    而 Tailwind v4 只认**静态出现过的**类名（拼字符串的类会被 JIT 漏掉），
   *    所以只能从一份固定色板里选。B 端再各自映射成 antd 预设色名。
   */
  color: string
  /**
   * 每格基准价值。后台给物品定价时的锚点：面值 ≈ unitValue × 占格数。
   * 它把「同等稀有度下，占格越多越值钱」这条规则变成了**配置**而不是口头约定。
   */
  unitValue: number
}

/** 兜底五档（后台没配 rarities 时用；与旧版 5 档 key 兼容，旧配置可无损迁移） */
export const DEFAULT_RARITIES: RarityDef[] = [
  { key: "common", label: "普通", color: "slate", unitValue: 65 },
  { key: "uncommon", label: "精良", color: "blue", unitValue: 280 },
  { key: "rare", label: "稀有", color: "purple", unitValue: 830 },
  { key: "epic", label: "史诗", color: "amber", unitValue: 2250 },
  { key: "legendary", label: "传说", color: "red", unitValue: 7250 },
]

/** 兜底顺序（= DEFAULT_RARITIES 的 key 序列）。函数签名里的 order 默认值，别拿它当配置 */
export const DEFAULT_ORDER: string[] = DEFAULT_RARITIES.map((r) => r.key)

/** 兜底中文名（老代码/兼容路径用；UI 一律用 order 派生出来的 label map） */
export const RARITY_LABEL: Record<string, string> =
  Object.fromEntries(DEFAULT_RARITIES.map((r) => [r.key, r.label]))

export type RarityWeights = Record<string, number>

// ---------------- 形状 ----------------

export type Cell = [number, number]

export interface ShapeDef {
  id: string
  label: string
  /** 相对 (0,0) 的占位格；放置时再平移到网格坐标 */
  cells: Cell[]
}

/**
 * 基础形状表（**三端同口径**：C 端 engine / B 端 model / Java 只做透传）。
 * ⚠️ 不收录"旋转后能得到的镜像变体"（比如 2×1 是 1×2 转 90°），
 *    旋转由 {@link rotateCells} 在放置时自动试 4 个方向；
 *    但**镜像**（L / J、S / Z 这类）旋转得不到，所以必须各自留一条。
 */
export const SHAPES: ShapeDef[] = [
  { id: "1x1", label: "1×1 单格", cells: [[0, 0]] },
  { id: "1x2", label: "1×2 短条", cells: [[0, 0], [1, 0]] },
  { id: "1x3", label: "1×3 长条", cells: [[0, 0], [1, 0], [2, 0]] },
  { id: "2x2", label: "2×2 方块", cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { id: "L", label: "L 形（3 格）", cells: [[0, 0], [0, 1], [1, 1]] },
  { id: "J", label: "J 形（3 格）", cells: [[1, 0], [1, 1], [0, 1]] },
  { id: "T", label: "T 形（4 格）", cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
  { id: "S", label: "S 形（4 格）", cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
]

export const SHAPE_IDS: string[] = SHAPES.map((s) => s.id)
const SHAPE_MAP = new Map(SHAPES.map((s) => [s.id, s]))

/** 取形状定义；未配置/未知 id 一律回落 1×1（**绝不返回 undefined**，否则放置算法会炸） */
export function shapeOf(id?: string | null): ShapeDef {
  return (id ? SHAPE_MAP.get(id) : undefined) ?? SHAPES[0]
}

/** 该形状占几格 */
export function shapeSize(id?: string | null): number {
  return shapeOf(id).cells.length
}

/** 顺时针旋转 rot×90°，并把结果平移回左上角对齐（保证最小 x/y 都是 0） */
export function rotateCells(cells: Cell[], rot: number): Cell[] {
  let out = cells.map(([x, y]) => [x, y] as Cell)
  const n = ((rot % 4) + 4) % 4
  for (let i = 0; i < n; i++) out = out.map(([x, y]) => [-y, x] as Cell)
  const mx = Math.min(...out.map((c) => c[0]))
  const my = Math.min(...out.map((c) => c[1]))
  return out.map(([x, y]) => [x - mx, y - my] as Cell)
}

// ---------------- 网格 ----------------

/** 占用表：长度 cols*rows 的布尔数组，下标 = y*cols + x */
export function newGrid(cols: number, rows: number): boolean[] {
  return new Array(Math.max(0, cols * rows)).fill(false)
}

/**
 * 给一个形状在网格里找安放点：**先试 4 向旋转，再按行优先扫位置，取第一个可行的**。
 *
 * 为什么 rot 放在最外层：旋转 0 就是配置里的原始朝向，能原样放下就别转 ——
 * 玩家看到的形状跟后台配的一致，不会出现"我配了个竖条，进包变横条"的困惑。
 */
export function findPlacement(
  /** 形状 id；空/undefined 一律按 1×1 处理（物品未配形状时的兜底，别让调用方各自 ?? "1x1"） */
  shapeId: string | null | undefined, cols: number, rows: number, grid: boolean[],
): { x: number; y: number; rot: number; cells: Cell[] } | null {
  const base = shapeOf(shapeId).cells
  for (let rot = 0; rot < 4; rot++) {
    const rc = rotateCells(base, rot)
    let w = 0
    let h = 0
    for (const [cx, cy] of rc) { if (cx + 1 > w) w = cx + 1; if (cy + 1 > h) h = cy + 1 }
    if (w > cols || h > rows) continue
    for (let y = 0; y + h <= rows; y++) {
      for (let x = 0; x + w <= cols; x++) {
        let ok = true
        for (const [cx, cy] of rc) {
          if (grid[(y + cy) * cols + (x + cx)]) { ok = false; break }
        }
        if (!ok) continue
        return { x, y, rot, cells: rc.map(([cx, cy]) => [x + cx, y + cy] as Cell) }
      }
    }
  }
  return null
}

/** 从占用表反推已占用格数 */
export function gridUsed(grid: boolean[]): number {
  let n = 0
  for (const v of grid) if (v) n++
  return n
}

// ---------------- 内容模型 ----------------

export interface LootItem {
  id: string
  name: string
  rarity: Rarity
  baseValue: number
  recycleValue?: number | null
  stack?: number
  emoji?: string
  /** 图片路径（相对 C 端 public 根，如 `/loot/gold.png`）；有图优先显示图，没图回落 emoji */
  image?: string
  /** 形状 id（见 SHAPES）；未配置 = 1×1 */
  shape?: string
  tags?: string[]
  desc?: string
}

export interface LootPity { afterRuns: number; minRarity: Rarity }

export interface LootContainer {
  id: string
  name: string
  /** 网格列数区间（开局按 seed 掷一个值），1-8 */
  colsMin: number
  colsMax: number
  /** 网格行数区间，1-8 */
  rowsMin: number
  rowsMax: number
  /** 每格被填上东西的概率（0-1）。< 1 才会出现"这格是空的" */
  fillRate: number
  /** 搜刮一格的基础耗时 ms；摸到大件按占格数翻倍 */
  slotMs: number
  rarityWeights: RarityWeights
  riskCost: number
  pity?: LootPity | null
  tableId: string
  emoji?: string
  /** 容器图标路径（相对 C 端 public 根，如 `/loot/ct-crate.png`）；有图优先，没图回落 emoji */
  image?: string
}

export interface LootPoolEntry { itemId: string; weight: number }

export interface LootTable { id: string; name: string; pool: LootPoolEntry[] }

export interface LootEntryReq { coins: number; items: { itemId: string; qty: number }[]; minExtracts: number; groups: string[] }
export interface LootMapCtn { containerId: string; count: number }

export interface LootMap {
  id: string
  name: string
  timeLimitSec: number
  riskLimit: number
  valueMult: number
  tierBoost: number
  entry: LootEntryReq
  containers: LootMapCtn[]
  extractPoints: number
}

export interface LootBalance {
  recycleRate: number
  extractRate: number
  /** 背包网格列数（1-8） */
  backpackCols: number
  /** 背包网格行数（1-8） */
  backpackRows: number
  initialCoins: number
  rescueCoins: number
  rescueCooldownSec: number
  extractHoldMs: number
  /** 每往背包塞**一格**加的风险（大件占格多 → 更危险，这是拿大件的代价） */
  riskPerSlot: number
  evWarnRatio: number
  evRejectRatio: number
}

export interface LootContent {
  /** 稀有度由后台配置；缺失时三端都回落 DEFAULT_RARITIES */
  rarities: RarityDef[]
  items: LootItem[]
  containers: LootContainer[]
  tables: LootTable[]
  maps: LootMap[]
  balance: LootBalance
}

// ---------------- 内容派生工具 ----------------

/** 稀有度顺序（数组顺序 = 由低到高）；配置为空时回落兜底五档 */
export function orderOf(content: Pick<LootContent, "rarities"> | undefined | null): string[] {
  const rs = content?.rarities
  if (!Array.isArray(rs) || rs.length === 0) return DEFAULT_ORDER
  const keys = rs.map((r) => r.key).filter((k) => typeof k === "string" && k)
  return keys.length ? keys : DEFAULT_ORDER
}

/** key → 中文名 */
export function labelMap(content: Pick<LootContent, "rarities"> | undefined | null): Record<string, string> {
  const out: Record<string, string> = {}
  for (const r of content?.rarities ?? DEFAULT_RARITIES) out[r.key] = r.label || r.key
  return out
}

/** key → 色板 key */
export function colorMap(content: Pick<LootContent, "rarities"> | undefined | null): Record<string, string> {
  const out: Record<string, string> = {}
  for (const r of content?.rarities ?? DEFAULT_RARITIES) out[r.key] = r.color || "slate"
  return out
}

/** key → 每格基准价 */
export function unitValueMap(content: Pick<LootContent, "rarities"> | undefined | null): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of content?.rarities ?? DEFAULT_RARITIES) out[r.key] = Number(r.unitValue) || 0
  return out
}

/** 建议面值 = 该稀有度每格基准价 × 占格数（后台定价提示用，不参与结算） */
export function suggestValue(content: Pick<LootContent, "rarities"> | undefined | null, rarity: Rarity, shapeId?: string | null): number {
  const uv = unitValueMap(content)[rarity] ?? 0
  return Math.round(uv * shapeSize(shapeId))
}

// ---------------- RNG（确定性：同 seed 同序列） ----------------

/** mulberry32：小、快、可复现的 32 位 PRNG */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 由字符串生成 32 位种子（无 crypto 依赖，同串同值） */
export function seedFromString(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** 开局种子（展示用：给「本局种子」按钮复现用） */
export function newSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0
}

/** [lo, hi] 闭区间取整数（rng 消费 1 个随机数） */
function randInt(rng: () => number, lo: number, hi: number): number {
  const a = Math.max(1, Math.floor(Number(lo) || 1))
  const b = Math.max(a, Math.floor(Number(hi) || a))
  return a + Math.floor(rng() * (b - a + 1))
}

/**
 * 掷容器网格尺寸。
 * ⚠️ 这是"几×几随机"的唯一入口：同一份配置每次开局尺寸都可能不同，但**同 seed 必然相同**
 *    （随机数从 raid 的确定性游标里取，不是 Math.random），所以能复现、能跑模拟。
 */
export function rollGrid(def: LootContainer, rng: () => number): { cols: number; rows: number } {
  return { cols: randInt(rng, def.colsMin, def.colsMax), rows: randInt(rng, def.rowsMin, def.rowsMax) }
}

// ---------------- 抽取 ----------------

/** 稀有度轮盘：容器权重为底，tierBoost 只抬 rare 及以上（"及以上"按 order 的index ≥ 2 判定） */
export function rollRarity(w: RarityWeights, rng: () => number, order: string[] = DEFAULT_ORDER, tierBoost = 0): Rarity {
  const boosted: RarityWeights = { ...w }
  if (tierBoost > 0) {
    for (let i = 2; i < order.length; i++) {
      boosted[order[i]] = (boosted[order[i]] || 0) * (1 + tierBoost)
    }
  }
  const total = order.reduce((s, r) => s + Math.max(0, boosted[r] || 0), 0)
  if (total <= 0) return order[0] ?? "common"
  let x = rng() * total
  for (const r of order) {
    x -= Math.max(0, boosted[r] || 0)
    if (x < 0) return r
  }
  return order[0] ?? "common"
}

/**
 * 该容器当前该用哪一档：先按容器权重抽一档 → 若该档在掉落表里没有候选，则**降档找最近的有货档**
 * （避免"高频空手"这种体感极差的结果；池子真为空则返回 null = 空手）。
 */
export function resolveRarity(
  w: RarityWeights, table: LootTable | undefined, itemsById: Map<string, LootItem>,
  rng: () => number, order: string[] = DEFAULT_ORDER, tierBoost = 0,
): Rarity | null {
  if (!table || table.pool.length === 0) return null
  const drawn = rollRarity(w, rng, order, tierBoost)
  const has = (r: Rarity) => table.pool.some((p) => itemsById.get(p.itemId)?.rarity === r)
  if (has(drawn)) return drawn
  const idx = order.indexOf(drawn)
  if (idx < 0) return null
  for (let i = idx; i >= 0; i--) if (has(order[i])) return order[i]
  for (let i = idx + 1; i < order.length; i++) if (has(order[i])) return order[i]
  return null
}

/** 在「属于指定档」的池子里按 weight 轮盘抽 1 件 */
export function rollItem(pool: LootPoolEntry[], rarity: Rarity, itemsById: Map<string, LootItem>, rng: () => number): LootItem | null {
  const cands = pool.filter((p) => itemsById.get(p.itemId)?.rarity === rarity && (p.weight || 0) > 0)
  if (cands.length === 0) return null
  const total = cands.reduce((s, p) => s + p.weight, 0)
  let x = rng() * total
  for (const p of cands) {
    x -= p.weight
    if (x < 0) return itemsById.get(p.itemId) ?? null
  }
  return itemsById.get(cands[cands.length - 1].itemId) ?? null
}

/**
 * 保底抽取：在 minRarity **及以上**找候选，该档池子为空就往更高档找。
 *
 * ⚠️ 为什么不能直接 `rollItem(pool, minRarity, …)`：如果掉落表里根本没有该档候选，
 *    rollItem 返回 null —— 保底会**静默失效**（`applyPity` 已把计数清零，却一件没出，
 *    玩家永远等不到那次"必出"）。这里回退到更高的档，保证"配了保底就一定出货"。
 */
export function pickAtLeast(pool: LootPoolEntry[], minRarity: Rarity, itemsById: Map<string, LootItem>, rng: () => number, order: string[] = DEFAULT_ORDER): LootItem | null {
  const from = Math.max(0, order.indexOf(minRarity))
  for (let i = from; i < order.length; i++) {
    const it = rollItem(pool, order[i], itemsById, rng)
    if (it) return it
  }
  // 池子里没有「该档及以上」的候选 → 退而求最好的一档（至少让玩家拿到池子里的顶尖货），
  // 同时 B 端「保底档无线索」告警提示去补候选，别让这次保底白等。
  for (let i = from - 1; i >= 0; i--) {
    const it = rollItem(pool, order[i], itemsById, rng)
    if (it) return it
  }
  return null
}

// ---------------- 容器布局（开局预生成） ----------------

/** 网格里摆好的一件东西 */
export interface PlacedItem {
  itemId: string
  /** 左上角格坐标 */
  x: number
  y: number
  /** 旋转 0-3（放置时为了塞进去可能转过） */
  rot: number
  /** 绝对占位格，开局算好，渲染与取出都直接读，不再重复计算 */
  cells: Cell[]
}

export interface LayoutInput {
  def: LootContainer
  table: LootTable | undefined
  itemsById: Map<string, LootItem>
  rng: () => number
  order?: string[]
  tierBoost?: number
  /** 保底强制出档（本次生成的第 1 件生效） */
  forceRarity?: Rarity | null
  cols: number
  rows: number
  /**
   * 可选：把"抽到了什么"记到调用方给的计数器里（**含摆不下的**）。
   *
   * 为什么需要它：卡方检验要验的是**轮盘准不准**，而"抽到了但网格摆不下"会被丢掉 ——
   *   形状越大的东西越容易被丢，而大件往往又是高稀有度，于是实测分布会偏低。
   *   不分开记账的话，这个**形状副作用**会被误报成"轮盘不准"。
   */
  tally?: LayoutTally
}

/** 见 {@link LayoutInput.tally} */
export interface LayoutTally {
  /** 抽到东西的次数（不含"这一格掷出空"） */
  attempts: number
  /** 抽到的档位计数（含摆不下的） */
  byRarity: Record<string, number>
}

/**
 * 开局把一个容器的内容**预先摆进网格**。
 *
 * 为什么是"预先摆好"而不是"摸一格掷一次"：物品有形状之后，"这一格空不空"和
 * "这件东西占哪几格"是**同一个决策** —— 边摸边掷会出现"掷出个 2×2 但网格已经没地方了"
 * 这种说不通的结果。预生成让容器在开局那一刻就是一个确定的、自洽的摆放。
 *
 * 逐格扫描：空格按 fillRate 概率决定"这格有没有东西"，有东西就抽一件并试着摆进去
 * （4 向旋转都塞不下 → 这一格留空）。于是 fillRate < 1 时自然会留出摸空的格子。
 *
 * ⚠️ 保底必须绕过 fillRate 的掷骰（`forced` 那一行）：否则"保底到了但这格掷出空"会让
 *    保底被吞掉，重演 2026-10-03 那个"计数清零却一件没出"的 bug。
 */
export function generateLayout(input: LayoutInput): PlacedItem[] {
  const { def, table, itemsById, rng, order = DEFAULT_ORDER, tierBoost = 0, forceRarity = null, cols, rows, tally } = input
  const grid = newGrid(cols, rows)
  const out: PlacedItem[] = []
  const fill = Math.min(1, Math.max(0, Number(def.fillRate) || 0))
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y * cols + x]) continue
      const forced = out.length === 0 && !!forceRarity
      if (!forced && rng() > fill) continue
      let item: LootItem | null = null
      if (forced) {
        item = pickAtLeast(table?.pool ?? [], forceRarity as string, itemsById, rng, order)
      } else {
        const r = resolveRarity(def.rarityWeights, table, itemsById, rng, order, tierBoost)
        if (r) item = rollItem(table?.pool ?? [], r, itemsById, rng)
      }
      if (!item) continue
      // 先记账再尝试摆放：这一件哪怕摆不下，轮盘也已经转过了，必须计入分布
      if (tally) {
        tally.attempts++
        tally.byRarity[item.rarity] = (tally.byRarity[item.rarity] || 0) + 1
      }
      const place = findPlacement(item.shape, cols, rows, grid)
      if (!place) continue
      for (const [cx, cy] of place.cells) grid[cy * cols + cx] = true
      out.push({ itemId: item.id, x: place.x, y: place.y, rot: place.rot, cells: place.cells })
    }
  }
  return out
}

// ---------------- 保底 ----------------

export type PityState = Record<string, number>

/**
 * 保底计数：下一次开该容器时是否要强制出档（**只读**，不改变计数）。
 * 调用方必须在**生成布局之前**用它决定 force，才能保证保底真的落到格子里。
 */
export function pendingPity(state: PityState, container: LootContainer): Rarity | null {
  const p = container.pity
  if (!p) return null
  return (state[container.id] || 0) >= p.afterRuns ? p.minRarity : null
}

/**
 * 开完一个容器后更新保底计数。
 *
 * ⚠️ 2026-10-03 修的**真 bug**：旧实现「计数一到 afterRuns 就把它清零，并把 force 作为返回值」，
 *    但调用方是**在开容器之前**读计数来决定要不要强制的 —— 于是计数已被清零、返回值又被丢弃，
 *    保底**永远不会触发**。跑 10,000 局一次都没触发才暴露出来。
 *    现在改成：计数到 afterRuns 就**停在**那里（clamp，不清零），等下一次开容器时被消费；
 *    只有真的消费掉（forced = 本次已强制出货）才清零。
 *
 * @param forced 本次是否已按保底强制出货（= 消费掉这次保底）
 */
export function applyPity(
  state: PityState, container: LootContainer, maxRarity: Rarity | null, forced = false, order: string[] = DEFAULT_ORDER,
): { state: PityState; force: Rarity | null } {
  const p = container.pity
  if (!p) return { state, force: null }
  const cur = state[container.id] || 0
  // 保底已消费 → 归零
  if (forced) return { state: { ...state, [container.id]: 0 }, force: null }
  const met = maxRarity != null && order.indexOf(maxRarity) >= order.indexOf(p.minRarity)
  if (met) {
    if (cur === 0) return { state, force: null }
    return { state: { ...state, [container.id]: 0 }, force: null }
  }
  // 未达标 → 计数 +1，但**不清零**（到顶就停在顶，等下一位来消费）
  const next = Math.min(cur + 1, p.afterRuns)
  const ns = { ...state, [container.id]: next }
  return { state: ns, force: next >= p.afterRuns ? p.minRarity : null }
}

// ---------------- 结算 ----------------

/**
 * 回收价（玩家真正到手的金币）＝ 展示价 × 回收率。
 *
 * ⚠️ `mult` 是地图价值倍率（`LootMap.valueMult`），**必须传对**：
 *    结算那一刻要传本图的倍率，否则会出现"结算说可回收 333、回仓库却变成另一个数"。
 *    仓库里的物品已经离开地图、没有 mult 上下文，所以入库时把单价（unit）一并存下来。
 */
export function recycleValue(item: LootItem, balance: LootBalance, mult = 1): number {
  const m = Number.isFinite(mult) && mult > 0 ? mult : 1
  if (item.recycleValue != null && Number.isFinite(item.recycleValue)) return Math.round(item.recycleValue * m)
  return Math.round(item.baseValue * m * balance.recycleRate)
}

/** 结算展示价 = baseValue × 地图价值倍率 */
export function displayValue(item: LootItem, map: LootMap): number {
  return Math.round(item.baseValue * map.valueMult)
}

/** 某档的候选物品（掉落表池子 ∩ 该档） */
export function poolItemsOfRarity(table: LootTable | undefined, itemsById: Map<string, LootItem>, rarity: Rarity): LootItem[] {
  if (!table) return []
  return table.pool.map((p) => itemsById.get(p.itemId)).filter((x): x is LootItem => !!x && x.rarity === rarity)
}

// ---------------- 容器档位 ----------------

/**
 * 容器的稀有度档位 = 它产出稀有度的**期望档**（rarityWeights 在 order 上加权平均后就近取整）。
 *
 * 为什么是"期望档"，而不是另外两种直觉口径：
 *   - 「权重最高的那一档」几乎总落在最低档（现有 6 个容器里 5 个最低档权重最大）→ 全场一个颜色；
 *   - 「能出的最高档」几乎都是最高档（权重再小也是 > 0）→ 全部变红，同样没用；
 *   - 期望档同时吃到"高档占比"和"分布重心"，实测与每格 EV 的排序一致。
 *
 * ⚠️ 只吃容器自身的 rarityWeights，**不**吃地图 tierBoost：档位是容器固有属性，
 *    同一个容器在两张图里必须是同一个颜色，否则玩家记不住"紫色柜子值钱"。
 */
export function containerTier(c: LootContainer, order: string[] = DEFAULT_ORDER): Rarity {
  let sum = 0
  let acc = 0
  for (let i = 0; i < order.length; i++) {
    const w = Math.max(0, c.rarityWeights?.[order[i]] ?? 0)
    sum += w
    acc += w * i
  }
  if (sum <= 0) return order[0] ?? "common"
  const idx = Math.min(order.length - 1, Math.max(0, Math.round(acc / sum)))
  return order[idx]
}

// ---------------- 索引工具 ----------------

export function indexItems(items: LootItem[]): Map<string, LootItem> {
  return new Map(items.map((i) => [i.id, i]))
}
export function findContainer(cs: LootContainer[], id: string): LootContainer | undefined {
  return cs.find((c) => c.id === id)
}
export function findTable(ts: LootTable[], id: string): LootTable | undefined {
  return ts.find((t) => t.id === id)
}

/** 把地图的容器配比展开成实例列表（每张图的固定配比，可复现） */
export function expandMapContainers(map: LootMap, containers: LootContainer[]): LootContainer[] {
  const out: LootContainer[] = []
  for (const mc of map.containers) {
    const def = findContainer(containers, mc.containerId)
    if (!def) continue
    for (let i = 0; i < mc.count; i++) out.push(def)
  }
  return out
}
