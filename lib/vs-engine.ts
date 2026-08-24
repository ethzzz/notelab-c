// —— 吸血鬼幸存者 lite 引擎 v2：纯逻辑，不依赖 DOM ——

export interface Enemy {
  x: number; y: number; hp: number; maxHp: number; sp: number; dmg: number; r: number
  type: number; flash: number; touch: number; oCd: number; seed: number
  elite: boolean; boss: boolean; drop: boolean; shootT: number
}
export interface Proj {
  x: number; y: number; vx: number; vy: number; dmg: number; r: number
  pierce: number; life: number; kind: number; spin: number // 0 魔弹 1 飞刀 2 回旋斧
}
export interface EBullet { x: number; y: number; vx: number; vy: number; dmg: number; life: number }
export interface Gem { x: number; y: number; v: number }
export interface Pick { x: number; y: number; kind: "heart" | "bomb" | "chest" }
export interface Zap { x1: number; y1: number; x2: number; y2: number; t: number }
export interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; r: number }
export interface FloatText { x: number; y: number; t: number; text: string; color: string }
export interface Player {
  x: number; y: number; hp: number; maxHp: number; sp: number; mag: number
  level: number; xp: number; xpNext: number; hurt: number; faceX: number; faceY: number
  cdMul: number; dmgMul: number
}
export interface MetaUpg { hp: number; sp: number; pow: number; mag: number }
export interface GameState {
  t: number; kills: number; over: boolean; win: boolean; pending: number
  player: Player
  weapons: Record<string, number>; passives: Record<string, number>
  timers: Record<string, number>
  orbAngle: number; auraTick: number
  enemies: Enemy[]; projs: Proj[]; ebullets: EBullet[]; gems: Gem[]; picks: Pick[]
  parts: Particle[]; texts: FloatText[]; zaps: Zap[]
  spawnAcc: number; eliteAt: number; bossSpawned: boolean; shake: number
}
export interface Choice { kind: "weapon" | "passive" | "heal"; id: string; icon: string; title: string; desc: string; isNew: boolean }

export const WEAPON_DEFS: Record<string, { name: string; icon: string; max: number; desc: string }> = {
  wand: { name: "魔法弹", icon: "🪄", max: 5, desc: "自动向最近敌人发射魔弹，每级 +1 发" },
  knife: { name: "飞刀", icon: "🗡️", max: 5, desc: "朝面朝方向掷出飞刀，每级 +1 把" },
  bible: { name: "圣典", icon: "📖", max: 5, desc: "环绕周身的旋转刃，每级 +1 枚" },
  aura: { name: "蒜香力场", icon: "🧄", max: 5, desc: "持续灼伤范围内敌人，每级扩大并加强" },
  bolt: { name: "闪电链", icon: "⚡", max: 5, desc: "随机落雷打击附近敌人并链式跳跃" },
  axe: { name: "回旋斧", icon: "🪓", max: 5, desc: "抛物线掷出高伤斧头，穿透一切" },
}
export const PASSIVE_DEFS: Record<string, { name: string; icon: string; max: number; desc: string }> = {
  speed: { name: "迅捷靴", icon: "👟", max: 5, desc: "移动速度 +12%" },
  hp: { name: "生命力", icon: "❤️", max: 5, desc: "最大生命 +20 并回复 20" },
  power: { name: "力量", icon: "💪", max: 5, desc: "全部伤害 +15%" },
  haste: { name: "凝神", icon: "⏳", max: 5, desc: "武器冷却 -8%" },
  magnet: { name: "磁铁", icon: "🧲", max: 5, desc: "拾取范围 +40%" },
}

const xpNeed = (lv: number) => Math.floor(5 + lv * 3 + Math.pow(lv, 1.5))

export function createState(upg?: MetaUpg): GameState {
  const u = upg ?? { hp: 0, sp: 0, pow: 0, mag: 0 }
  return {
    t: 0, kills: 0, over: false, win: false, pending: 0,
    player: {
      x: 0, y: 0, hp: 100 + 15 * u.hp, maxHp: 100 + 15 * u.hp, sp: 175 + 8 * u.sp,
      mag: 80 * (1 + 0.15 * u.mag), level: 1, xp: 0, xpNext: xpNeed(1), hurt: 0,
      faceX: 1, faceY: 0, cdMul: 1, dmgMul: 1 + 0.06 * u.pow,
    },
    weapons: { wand: 1 }, passives: {}, timers: { wand: 0.3 },
    orbAngle: 0, auraTick: 0,
    enemies: [], projs: [], ebullets: [], gems: [], picks: [],
    parts: [], texts: [], zaps: [],
    spawnAcc: 0, eliteAt: 60, bossSpawned: false, shake: 0,
  }
}

// ---------- 内部工具 ----------
function burst(s: GameState, x: number, y: number, color: string, n: number) {
  if (s.parts.length > 280) return
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 120
    s.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4, max: 0.4, color, r: 2 + Math.random() * 2.5 })
  }
}

function dtext(s: GameState, x: number, y: number, text: string, color: string, t = 0.6) {
  if (s.texts.length > 80) return
  s.texts.push({ x, y, t, text, color })
}

function hit(s: GameState, e: Enemy, dmg: number) {
  e.hp -= dmg
  e.flash = 0.12
  dtext(s, e.x + (Math.random() - 0.5) * 14, e.y - e.r, String(Math.round(dmg)), "#fecaca", 0.5)
  if (e.hp <= 0) {
    s.kills++
    burst(s, e.x, e.y, e.elite ? "#facc15" : "#c4b5fd", e.elite ? 16 : 5)
    if (e.boss) { s.win = true; burst(s, e.x, e.y, "#facc15", 40); return }
    if (e.drop) {
      const drops = e.elite ? 10 : e.type === 2 ? 3 : 1
      for (let i = 0; i < drops; i++) {
        s.gems.push({ x: e.x + (Math.random() - 0.5) * 30, y: e.y + (Math.random() - 0.5) * 30, v: e.elite ? 3 : 1 })
      }
      if (e.elite) s.picks.push({ x: e.x, y: e.y, kind: "chest" })
      else if (e.type === 2 && Math.random() < 0.1) s.picks.push({ x: e.x, y: e.y, kind: "heart" })
      else if (e.type === 4 && Math.random() < 0.12) s.picks.push({ x: e.x, y: e.y, kind: "bomb" })
    }
    if (e.elite) dtext(s, e.x, e.y - 20, "ELITE DOWN!", "#facc15", 1)
  }
}

function hurtPlayer(s: GameState, dmg: number) {
  const p = s.player
  p.hp -= dmg
  p.hurt = 0.35
  s.shake = 1
  burst(s, p.x, p.y, "#f87171", 6)
  if (p.hp <= 0) { p.hp = 0; s.over = true }
}

function spawnEnemy(s: GameState, elite: boolean) {
  const a = Math.random() * Math.PI * 2
  const d = 520 + Math.random() * 160
  const x = s.player.x + Math.cos(a) * d, y = s.player.y + Math.sin(a) * d
  const scale = 1 + (s.t / 50) * 0.4
  const r = Math.random()
  let type = 0
  if (s.t > 100 && r > 0.92) type = 3
  else if (s.t > 75 && r > 0.82) type = 2
  else if (s.t > 60 && r > 0.68) type = 4
  else if (s.t > 40 && r > 0.45) type = 1
  const base = type === 2 ? { r: 24, sp: 38 + Math.random() * 8, hp: 70, dmg: 16 }
    : type === 1 ? { r: 10, sp: 105 + Math.random() * 25, hp: 7, dmg: 6 }
      : type === 3 ? { r: 13, sp: 55, hp: 16, dmg: 8 }
        : type === 4 ? { r: 11, sp: 80, hp: 9, dmg: 0 }
          : { r: 14, sp: 55 + Math.random() * 20, hp: 12, dmg: 8 }
  if (elite) Object.assign(base, { r: 30, sp: 46, hp: 480, dmg: 25 })
  s.enemies.push({
    x, y, hp: base.hp * scale * (elite ? scale : 1), maxHp: base.hp * scale * (elite ? scale : 1),
    sp: base.sp, dmg: base.dmg, r: base.r, type, flash: 0, touch: 0, oCd: 0,
    seed: Math.random() * Math.PI * 2, elite, boss: false, drop: true, shootT: 1 + Math.random() * 2,
  })
}

function zap(s: GameState, e: Enemy, dmg: number, from?: Enemy) {
  s.zaps.push(from
    ? { x1: from.x, y1: from.y, x2: e.x, y2: e.y, t: 0.18 }
    : { x1: e.x + (Math.random() - 0.5) * 60, y1: e.y - 170, x2: e.x, y2: e.y, t: 0.18 })
  hit(s, e, dmg)
}

// ---------- 主更新 ----------
export function update(s: GameState, dt: number, dx: number, dy: number) {
  if (s.over || s.win) return
  s.t += dt
  const p = s.player
  p.hurt = Math.max(0, p.hurt - dt)
  s.shake = Math.max(0, s.shake - dt * 3)
  if (dx || dy) {
    const n = Math.hypot(dx, dy)
    p.x += (dx / n) * p.sp * dt
    p.y += (dy / n) * p.sp * dt
    p.faceX = dx / n; p.faceY = dy / n
  }

  // 生成敌人
  if (s.enemies.length < 220) {
    s.spawnAcc += dt
    const interval = Math.max(0.12, 0.85 - s.t * 0.008)
    while (s.spawnAcc >= interval) { s.spawnAcc -= interval; spawnEnemy(s, false) }
  }
  if (s.t >= s.eliteAt) { s.eliteAt += 60; spawnEnemy(s, true); dtext(s, p.x, p.y - 60, "⚠ 精英来袭", "#f87171", 1.6) }
  if (!s.bossSpawned && s.t >= 300) {
    s.bossSpawned = true
    const scale = 1 + s.t / 150
    s.enemies.push({
      x: p.x + 600, y: p.y, hp: 3500 * scale, maxHp: 3500 * scale, sp: 62, dmg: 25, r: 46,
      type: 5, flash: 0, touch: 0, oCd: 0, seed: 0, elite: true, boss: true, drop: false, shootT: 99,
    })
    dtext(s, p.x, p.y - 80, "🐲 魔王降临！击败它获得胜利", "#facc15", 2.5)
  }

  // 敌人行为
  for (const e of s.enemies) {
    e.flash = Math.max(0, e.flash - dt); e.touch = Math.max(0, e.touch - dt); e.oCd = Math.max(0, e.oCd - dt)
    const ddx = p.x - e.x, ddy = p.y - e.y
    const d = Math.hypot(ddx, ddy) || 1
    let mx = ddx / d, my = ddy / d
    if (e.type === 1 || e.type === 0 || e.type === 2 || e.type === 5) {
      const wob = Math.sin(s.t * 3 + e.seed) * 0.35
      mx += -my * wob; my += mx * wob * 0.5
    } else if (e.type === 3) {
      // 法师：保持距离，环向游走
      if (d > 320) { /* 接近 */ } else if (d < 230) { mx = -mx; my = -my } else {
        const sgn = Math.sin(e.seed) > 0 ? 1 : -1
        mx = (-ddy / d) * sgn; my = (ddx / d) * sgn
      }
      e.shootT -= dt
      if (e.shootT <= 0 && d < 540) {
        e.shootT = 2.4
        s.ebullets.push({ x: e.x, y: e.y, vx: (ddx / d) * 230, vy: (ddy / d) * 230, dmg: 10, life: 4 })
      }
    } else if (e.type === 4) {
      // 自爆蜘蛛：近距加速
      const sp = d < 200 ? 175 : e.sp
      e.x += mx * sp * dt; e.y += my * sp * dt
      if (d < 28) {
        e.hp = 0; e.drop = false
        burst(s, e.x, e.y, "#fb923c", 18)
        hurtPlayer(s, 22)
      }
      continue
    }
    e.x += mx * e.sp * dt
    e.y += my * e.sp * dt
    if (d < e.r + 12 && e.touch <= 0 && e.dmg > 0) {
      e.touch = 0.9
      hurtPlayer(s, e.dmg)
    }
  }

  // 武器计时
  for (const id of Object.keys(s.weapons)) s.timers[id] = (s.timers[id] ?? 0) - dt

  // 魔法弹
  if (s.weapons.wand && (s.timers.wand ?? 0) <= 0) {
    s.timers.wand = 1.15 * p.cdMul
    const n = s.weapons.wand
    const near = s.enemies.filter(e => e.hp > 0).sort((a, b) => ((a.x - p.x) ** 2 + (a.y - p.y) ** 2) - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2)).slice(0, n)
    if (near.length) for (let i = 0; i < n; i++) {
      const tgt = near[i % near.length]
      const a = Math.atan2(tgt.y - p.y, tgt.x - p.x) + (Math.random() - 0.5) * 0.08
      s.projs.push({ x: p.x, y: p.y, vx: Math.cos(a) * 400, vy: Math.sin(a) * 400, dmg: 12 * p.dmgMul, r: 5, pierce: 0, life: 1.6, kind: 0, spin: 0 })
    }
  }
  // 飞刀
  if (s.weapons.knife && (s.timers.knife ?? 0) <= 0) {
    s.timers.knife = 0.95 * p.cdMul
    const n = s.weapons.knife + 1
    const baseA = Math.atan2(p.faceY, p.faceX)
    for (let i = 0; i < n; i++) {
      const a = baseA + (i - (n - 1) / 2) * 0.14
      s.projs.push({ x: p.x, y: p.y, vx: Math.cos(a) * 480, vy: Math.sin(a) * 480, dmg: 9 * p.dmgMul, r: 4, pierce: 1, life: 1.1, kind: 1, spin: a })
    }
  }
  // 闪电链
  if (s.weapons.bolt && (s.timers.bolt ?? 0) <= 0) {
    s.timers.bolt = 1.7 * p.cdMul
    const lv = s.weapons.bolt
    const inView = s.enemies.filter(e => e.hp > 0 && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < 620 * 620)
    for (let i = 0; i < lv && inView.length; i++) {
      let cur = inView[Math.floor(Math.random() * inView.length)]
      zap(s, cur, 26 * p.dmgMul)
      for (let c = 0; c < Math.ceil(lv / 2); c++) {
        let nxt: Enemy | null = null, bd = 200 * 200
        for (const o of inView) {
          if (o === cur || o.hp <= 0) continue
          const dd = (o.x - cur.x) ** 2 + (o.y - cur.y) ** 2
          if (dd < bd) { bd = dd; nxt = o }
        }
        if (!nxt) break
        zap(s, nxt, 18 * p.dmgMul, cur)
        cur = nxt
      }
    }
  }
  // 回旋斧
  if (s.weapons.axe && (s.timers.axe ?? 0) <= 0) {
    s.timers.axe = 1.5 * p.cdMul
    const n = s.weapons.axe
    const baseA = Math.atan2(p.faceY, p.faceX)
    for (let i = 0; i < n; i++) {
      const a = baseA + (i - (n - 1) / 2) * 0.3
      s.projs.push({ x: p.x, y: p.y - 10, vx: Math.cos(a) * 300, vy: -240 + Math.sin(a) * 60, dmg: 22 * p.dmgMul, r: 9, pierce: 99, life: 2.4, kind: 2, spin: Math.random() * 6 })
    }
  }
  // 圣典
  if (s.weapons.bible) {
    s.orbAngle += dt * 2.4
    const lv = s.weapons.bible
    const R = 70 + lv * 8
    for (let i = 0; i < lv + 1; i++) {
      const a = s.orbAngle + (i * Math.PI * 2) / (lv + 1)
      const ox = p.x + Math.cos(a) * R, oy = p.y + Math.sin(a) * R
      for (const e of s.enemies) {
        if (e.hp > 0 && e.oCd <= 0 && (e.x - ox) ** 2 + (e.y - oy) ** 2 < (e.r + 10) ** 2) {
          e.oCd = 0.6
          hit(s, e, (11 + 2 * lv) * p.dmgMul)
        }
      }
    }
  }
  // 蒜香力场
  if (s.weapons.aura) {
    s.auraTick -= dt
    if (s.auraTick <= 0) {
      s.auraTick = 0.45
      const lv = s.weapons.aura
      const R = 60 + lv * 14
      for (const e of s.enemies) {
        if (e.hp > 0 && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < (e.r + R) ** 2) hit(s, e, (5 + 2 * lv) * p.dmgMul)
      }
    }
  }

  // 我方弹体
  for (const pr of s.projs) {
    if (pr.kind === 2) pr.vy += 520 * dt
    pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt; pr.spin += dt * 12
    for (const e of s.enemies) {
      if (e.hp > 0 && (e.x - pr.x) ** 2 + (e.y - pr.y) ** 2 < (e.r + pr.r) ** 2) {
        hit(s, e, pr.dmg)
        if (--pr.pierce < 0) { pr.life = 0; break }
      }
    }
  }
  s.projs = s.projs.filter(pr => pr.life > 0)

  // 敌方弹体
  for (const b of s.ebullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt
    if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < 16 * 16) { b.life = 0; hurtPlayer(s, b.dmg) }
  }
  s.ebullets = s.ebullets.filter(b => b.life > 0)
  s.enemies = s.enemies.filter(e => e.hp > 0)

  // 宝石
  const keptG: Gem[] = []
  for (const g of s.gems) {
    const ddx = p.x - g.x, ddy = p.y - g.y
    const d = Math.hypot(ddx, ddy) || 1
    if (d < p.mag) { g.x += (ddx / d) * 320 * dt; g.y += (ddy / d) * 320 * dt }
    if (d < 20) {
      p.xp += g.v
      if (g.v >= 3) dtext(s, g.x, g.y, `+${g.v}`, "#facc15", 0.8)
      while (p.xp >= p.xpNext) { p.xp -= p.xpNext; p.level++; s.pending++; p.xpNext = xpNeed(p.level) }
    } else keptG.push(g)
  }
  s.gems = keptG

  // 道具拾取
  const keptP: Pick[] = []
  for (const pk of s.picks) {
    const ddx = p.x - pk.x, ddy = p.y - pk.y
    const d = Math.hypot(ddx, ddy) || 1
    if (d < p.mag) { pk.x += (ddx / d) * 260 * dt; pk.y += (ddy / d) * 260 * dt }
    if (d < 24) {
      if (pk.kind === "heart") { p.hp = Math.min(p.maxHp, p.hp + 30); dtext(s, p.x, p.y - 24, "+30 ❤", "#4ade80", 0.9) }
      else if (pk.kind === "bomb") {
        for (const e of s.enemies) if (!e.boss) { e.hp = 0; e.drop = false; s.kills++; burst(s, e.x, e.y, "#fb923c", 3) }
        for (const e of s.enemies) if (e.boss) hit(s, e, 300 * p.dmgMul)
        s.shake = 1.5
        dtext(s, p.x, p.y - 24, "💥 清场!", "#fb923c", 1.2)
      } else {
        const ids = Object.keys(WEAPON_DEFS).filter(id => (s.weapons[id] ?? 0) < WEAPON_DEFS[id].max)
        if (ids.length) {
          const id = ids[Math.floor(Math.random() * ids.length)]
          s.weapons[id] = (s.weapons[id] ?? 0) + 1
          dtext(s, p.x, p.y - 24, `🎁 ${WEAPON_DEFS[id].name} 强化!`, "#facc15", 1.2)
        } else { p.xp += 30; dtext(s, p.x, p.y - 24, "🎁 +30 XP", "#facc15", 1.2) }
      }
    } else keptP.push(pk)
  }
  s.picks = keptP

  // 粒子 / 浮字 / 闪电
  for (const pt of s.parts) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt }
  s.parts = s.parts.filter(pt => pt.life > 0)
  for (const tx of s.texts) { tx.y -= 30 * dt; tx.t -= dt }
  s.texts = s.texts.filter(tx => tx.t > 0)
  for (const z of s.zaps) z.t -= dt
  s.zaps = s.zaps.filter(z => z.t > 0)
}

// ---------- 升级选择 ----------
export function rollChoices(s: GameState): Choice[] {
  const pool: Choice[] = []
  for (const [id, def] of Object.entries(WEAPON_DEFS)) {
    const lv = s.weapons[id] ?? 0
    if (lv < def.max) pool.push({ kind: "weapon", id, icon: def.icon, title: lv === 0 ? def.name : `${def.name} Lv${lv + 1}`, desc: def.desc, isNew: lv === 0 })
  }
  for (const [id, def] of Object.entries(PASSIVE_DEFS)) {
    const lv = s.passives[id] ?? 0
    if (lv < def.max) pool.push({ kind: "passive", id, icon: def.icon, title: lv === 0 ? def.name : `${def.name} Lv${lv + 1}`, desc: def.desc, isNew: lv === 0 })
  }
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]] }
  const out = pool.slice(0, 3)
  while (out.length < 3) out.push({ kind: "heal", id: "heal", icon: "🍗", title: "烤鸡腿", desc: "立即回复 30 点生命", isNew: false })
  return out
}

export function applyChoice(s: GameState, c: Choice) {
  const p = s.player
  if (c.kind === "weapon") s.weapons[c.id] = (s.weapons[c.id] ?? 0) + 1
  else if (c.kind === "passive") {
    s.passives[c.id] = (s.passives[c.id] ?? 0) + 1
    if (c.id === "speed") p.sp *= 1.12
    else if (c.id === "hp") { p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 20) }
    else if (c.id === "power") p.dmgMul *= 1.15
    else if (c.id === "haste") p.cdMul *= 0.92
    else if (c.id === "magnet") p.mag *= 1.4
  } else p.hp = Math.min(p.maxHp, p.hp + 30)
}
