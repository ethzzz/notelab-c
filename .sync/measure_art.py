#!/usr/bin/env python3
"""
measure_art.py — Spire 节点素材量化 + 重命名覆盖工具

用途：
  换一批新素材时，自动：
    1) 逐像素解析 PNG，按 alpha>25 算「可见内容包围盒」，得到
       K = 画布边长 / 内容包围盒直径（max(bw,bh)）
       —— K 即 SpireMap 的 ART_BOX_K，保证各节点 motif 渲染到统一 VIS
       时盘面疏密一致（背景留白多少由 K 控制）。
    2) 按 MAP 把素材包里的源文件名复制/重命名为目标文件名
       （icon-*.png / link-straight.png），覆盖到 public/spire/art/。

依赖：仅标准库（struct / zlib / os / shutil / argparse），无第三方包。
      因为模型环境无法 Read PNG，这里手动解 PNG + Paeth 反滤波逐像素算亮度。

用法：
  # 只量 K、不复制（重算 ART_BOX_K 前先预览）
  python .sync/measure_art.py --dry-run

  # 正式复制重命名（默认源/目标目录见下方常量）
  python .sync/measure_art.py

  # 指定其它素材包 / 目标目录
  python .sync/measure_art.py --src /path/to/pack/png --dst /path/to/public/spire/art

注：MAP / LINK 是当前 Spire 节点语义的权威映射，换素材时按新包文件名改这里即可。
"""

import struct, zlib, os, shutil, argparse

# ---- 默认目录（可用 --src / --dst 覆盖）----
DEFAULT_SRC = "C:/Users/thz/WorkBuddy/2026-09-26-00-01-34/dungeon-element-pack/png"
DEFAULT_DST = "E:/code/NoteLab/notelab-c/public/spire/art"

# 节点类型 -> (素材包源文件名, 目标文件名)
MAP = {
    "enemy":  ("stone-skull.png",  "icon-normal.png"),
    "elite":  ("demon.png",        "icon-elite.png"),
    "boss":   ("demon-boss.png",   "icon-boss.png"),
    "rest":   ("campfire.png",     "icon-rest.png"),
    "shop":   ("merchant.png",     "icon-shop.png"),
    "random": ("stone-empty.png",  "icon-random.png"),
}
LINK = ("path-bridge.png", "link-straight.png")

ALPHA_THRESH = 25  # 可见像素阈值（低于此视为透明/留白）


def read_png(path):
    with open(path, "rb") as f:
        data = f.read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", f"{path} 不是 PNG"
    pos = 8
    width = height = colort = plte = trns = idat = None
    while pos < len(data):
        ln = struct.unpack(">I", data[pos:pos + 4])[0]
        ct = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + ln]
        if ct == b"IHDR":
            width, height, bitd, colort = struct.unpack(">IIBB", chunk[:10])
        elif ct == b"PLTE":
            plte = chunk
        elif ct == b"tRNS":
            trns = chunk
        elif ct == b"IDAT":
            idat = idat + chunk if idat else chunk
        elif ct == b"IEND":
            break
        pos += 12 + ln
    raw = zlib.decompress(idat)
    ch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[colort]
    bpp = ch
    stride = width * bpp
    out = bytearray()
    prev = bytearray(stride)
    p = 0

    def paeth(a, b, c):
        pp = a + b - c
        pa = abs(pp - a)
        pb = abs(pp - b)
        pc = abs(pp - c)
        if pa <= pb and pa <= pc:
            return a
        if pb <= pc:
            return b
        return c

    for y in range(height):
        ft = raw[p]
        p += 1
        line = bytearray(raw[p:p + stride])
        p += stride
        for x in range(stride):
            a = line[x - bpp] if x >= bpp else 0
            b = prev[x]
            c = prev[x - bpp] if x >= bpp else 0
            if ft == 1:
                line[x] = (line[x] + a) & 255
            elif ft == 2:
                line[x] = (line[x] + b) & 255
            elif ft == 3:
                line[x] = (line[x] + ((a + b) >> 1)) & 255
            elif ft == 4:
                line[x] = (line[x] + paeth(a, b, c)) & 255
        out += line
        prev = line
    return width, height, colort, plte, trns, ch, out


def content_extent(path):
    """返回 (w, h, 内容包围盒宽 bw, 内容包围盒高 bh)。alpha>ALPHA_THRESH 视为可见。"""
    w, h, colort, plte, trns, ch, buf = read_png(path)
    n = w * h
    minx = w
    miny = h
    maxx = 0
    maxy = 0
    found = False
    pal = None
    if colort == 3 and plte:
        pal = [(plte[i], plte[i + 1], plte[i + 2]) for i in range(0, len(plte), 3)]
        ta = {}
        if trns:
            for i in range(len(trns)):
                ta[i] = trns[i]
    for i in range(n):
        o = i * ch
        if colort == 3:
            a = ta.get(buf[o], 255)
        elif colort == 6:
            a = buf[o + 3]
        elif colort == 4:
            a = buf[o + 1]
        else:
            a = 255
        if a > ALPHA_THRESH:
            x = i % w
            y = i // w
            if x < minx:
                minx = x
            if y < miny:
                miny = y
            if x > maxx:
                maxx = x
            if y > maxy:
                maxy = y
            found = True
    if not found:
        return w, h, w, h
    bw = maxx - minx + 1
    bh = maxy - miny + 1
    return w, h, bw, bh


def main():
    ap = argparse.ArgumentParser(description="Spire 素材量化 + 重命名覆盖")
    ap.add_argument("--src", default=DEFAULT_SRC, help="素材包 png 目录")
    ap.add_argument("--dst", default=DEFAULT_DST, help="目标 public/spire/art 目录")
    ap.add_argument("--dry-run", action="store_true",
                    help="只打印 K 系数、不复制文件")
    args = ap.parse_args()

    print(f"SRC={args.src}")
    print(f"DST={args.dst}")
    if args.dry_run:
        print("[dry-run] 只量系数，不复制\n")

    ks = {}
    for t, (src, dst) in MAP.items():
        sp = os.path.join(args.src, src)
        if not os.path.exists(sp):
            print(f"⚠ {t:7s} 源缺失: {sp}")
            continue
        dp = os.path.join(args.dst, dst)
        w, h, bw, bh = content_extent(sp)
        ext = max(bw, bh)
        canvas = max(w, h)
        K = round(canvas / ext, 2)
        ks[t] = K
        if args.dry_run:
            print(f"{t:7s} {src:18s} -> {dst:18s}  canvas={w}x{h} content=({bw}x{bh}) ext={ext} K={K}")
        else:
            shutil.copy(sp, dp)
            print(f"{t:7s} {src:18s} -> {dst:18s}  canvas={w}x{h} content=({bw}x{bh}) ext={ext} K={K}  [copied]")

    # link: 复制改名，不算 K
    lsp = os.path.join(args.src, LINK[0])
    if os.path.exists(lsp):
        ldp = os.path.join(args.dst, LINK[1])
        w, h, bw, bh = content_extent(lsp)
        if args.dry_run:
            print(f"link    {LINK[0]:18s} -> {LINK[1]:18s}  canvas={w}x{h} content=({bw}x{bh})")
        else:
            shutil.copy(lsp, ldp)
            print(f"link    {LINK[0]:18s} -> {LINK[1]:18s}  canvas={w}x{h} content=({bw}x{bh})  [copied]")

    print("\nART_BOX_K = {")
    for t in MAP:
        if t in ks:
            print(f'  {t:7s}: {ks[t]},')
    print("}")


if __name__ == "__main__":
    main()
