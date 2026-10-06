// 摸金行动 · 平衡模拟器（**无 DOM / 无网络 / 无 React**）
//
// 存在的理由（PRD-P3 W3 验收）：掉落分布是否真的按配置权重出、经济是否落在设计区间 ——
// 这两件事**看不出来**，只能跑数据。本文件在真实引擎（loot-engine 的 rollRarity /
// resolveRarity / rollItem / generateLayout / applyPity）之上做蒙特卡洛，所以
// 「模拟出来的就是线上跑的那套逻辑」，而不是另写一套近似公式。
//
// 两种跑法，各答一个问题：
//   ① 全清抽样（distribution）：不看背包/风险，把每张网格的所有格子摸完，统计各稀有度实测频率
//      vs 配置权重 → 卡方检验。它测的是**轮盘本身**，故意不带保底（保底会人为抬高稀有度，
//      混进来会让"轮盘准不准"变成一个说不清的问题）。
//   ② 政策模拟（policy）：模拟一个**会算账的玩家** —— 按每格期望值从高到低开容器，
//      背包塞不下/风险将超上限就收手。它答的是"这张图能挣多少"（EV）。
//
// ⚠️ LLM 依赖：无。全程确定性计算，同 seed 同结果。
//
// 与 B 端 `loot-editor/_shared/sim.ts` 是**同构的两份实现**（两个仓不能互相 import）。
// 防漂移靠 `loot-sim-crosscheck`：同 seed 同配置下两边抽出的物品序列必须逐位一致。

import {
  applyPity, displayValue, findPlacement, findTable, generateLayout, indexItems, mulberry32, newGrid,
  orderOf, pendingPity, recycleValue, rollGrid, seedFromString,
  type LootBalance, type LootContainer, type LootContent, type LootItem, type LootMap, type LootTable, type Rarity,
  type PityState, type LayoutTally,
} from "./loot-engine"
import { bagDims } from "./loot-store"

const ZERO = (order: string[]): Record<string, number> => {
  const o: Record<string, number> = {}
  for (const r of order) o[r] = 0
  return o
}

// ---------------- 卡方检验 ----------------

/** Lanczos 近似的 lnΓ(x)（卡方 p 值要用） */
function lnGamma(x: number): number {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
  let y = x
  let tmp = x + 5.5
  tmp -= (x + 0.5) * Math.log(tmp)
  let ser = 1.000000000000190015
  for (let j = 0; j < 6; j++) ser += g[j] / ++y
  return -tmp + Math.log(2.5066282746310005 * ser / x)
}

/** 不完全 Γ 函数 Q(a,x) 的连分式展开 */
function gammaQ(s: number, x: number): number {
  const FPMIN = 1e-300
  if (x < 0 || s <= 0) return NaN
  if (x === 0) return 1
  if (x < s + 1) {
    // 级数展开
    let ap = s
    let sum = 1 / s
    let del = sum
    for (let n = 1; n < 500; n++) {
      ap++
      del *= x / ap
      sum += del
      if (Math.abs(del) < Math.abs(sum) * 1e-14) break
    }
    return 1 - sum * Math.exp(-x + s * Math.log(x) - lnGamma(s))
  }
  // 连分式算 Q
  let b = x + 1 - s
  let c = 1 / FPMIN
  let d = 1 / b
  let h = d
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - s)
    b += 2
    d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN
    c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-14) break
  }
  return Math.exp(-x + s * Math.log(x) - lnGamma(s)) * h
}

/** 卡方检验的 p 值（单尾：χ² 越大越可疑） */
export function chi2P(chi2: number, df: number): number {
  if (df <= 0 || !(chi2 > 0)) return 1
  return gammaQ(df / 2, chi2 / 2)
}

// ---------------- 每格期望值（与 B 端 evalMap 同式） ----------------

/**
 * 一个容器「每格」的期望面值（价值密度）。
 *
 * 形状化之后这件事变了味：过去"一格 = 一件"，现在"一格"可能被一件 2×2 吃掉四格。
 * 于是单格期望 = **填充率 × 平均每件的面值 ÷ 平均每件的占格数**：
 *   - `fillRate`：不是每格都有东西（< 1 才会有摸空的格子）；
 *   - `÷ 平均占格数`：占格越大的东西单件越值钱，但它吃掉的空间也越多 ——
 *     对"这一格值多少"这个问题，要除掉这个膨胀。
 *
 * ⚠️ 这是**解析近似**（假设格子总能被填满、忽略形状拼不进边角），用来给容器排序、
 *    给后台 EV 面板估个数。真正的数由下面的蒙特卡洛给出，两者差个百分之几是正常的。
 */
export function cellEv(
  ctn: LootContainer, table: LootTable | undefined, itemsById: Map<string, LootItem>,
  order: string[], tierBoost = 0,
): number {
  if (!table || table.pool.length === 0) return 0
  const boosted: Record<string, number> = { ...ctn.rarityWeights }
  if (tierBoost > 0) {
    for (let i = 2; i < order.length; i++) boosted[order[i]] = (boosted[order[i]] || 0) * (1 + tierBoost)
  }
  const total = order.reduce((s, r) => s + Math.max(0, boosted[r] || 0), 0)
  if (total <= 0) return 0
  let evValue = 0
  let evCells = 0
  for (const r of order) {
    const share = Math.max(0, boosted[r] || 0) / total
    if (share <= 0) continue
    const cands = table.pool.filter((p) => itemsById.get(p.itemId)?.rarity === r && (p.weight || 0) > 0)
    if (!cands.length) continue
    const wsum = cands.reduce((s, p) => s + p.weight, 0)
    const wavgValue = cands.reduce((s, p) => s + p.weight * (itemsById.get(p.itemId)?.baseValue || 0), 0) / wsum
    evValue += share * wavgValue
    // 占格数按**旋转前的形状**算：旋转不改格数，取配置形状即可
    const wavgCells = cands.reduce((s, p) => s + p.weight * Math.max(1, (itemsById.get(p.itemId)?.shape ? shapeCellsOf(itemsById.get(p.itemId)) : 1)), 0) / wsum
    evCells += share * wavgCells
  }
  if (evCells <= 0) return 0
  const fill = Math.min(1, Math.max(0, Number(ctn.fillRate) || 0))
  return (fill * evValue) / evCells
}

/** 取物品占格数（未配形状 = 1×1） */
function shapeCellsOf(item: LootItem | undefined): number {
  if (!item || !item.shape) return 1
  const s = item.shape
  if (s === "1x1") return 1
  if (s === "1x2") return 2
  if (s === "1x3") return 3
  if (s === "2x2") return 4
  if (s === "L" || s === "J") return 3
  if (s === "T" || s === "S") return 4
  return 1
}

// ---------------- 容器实例展开 ----------------

interface Inst { def: LootContainer; table: LootTable | undefined; evPerCell: number }

function expand(content: LootContent, map: LootMap, itemsById: Map<string, LootItem>, order: string[]): Inst[] {
  const out: Inst[] = []
  for (const mc of map.containers) {
    const def = content.containers.find((c) => c.id === mc.containerId)
    if (!def) continue
    const table = findTable(content.tables, def.tableId)
    const ev = cellEv(def, table, itemsById, order, map.tierBoost)
    const n = Math.max(0, Math.floor(mc.count))
    for (let i = 0; i < n; i++) out.push({ def, table, evPerCell: ev })
  }
  return out
}

/** 一个容器网格的**期望格数**（尺寸是随机的，取区间中点估一个） */
function avgCells(def: LootContainer): number {
  const c = (Math.max(1, def.colsMin) + Math.max(def.colsMin, def.colsMax)) / 2
  const r = (Math.max(1, def.rowsMin) + Math.max(def.rowsMin, def.rowsMax)) / 2
  return Math.max(1, c * r)
}

// ---------------- 报告结构 ----------------

export interface RarityShare {
  rarity: Rarity
  /** 配置权重折算的期望频率（0-1） */
  expected: number
  /** 实测频率（0-1） */
  observed: number
  /** 命中次数 */
  hits: number
  /** |observed - expected| */
  delta: number
}

export interface PityReport {
  containerId: string
  name: string
  afterRuns: number
  minRarity: Rarity
  /** 池子里「≥ minRarity」的候选数（0 = 保底触发时会退到更低档，要去补候选） */
  coveredCount: number
  /** 触发保底次数 */
  triggers: number
  /** 触发时出货次数 */
  forcedOk: number
  /** 触发时仍然空手（池子全空才会发生） */
  forcedFail: number
}

export interface SimReport {
  mapId: string
  mapName: string
  runs: number
  gate: number
  /** 背包总格数（cols×rows） */
  bagCells: number
  /** 地图期望总格数（各容器网格尺寸随机，取期望） */
  totalCells: number
  /** 分布检验的总抽取次数 */
  rolls: number
  share: RarityShare[]
  chi2: number
  df: number
  p: number
  maxDelta: number
  /** 全清（不看背包/风险）时的平均展示价 —— 经济"上限" */
  avgGrossAll: number
  /** 政策模拟：平均带出展示价 / 平均回收币 */
  avgKept: number
  avgPayout: number
  /** 平均开了几个容器 / 结束时的平均风险值 */
  avgContainers: number
  avgRisk: number
  /** 平均每局因背包塞不下而丢掉的件数 */
  avgDiscarded: number
  /** 平均每局摸到的格数 */
  avgCells: number
  /** 每次成功撤离的期望倍率 = 平均回收币 ÷ 门槛 */
  ratioExtract: number
  /** × 撤离率（与后台 EV 面板同口径） */
  ratioWithRate: number
  pity: PityReport[]
  issues: string[]
}

export interface SimOptions {
  runs?: number
  seed?: number
}

// ---------------- 主模拟 ----------------

/**
 * 跑一张图的平衡模拟。
 * @param runs 局数（10,000 局足够把 ±1.5% 的抽样误差压到 ~0.2%）
 */
export function simulateMap(content: LootContent, map: LootMap, opts: SimOptions = {}): SimReport {
  const runs = Math.max(1, Math.floor(opts.runs ?? 10_000))
  const baseSeed = (opts.seed ?? seedFromString(`loot-sim:${map.id}`)) >>> 0
  const itemsById = indexItems(content.items)
  const balance: LootBalance = content.balance
  const order = orderOf(content)
  const bag = bagDims(balance)
  const bagCells = bag.cols * bag.rows
  const limit = Math.max(1, Math.floor(map.riskLimit))
  const budgetMs = Math.max(1000, map.timeLimitSec * 1000)

  const insts = expand(content, map, itemsById, order)
  const totalCells = insts.reduce((s, x) => s + avgCells(x.def), 0)

  // ---- 分布检验的记账器：按「容器定义」聚合（同一容器在地图里出现多次也共用一个） ----
  const tallyBy = new Map<string, LayoutTally>()
  const tallyOf = (id: string): LayoutTally => {
    let t = tallyBy.get(id)
    if (!t) { t = { attempts: 0, byRarity: {} }; tallyBy.set(id, t) }
    return t
  }

  const pity7: PityState = {}
  const pityAgg = new Map<string, PityReport>()
  for (const x of insts) {
    const p = x.def.pity
    if (!p || pityAgg.has(x.def.id)) continue
    const tbl = content.tables.find((t) => t.id === x.def.tableId)
    const from = order.indexOf(p.minRarity)
    const coveredCount = (tbl?.pool ?? []).filter((e) => {
      const it = itemsById.get(e.itemId)
      return !!it && order.indexOf(it.rarity) >= from
    }).length
    pityAgg.set(x.def.id, {
      containerId: x.def.id, name: x.def.name, afterRuns: p.afterRuns, minRarity: p.minRarity,
      coveredCount, triggers: 0, forcedOk: 0, forcedFail: 0,
    })
  }

  // 政策模拟：优先级 = 每格期望值从高到低（玩家的手）
  const policyOrder = [...insts].sort((a, b) => b.evPerCell - a.evPerCell)
  const allOrder = policyOrder
  let rolls = 0, sumGrossAll = 0, sumKept = 0, sumPayout = 0
  let sumCtn = 0, sumRisk = 0, sumDiscard = 0, sumCellsTouched = 0

  for (let run = 0; run < runs; run++) {
    // 两条独立的随机流：分布检验与政策模拟互不干扰（各自可复现）
    const rngDist = mulberry32((baseSeed + Math.imul(run + 1, 0x9E3779B1)) >>> 0)
    const rngPlay = mulberry32((baseSeed ^ Math.imul(run + 1, 0x85EBCA77)) >>> 0)

    // ---------- ① 全清抽样（不带保底：测轮盘） ----------
    for (const x of allOrder) {
      const { cols, rows } = rollGrid(x.def, rngDist)
      const layout = generateLayout({
        def: x.def, table: x.table, itemsById, rng: rngDist, order,
        tierBoost: map.tierBoost, cols, rows, tally: tallyOf(x.def.id),
      })
      // 全清毛收益只算**真的摆进去的**（摆不下的玩家也拿不到）
      for (const p of layout) {
        const it = itemsById.get(p.itemId)
        if (it) sumGrossAll += displayValue(it, map)
      }
    }

    // ---------- ② 政策模拟（带保底 / 背包网格 / 风险上限 / 时限） ----------
    const grid = newGrid(bag.cols, bag.rows)
    let risk = 0, kept = 0, payout = 0, opened = 0, usedMs = 0, discarded = 0, touched = 0, filled = 0
    for (const x of policyOrder) {
      if (filled >= bagCells) break
      const { cols, rows } = rollGrid(x.def, rngPlay)
      const cells = cols * rows
      if (usedMs + cells * x.def.slotMs > budgetMs) continue
      if (risk + x.def.riskCost > limit) continue        // 开它就爆风险，换下一个

      const p = x.def.pity
      const force = pendingPity(pity7, x.def)
      const agg = p ? pityAgg.get(x.def.id) : undefined
      if (force && agg) agg.triggers++

      const layout = generateLayout({
        def: x.def, table: x.table, itemsById, rng: rngPlay, order,
        tierBoost: map.tierBoost, forceRarity: force, cols, rows,
      })
      risk += x.def.riskCost
      opened++
      usedMs += cells * x.def.slotMs
      touched += cells

      if (force && agg) {
        const first = layout.length ? itemsById.get(layout[0].itemId) : undefined
        if (first) {
          agg.forcedOk++
          if (order.indexOf(first.rarity) < order.indexOf(p!.minRarity) && agg.coveredCount === 0) {
            agg.coveredCount = -1   // 标记"退档兜底"，下面统一报 issue
          }
        } else agg.forcedFail++
      }

      for (const pl of layout) {
        const it = itemsById.get(pl.itemId)
        if (!it) continue
        const place = findPlacement(it.shape, bag.cols, bag.rows, grid)
        if (!place) { discarded++; continue }            // 形状塞不进剩余的空隙
        // 会算账的玩家：宁可早点跑，也不拿命换这一件
        const add = balance.riskPerSlot * Math.max(1, place.cells.length)
        if (balance.riskPerSlot > 0 && risk + add > limit) break
        for (const [cx, cy] of place.cells) grid[cy * bag.cols + cx] = true
        filled += place.cells.length
        risk += add
        kept += displayValue(it, map)
        payout += recycleValue(it, balance, map.valueMult)
      }

      let maxIdx = -1
      for (const pl of layout) {
        const it = itemsById.get(pl.itemId)
        if (it) maxIdx = Math.max(maxIdx, order.indexOf(it.rarity))
      }
      if (p) pity7[x.def.id] = applyPity(pity7, x.def, maxIdx >= 0 ? order[maxIdx] : null, force != null, order).state[x.def.id] ?? 0
      if (usedMs >= budgetMs) break
    }

    sumKept += kept
    sumPayout += payout
    sumCtn += opened
    sumRisk += risk
    sumDiscard += discarded
    sumCellsTouched += touched
  }

  // ---- 期望频率 ----
  // ⚠️ 权重必须按**实际抽取次数**加权（tally.attempts），不能按"格数"或"件数"估：
  //    网格尺寸随机、形状摆不下，都会让各容器的实际抽取次数偏离格数，
  //    按格数估出来的期望本身就是错的，卡方会把它误报成"轮盘不准"。
  // ⚠️ 实测也取自 tally（**含摆不下的**）—— 否则"大件摆不下"这个形状副作用
  //    会被算进轮盘的账上（大件往往又是高稀有度，表现为高稀有度偏低）。
  const uniq = new Map<string, Inst>()
  for (const x of insts) if (!uniq.has(x.def.id)) uniq.set(x.def.id, x)
  const hits = ZERO(order)
  const expShare = ZERO(order)
  let totalAttempts = 0
  for (const t of tallyBy.values()) totalAttempts += t.attempts
  rolls = totalAttempts
  for (const t of tallyBy.values()) {
    for (const r of order) hits[r] = (hits[r] || 0) + (t.byRarity[r] || 0)
  }
  if (totalAttempts > 0) {
    for (const x of uniq.values()) {
      const n = tallyBy.get(x.def.id)?.attempts ?? 0
      if (n <= 0) continue
      const w = n / totalAttempts
      const boosted: Record<string, number> = { ...x.def.rarityWeights }
      if (map.tierBoost > 0) {
        for (let i = 2; i < order.length; i++) boosted[order[i]] = (boosted[order[i]] || 0) * (1 + map.tierBoost)
      }
      const tot = order.reduce((s, r) => s + Math.max(0, boosted[r] || 0), 0)
      if (tot <= 0) continue
      for (const r of order) expShare[r] = (expShare[r] || 0) + w * (Math.max(0, boosted[r] || 0) / tot)
    }
  }

  const share: RarityShare[] = order.map((r) => {
    const observed = rolls > 0 ? (hits[r] || 0) / rolls : 0
    return { rarity: r, expected: expShare[r] || 0, observed, hits: hits[r] || 0, delta: Math.abs(observed - (expShare[r] || 0)) }
  })
  let chi2 = 0
  for (const s of share) {
    const e = s.expected * rolls
    if (e <= 0) continue
    chi2 += ((s.hits - e) * (s.hits - e)) / e
  }
  const df = share.filter((s) => s.expected * rolls > 0).length - 1
  const p = chi2P(chi2, df)

  const gate = Math.max(1, map.entry.coins || 0)
  const avgPayout = sumPayout / runs
  const ratioExtract = avgPayout / gate
  const ratioWithRate = (avgPayout * balance.extractRate) / gate

  const pity = [...pityAgg.values()]
  const issues = collectIssues(map, content, itemsById, insts, totalCells, bagCells, limit, balance, share, ratioWithRate, pity, p)

  return {
    mapId: map.id, mapName: map.name, runs, gate, bagCells, totalCells, rolls, share,
    chi2, df, p, maxDelta: share.reduce((m, s) => Math.max(m, s.delta), 0),
    avgGrossAll: sumGrossAll / runs,
    avgKept: sumKept / runs,
    avgPayout,
    avgContainers: sumCtn / runs,
    avgRisk: sumRisk / runs,
    avgDiscarded: sumDiscard / runs,
    avgCells: sumCellsTouched / runs,
    ratioExtract, ratioWithRate,
    pity, issues,
  }
}

/** 把"能看出来但不该悄悄过去"的配置问题列出来（B 端面板直接显示） */
function collectIssues(
  map: LootMap, content: LootContent, itemsById: Map<string, LootItem>, insts: Inst[],
  totalCells: number, bagCells: number, limit: number, balance: LootBalance,
  share: RarityShare[], ratioWithRate: number, pity: PityReport[], p: number,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()

  // 1) 某档有权重、但掉落表里没有该档候选 → 引擎会降档，卡方检验随之失真
  for (const x of insts) {
    if (seen.has(x.def.id)) continue
    seen.add(x.def.id)
    const tbl = x.table
    if (!tbl || tbl.pool.length === 0) { out.push(`容器「${x.def.name}」的掉落表为空 → 每格都会空手`); continue }
    const missing = orderOf(content).filter((r) => (x.def.rarityWeights[r] || 0) > 0
      && !tbl.pool.some((e) => itemsById.get(e.itemId)?.rarity === r))
    if (missing.length) out.push(`容器「${x.def.name}」的掉落表里没有 ${missing.join("/")} 候选 → 抽到这些档会降档（分布检验失真）`)
  }
  // 2) 保底档无候选
  for (const pr of pity) {
    if (pr.coveredCount === 0) out.push(`容器「${pr.name}」的保底要求 ${pr.minRarity}，但掉落表里没有该档及以上候选 → 保底只能退到更低档`)
    if (pr.coveredCount === -1) out.push(`容器「${pr.name}」保底触发时退档兜底（补一个 ${pr.minRarity} 候选即可）`)
    if (pr.coveredCount > 0 && pr.triggers === 0) out.push(`容器「${pr.name}」配了保底但 ${map.name} 里一次都没触发（容器数太少或概率太高）`)
  }
  // 3) 背包吃不下地图格数 → 后面的容器白配
  if (bagCells < totalCells) out.push(`背包 ${bagCells} 格 < 地图期望 ${Math.round(totalCells)} 格 → 有一部分永远带不走，容器配比可以再收一点`)
  // 4) 风险上限低于"吃满背包"所需
  const riskFor = insts.reduce((s, x) => s + x.def.riskCost, 0) + bagCells * balance.riskPerSlot
  if (limit < riskFor) out.push(`风险上限 ${limit} < 吃满背包约需 ${riskFor} → 风险先于背包成为瓶颈（这是设计选择，不是错误）`)
  // 5) EV 越界
  if (ratioWithRate > balance.evRejectRatio) out.push(`EV 倍率 ${ratioWithRate.toFixed(2)}× 超过拒绝阈值 ${balance.evRejectRatio}× → 经济过厚，该降收益或提门槛`)
  else if (ratioWithRate > balance.evWarnRatio) out.push(`EV 倍率 ${ratioWithRate.toFixed(2)}× 超过警告阈值 ${balance.evWarnRatio}×（设计目标区间 [1.5, 3.5]）`)
  else if (ratioWithRate < 1.5) out.push(`EV 倍率 ${ratioWithRate.toFixed(2)}× 低于设计下限 1.5× → 打这张图不划算，该提收益或降门槛`)
  // 6) 拟合
  if (p <= 0.05) out.push(`卡方 p = ${p.toFixed(4)} ≤ 0.05：实测分布与配置权重显著不符（先看上面有没有"降档"类问题）`)
  return out
}

// ---------------- 保底验收（200 轮） ----------------

export interface PitySimResult {
  containerId: string
  containerName: string
  afterRuns: number
  minRarity: Rarity
  cycles: number
  /** 触发次数（每轮至少一次，构造上必然 > 0） */
  triggers: number
  /** 触发时"至少 minRarity"的次数 */
  metCount: number
  /** 触发时仍然空手（池子全空才会出现） */
  emptyCount: number
  /** 触发时实际出的档位分布 */
  forcedRarity: Record<string, number>
  /** 池子里「≥ minRarity」的候选数 */
  coveredCount: number
}

/**
 * 保底是否真的 100% 生效：让玩家"连续 afterRuns 次不出目标档"，看下一次。
 * 每轮独立重置计数，避免上一轮的状态影响下一轮。
 */
export function simulatePity(
  content: LootContent, mapId: string, containerId: string, cycles = 200, seed = 0x51EED,
): PitySimResult {
  const map = content.maps.find((m) => m.id === mapId)
  const def = content.containers.find((c) => c.id === containerId)
  const itemsById = indexItems(content.items)
  const order = orderOf(content)
  if (!def || !def.pity) throw new Error(`容器 ${containerId} 没有配保底`)
  const table = findTable(content.tables, def.tableId)
  const p = def.pity
  const from = order.indexOf(p.minRarity)
  const coveredCount = (table?.pool ?? []).filter((e) => {
    const it = itemsById.get(e.itemId)
    return !!it && order.indexOf(it.rarity) >= from
  }).length

  const forcedRarity = ZERO(order)
  let triggers = 0, metCount = 0, emptyCount = 0

  for (let c = 0; c < cycles; c++) {
    const rng = mulberry32((seed + Math.imul(c + 1, 0x27D4EB2F)) >>> 0)
    let state: PityState = {}
    // 最多开到 afterRuns+1 次：前 afterRuns 次可以"故意没出"，第 afterRuns+1 次必须触发
    for (let step = 0; step <= p.afterRuns; step++) {
      const force = pendingPity(state, def)
      const { cols, rows } = rollGrid(def, rng)
      const layout = generateLayout({
        def, table, itemsById, rng, order, tierBoost: map?.tierBoost ?? 0, forceRarity: force, cols, rows,
      })
      let maxIdx = -1
      for (const pl of layout) {
        const it = itemsById.get(pl.itemId)
        if (it) maxIdx = Math.max(maxIdx, order.indexOf(it.rarity))
      }
      if (force) {
        triggers++
        const first = layout.length ? itemsById.get(layout[0].itemId) : undefined
        if (!first) emptyCount++
        else {
          forcedRarity[first.rarity] = (forcedRarity[first.rarity] || 0) + 1
          if (order.indexOf(first.rarity) >= from) metCount++
        }
        break
      }
      state = applyPity(state, def, maxIdx >= 0 ? order[maxIdx] : null, false, order).state
    }
  }

  return {
    containerId, containerName: def.name, afterRuns: p.afterRuns, minRarity: p.minRarity,
    cycles, triggers, metCount, emptyCount, forcedRarity, coveredCount,
  }
}

/** 逐次抽取的"同序列指纹"：给跨端同构对拍用（B 端 sim 必须给出同一串） */
export function rollFingerprint(
  content: LootContent, mapId: string, containerId: string, draws: number, seed = 12345,
): string[] {
  const def = content.containers.find((c) => c.id === containerId)
  const itemsById = indexItems(content.items)
  const order = orderOf(content)
  if (!def) throw new Error(`容器 ${containerId} 不存在`)
  const table = findTable(content.tables, def.tableId)
  const map = content.maps.find((m) => m.id === mapId)
  const rng = mulberry32(seed)
  const out: string[] = []
  for (let i = 0; i < draws; i++) {
    const { cols, rows } = rollGrid(def, rng)
    const layout = generateLayout({
      def, table, itemsById, rng, order, tierBoost: map?.tierBoost ?? 0, cols, rows,
    })
    out.push(layout.map((p) => {
      const it = itemsById.get(p.itemId)
      return it ? `${it.id}:${it.rarity}:${p.cells.length}@${p.x},${p.y}r${p.rot}` : "null"
    }).join("|"))
  }
  return out
}
