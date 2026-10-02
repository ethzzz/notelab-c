import type { SeedItem } from "@/lib/memory";

/**
 * 知识摘录种子 —— 摘录盒的记忆本体，将来 RAG 恢复可直接作为语料喂入。
 * 全部是工程判断力相关的可迁移结论，不是科普复述。
 */
export const SEED_EXCERPTS: SeedItem[] = [
  {
    id: "ex-001",
    kind: "excerpt",
    title: "工具造噪音不是架构问题",
    body: "「规则永远命中」和「真的有违规」是两回事。当一条架构规则让 error 数永远归不了零，门禁就永远接不进部署，那条规则就在造噪音。\n\n判据：规则应该按**可修**的粒度写。包粒度规则命中了没法修（service 自己 import dao），文件粒度规则才能给出「这一行该改哪」的明确动作。",
    tags: ["架构", "判断力"],
    extra: { source: "ArchGuard 口径校准", author: "自己" },
  },
  {
    id: "ex-002",
    kind: "excerpt",
    title: "先量再改（别照着“看起来”动手）",
    body: "一次清理页内标题的行动里，预判「4 款 h1 各吃掉 60px」，实测发现其中 3 枚在游戏区内部（h-full 容器的菜单页 / absolute 浮层），根本不在文档流占高度。删掉它们画布一分不涨，只减辨识度。\n\n结论：**删之前先量，量完再决定删哪个**，否则改的是自己以为的问题。",
    tags: ["方法论", "验证"],
    extra: { source: "2026-10-02 全屏游戏台收尾", author: "自己" },
  },
  {
    id: "ex-003",
    kind: "excerpt",
    title: "能绕开就绕开，绕不开就做成可插拔",
    body: "依赖外部服务的功能，运行时依赖是负债。判分、检索、生成这类功能在模型不可用时会整条停工，而它们恰好占了大半的重做成本。\n\n正解：把 LLM 调用收进一个接口，默认给本地/模板实现 —— 主流程不依赖它，模型恢复只是换个实现，代码不动。",
    tags: ["架构", "LLM"],
    extra: { source: "凭据不可用后的取舍", author: "自己" },
  },
  {
    id: "ex-004",
    kind: "excerpt",
    title: "容器高度归谁管",
    body: "「在页面里划一块做游戏区」和「整页当作游戏区」的实质差别，不在沉浸感，在**尺寸确定性**。\n\n前者要求每个游戏自己猜外壳吃掉多少（7 处 magic number），改一次外壳 padding 全部飘；后者由外壳一次定死 100dvh，页面只写 h-full。以后改外壳再不牵连游戏。",
    tags: ["布局", "架构"],
    extra: { source: "全屏游戏台选型", author: "自己" },
  },
  {
    id: "ex-005",
    kind: "excerpt",
    title: "防线要设在读取之前",
    body: "把密码从文档里删掉不算脱敏 —— 它已经进了记忆、对话、提交历史，而记忆每次都会被注入新一次对话。\n\n正解：立规矩让 Agent **根本不读**凭据真值（只列键名、不 cat、不打印），比“写入前检查”有效得多。",
    tags: ["安全", "习惯"],
    extra: { source: "qa-community 脱敏复盘", author: "自己" },
  },
  {
    id: "ex-006",
    kind: "excerpt",
    title: "验收标准必须可判定",
    body: "PRD 里写「体验更好」「更流畅」等于没写验收标准。可判定要能用一个命令证伪：HTTP 状态码、字节大小、计算样式值、几何坐标。\n\n「颜色变了吗」这种问题，答案是「body 的 computed color 从 rgb(24,24,27) 变成 rgb(22,24,34)」才算数。",
    tags: ["方法论", "验收"],
    extra: { source: "PRD 体例铁律", author: "自己" },
  },
  {
    id: "ex-007",
    kind: "excerpt",
    title: "开工成本≈0 是防拖延的机制",
    body: "「等收工再补文档」之所以永远补不上，是因为那会儿成本最高。给一个 `scripts/new-stage.sh <周次> <主题>` 从模板一键生成空文档，开工成本降到接近零，补文档就变成了顺手事。\n\n同样的思路适用于任何「知道该做但总不做」的事：把触发它的成本压到最低。",
    tags: ["习惯", "工程方法"],
    extra: { source: "阶段文档体系", author: "自己" },
  },
  {
    id: "ex-008",
    kind: "excerpt",
    title: "免密 ≠ 不读文件",
    body: "SSH 免密只是不输密码；建立认证必须在本机读私钥。所以「配了别名」不等于「不触发文件读取」—— 每次 ssh/scp 仍会读 config / known_hosts / 私钥，沙箱规则要按这个链路配，别只放行 config。",
    tags: ["SSH", "环境"],
    extra: { source: "沙箱规则排查", author: "自己" },
  },
];

export default SEED_EXCERPTS;
