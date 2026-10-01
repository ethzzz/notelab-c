/**
 * 主页「项目 / 文章 / 工具」三 tab 合并后的交互验收（CDP + 本机 Chrome headless）。
 *
 * 只验一件事实：工具不再是独立外壳页，而是主页里的第三个 tab；
 * 分类从顶层侧栏降级为内容区 chips，选中态仍写进 URL（/tools/ai）。
 *
 * 坑位（沿用既往踩坑）：
 * - 模板字符串紧邻双引号会让反引号吞掉下一行 → expression 一律用字符串拼接；
 * - 本机 headless 下 /json/new?url= 不真导航 → 单 tab + Page.navigate；
 * - 提 DOM 文本会被其它区块干扰 → 限定 header / nav 作用域。
 */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9333;
const BASE = "https://haolo.cloud";
const OUT = path.join(__dirname, "shots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws = null;
let sessionId = null;
let tabId = null;
let seq = 0;
const pending = new Map();

function send(method, params = {}, timeout = 15000) {
  const id = ++seq;
  const msg = { id, method, params };
  if (sessionId) msg.sessionId = sessionId;
  ws.send(JSON.stringify(msg));
  return Promise.race([
    new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      setTimeout(() => {
        pending.delete(id);
        reject(new Error("CDP timeout: " + method));
      }, timeout);
    }),
  ]);
}

function onMessage(raw) {
  let m;
  try {
    m = JSON.parse(raw);
  } catch {
    return;
  }
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(methodOf(m) + ": " + JSON.stringify(m.error))) : resolve(m.result);
  }
}
const methodOf = (m) => "id=" + m.id;

/** 在页面里执行表达式，返回 JSON 值 */
async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression: expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error("eval error: " + JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails.text));
  return r.result.value;
}

const NAV_STATE = [
  "JSON.stringify((() => {",
  "  var nav = document.querySelector('aside nav');",
  "  var btns = Array.prototype.slice.call(nav ? nav.querySelectorAll('button') : []);",
  "  var main = document.querySelector('header');",
  "  var on = btns.filter(function (b) { return b.getAttribute('aria-current') === 'page'; });",
  "  var chips = Array.prototype.slice.call(document.querySelectorAll('[role=tablist] [role=tab]'));",
  "  var cards = document.querySelectorAll('a[class*=card], div[class*=card]').length;",
  "  return {",
  "    url: location.pathname,",
  "    navLabels: btns.map(function (b) { return b.getAttribute('aria-label') || b.textContent.trim(); }),",
  "    active: on.length ? (on[0].getAttribute('aria-label') || on[0].textContent.trim()) : null,",
  "    h1: main ? (main.querySelector('h1') ? main.querySelector('h1').textContent.trim() : null) : null,",
  "    chips: chips.map(function (c) { return c.textContent.trim(); }),",
  "    cardCount: cards",
  "  };",
  "})())",
].join("\n");

function clickByLabel(navLabel) {
  return [
    "(() => {",
    "  var nav = document.querySelector('aside nav');",
    "  var b = Array.prototype.slice.call(nav.querySelectorAll('button')).filter(function (x) {",
    "    return (x.getAttribute('aria-label') || '') === " + JSON.stringify(navLabel) + " || x.textContent.trim().indexOf(" + JSON.stringify(navLabel) + ") >= 0;",
    "  })[0];",
    "  if (!b) return 'NOT_FOUND';",
    "  b.click();",
    "  return b.getAttribute('aria-label') || b.textContent.trim();",
    "})()",
  ].join("\n");
}

function clickChip(text) {
  return [
    "(() => {",
    "  var t = Array.prototype.slice.call(document.querySelectorAll('[role=tablist] [role=tab]')).filter(function (c) {",
    "    return c.textContent.indexOf(" + JSON.stringify(text) + ") >= 0;",
    "  })[0];",
    "  if (!t) return 'NOT_FOUND';",
    "  t.click();",
    "  return t.textContent.trim();",
    "})()",
  ].join("\n");
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, [
    "--headless=new",
    "--remote-debugging-port=" + String(PORT),
    "--no-sandbox",
    "--disable-gpu",
    "--hide-scrollbars",
    "--window-size=1440,900",
    "about:blank",
  ]);
  const bail = (msg) => {
    console.log("FAIL " + msg);
    try { chrome.kill(); } catch (e) {}
    process.exit(1);
  };

  // 等调试端口就绪
  let version = null;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch("http://127.0.0.1:" + String(PORT) + "/json/version");
      version = await r.json();
      break;
    } catch (e) {}
    await sleep(250);
  }
  if (!version) bail("Chrome 调试端口未就绪");
  console.log("Chrome: " + String(version.Browser));

  const list = await (await fetch("http://127.0.0.1:" + String(PORT) + "/json/list")).json();
  const page = list.filter((t) => t.type === "page")[0];
  if (!page) bail("无 page target");
  tabId = page.id;

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  ws.onmessage = (ev) => onMessage(ev.data);

  const attached = await send("Target.attachToTarget", { targetId: tabId, flatten: true });
  sessionId = attached.sessionId;
  await send("Page.enable");
  await send("Runtime.enable");

  const results = [];
  const check = (name, ok, detail) => {
    results.push({ name, ok, detail });
    console.log((ok ? "PASS " : "FAIL ") + name + (detail ? " | " + String(detail) : ""));
  };

  const goto = async (p) => {
    await send("Page.navigate", { url: BASE + p });
    for (let i = 0; i < 60; i++) {
      await sleep(200);
      const ready = await evalJs("document.readyState");
      if (ready === "complete") break;
    }
    await sleep(900); // 等 hydration + router.replace 落地
  };

  // ---- 1. 主页：三个 tab ----
  await goto("/");
  let s = JSON.parse(await evalJs(NAV_STATE));
  check("主页侧栏 3 个 tab", s.navLabels.length === 3, JSON.stringify(s.navLabels));
  check("默认激活「项目」", s.active && s.active.indexOf("项目") === 0, s.active);
  check("主页无工具分类 chips（分类已从侧栏下沉）", s.chips.length === 0, "chips=" + String(s.chips.length));
  await send("Page.captureScreenshot", { format: "png" }).then(async (r) => {
    fs.writeFileSync(path.join(OUT, "home-projects.png"), Buffer.from(r.data, "base64"));
  });

  // ---- 2. 点「工具」→ 变 tab，URL 变 /tools ----
  const clicked = await evalJs(clickByLabel("工具"));
  check("侧栏点「工具」命中", clicked !== "NOT_FOUND", clicked);
  await sleep(900);
  s = JSON.parse(await evalJs(NAV_STATE));
  check("切到工具后 URL = /tools", s.url === "/tools", s.url);
  check("激活 tab 为「工具」", s.active && s.active.indexOf("工具") === 0, s.active);
  check("顶栏标题 = 工具 / 功能", s.h1 === "工具 / 功能", s.h1);
  check("出现 5 个分类 chips", s.chips.length === 5, JSON.stringify(s.chips));
  check("全部分类下 15 张工具卡", s.cardCount === 15, "cards=" + String(s.cardCount));
  await send("Page.captureScreenshot", { format: "png" }).then(async (r) => {
    fs.writeFileSync(path.join(OUT, "home-tools-all.png"), Buffer.from(r.data, "base64"));
  });

  // ---- 3. 点分类 chip「AI 应用」→ URL /tools/ai ----
  const c = await evalJs(clickChip("AI 应用"));
  check("点分类 chip 命中", c !== "NOT_FOUND", c);
  await sleep(900);
  s = JSON.parse(await evalJs(NAV_STATE));
  check("分类后 URL = /tools/ai", s.url === "/tools/ai", s.url);
  check("顶栏标题 = AI 应用 · 工具", s.h1 === "AI 应用 · 工具", s.h1);
  check("AI 分类下 4 张卡", s.cardCount === 4, "cards=" + String(s.cardCount));
  await send("Page.captureScreenshot", { format: "png" }).then(async (r) => {
    fs.writeFileSync(path.join(OUT, "home-tools-ai.png"), Buffer.from(r.data, "base64"));
  });

  // ---- 4. 直开 /tools/ai 可直达（分享链接） ----
  await goto("/tools/ai");
  s = JSON.parse(await evalJs(NAV_STATE));
  check("直开 /tools/ai 落在工具 tab", s.url === "/tools/ai" && s.active.indexOf("工具") === 0, s.url + " / " + String(s.active));
  check("直开 /tools/ai 卡片=4", s.cardCount === 4, "cards=" + String(s.cardCount));

  // ---- 5. 直开 /tools/zzz 应 404 ----
  await goto("/tools/zzz");
  s = JSON.parse(await evalJs(NAV_STATE));
  check("/tools/zzz 走 404 页面", s.navLabels.length === 0, "navLabels=" + JSON.stringify(s.navLabels));

  // ---- 6. 回主页 ----
  await goto("/");
  s = JSON.parse(await evalJs(NAV_STATE));
  check("回到主页默认「项目」", s.url === "/" && s.active.indexOf("项目") === 0, s.url + " / " + String(s.active));

  // ---- 6.5 文章 tab 回归（App 结构改成三 tab 后侧栏逻辑重写，必须确认没带坏 /posts） ----
  await goto("/posts");
  s = JSON.parse(await evalJs(NAV_STATE));
  // RSS 约 1.8MB + DOMParser，慢机器上要给它时间；轮询到出条目或明确非 loading 为止
  let ps = null;
  for (let i = 0; i < 24; i++) {
    ps = JSON.parse(
      await evalJs(
        [
          "JSON.stringify((() => {",
          "  var main = document.querySelector('main');",
          "  var items = main.querySelectorAll('a[class*=post]');",
          "  return { items: items.length, loading: main.textContent.indexOf('加载中') >= 0, error: main.textContent.indexOf('加载失败') >= 0, first: items[0] ? items[0].getAttribute('href') : '' };",
          "})())",
        ].join("\n"),
      ),
    );
    if (ps.items > 0 || ps.error || !ps.loading) break;
    await sleep(700);
  }
  check("直开 /posts 落在文章 tab", s.url === "/posts" && s.active.indexOf("文章") === 0, s.url + " / " + String(s.active));
  check("/posts 渲染出 RSS 文章条目", ps.items > 0 && !ps.loading, JSON.stringify(ps));

  // ---- 7. 窄屏（移动端）classification chips 两行不溢出 ----
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await goto("/tools");
  s = JSON.parse(await evalJs(NAV_STATE));
  const overflow = await evalJs(
    [
      "JSON.stringify((() => {",
      "  var bar = document.querySelector('[role=tablist]');",
      "  var barBox = bar.getBoundingClientRect();",
      "  var chips = Array.prototype.slice.call(bar.querySelectorAll('[role=tab]'));",
      "  var rows = {};",
      "  chips.forEach(function (c) { var r = c.getBoundingClientRect(); rows[Math.round(r.top)] = 1; });",
      "  return { chips: chips.length, rows: Object.keys(rows).length, barH: Math.round(barBox.height), overflowX: document.documentElement.scrollWidth > window.innerWidth + 1 };",
      "})())",
    ].join("\n"),
  );
  const ov = JSON.parse(overflow);
  check("窄屏 chips 不横向溢出", ov.overflowX === false, JSON.stringify(ov));
  // 5 个 chip 在两列网格里 = 3 行（2+2+1）
  check("窄屏 chips 两列三行排布", ov.rows === 3 && ov.chips === 5, JSON.stringify(ov));
  await send("Page.captureScreenshot", { format: "png" }).then(async (r) => {
    fs.writeFileSync(path.join(OUT, "home-tools-mobile.png"), Buffer.from(r.data, "base64"));
  });

  const bad = results.filter((r) => !r.ok);
  console.log("\n结果：" + String(results.length - bad.length) + "/" + String(results.length) + " 通过");
  try { chrome.kill(); } catch (e) {}
  process.exit(bad.length ? 1 : 0);
})().catch((e) => {
  console.log("ERROR " + (e && e.message ? e.message : String(e)));
  process.exit(1);
});
