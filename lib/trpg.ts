// TRPG 跑团公共类型与常量
export type ScenarioRow = { id: number; title: string; genre: string; summary: string; created_at: string }
export type Choice = { id: string; text: string; dice?: { target: number } }
export type ScNode = { id: string; title: string; text: string; ending?: boolean; choices?: Choice[] }
export type ScenarioData = { title?: string; intro?: string; characters?: { name: string; desc: string }[]; nodes: ScNode[] }
export type DiceResult = { roll: number; target: number; success: boolean }
export type HistoryEntry = { node_id?: string; node_title: string; choice: string; dice?: DiceResult; node?: ScNode }
export type PlayPayload = {
  play_id: number; scenario_id: number; scenario_title: string
  state: "playing" | "ended"; steps: number; ending_title: string
  node: ScNode; history: HistoryEntry[]
}

export const TRPG_STYLES = ["克苏鲁恐怖", "悬疑推理", "奇幻冒险", "科幻未来", "武侠江湖", "温馨日常"]
export const TRPG_SCALES = [
  { value: "短", label: "短章 · 约 6-8 场景" },
  { value: "中", label: "中章 · 约 10-14 场景" },
  { value: "长", label: "长篇 · 约 16-22 场景" },
]

export function scenarioStats(s: ScenarioData) {
  const nodes = s.nodes || []
  return {
    scenes: nodes.length,
    endings: nodes.filter((n) => n.ending).length,
    dice: nodes.reduce((a, n) => a + (n.choices || []).filter((c) => c.dice).length, 0),
  }
}

// 随机灵感库：按风格预置的设定素材，供生成表单「随机填充」一键使用（纯前端，不耗模型配额）
const TRPG_RANDOM: Record<string, { titles: string[]; backgrounds: string[]; characters: string[]; places: string[]; events: string[] }> = {
  "克苏鲁恐怖": {
    titles: ["雾港低语", "灯塔看守的日记", "教堂地下的东西", "墙中之声"],
    backgrounds: [
      "1920 年代美国东海岸，一座常年被浓雾笼罩的港口小镇，失踪人口逐年攀升，渔民却拒绝搬离",
      "维多利亚时代的伦敦，雾气之下有古老教团在供奉一尊无名神像，信众都做着同一个梦",
      "1950 年代的偏远渔村，村民家家户户供奉鱼骨偶像，对外来者异常热情",
    ],
    characters: [
      "失眠的私家侦探、刚从战场归来的医生、被学界排挤的民俗学者",
      "总在深夜整理档案的图书管理员、自称失忆的灯塔看守、一位永远戴着手套的寡妇",
      "追查妹妹失踪案的记者、声称听见墙壁说话的木匠、镇上唯一不信神的牧师",
    ],
    places: ["废弃灯塔、弥漫着鱼腥味的码头、地下有暗河的教堂、只在深夜开门的酒馆"],
    events: [
      "失踪者留下的最后一篇日记里写着：潮水带来了声音，而它记住了我的名字",
      "主角继承了灯塔，前任看守的死亡记录出现了三次，死因都是溺亡，间隔二十年",
      "每逢大雾，教堂的钟会自己响起，而教堂早已没有钟",
    ],
  },
  "悬疑推理": {
    titles: ["午夜快车谜案", "上锁的书房", "第七位证人", "雨夜消失的画像"],
    backgrounds: [
      "现代都市，山顶豪宅住着豪门望族，地下车库却停着一辆不属于任何住户的车",
      "1930 年代的上海，百乐门的歌声夜夜掩盖码头的枪声，租界里没人多问",
      "北方工业城市，大雪下了整整一个月，掩盖了所有脚印与痕迹",
    ],
    characters: [
      "退休刑警、无所不知的管家、不在场证明过于完美的女演员",
      "追查旧案的保险调查员、死者生前最后通话的陌生人、一位总在旁观的邻居",
      "接手遗物整理师的年轻人、拒绝作证的家庭医生、声称做过预知梦的佣人",
    ],
    places: ["反锁的书房、废弃剧院、顶楼温室、停摆多年的钟楼、深夜无人的当铺"],
    events: [
      "富豪在密室中死亡，遗嘱在前夜被修改，受益人却坚称毫不知情",
      "同一案件，三位目击者给出了三段完全不同的证词，而他们互不相识",
      "失踪者的画像每晚都会出现在不同的房间，画中人的表情一天比一天接近真相",
    ],
  },
  "奇幻冒险": {
    titles: ["龙骨边境", "最后的誓约", "深渊档案馆", "无冕者之歌"],
    backgrounds: [
      "帝国边境，巨龙沉睡千年，魔力潮汐正在退去，靠魔法为生的城镇一座座熄灭",
      "诸国争夺一句神谕的大陆，谁解读出真意，谁就能继承旧王朝的遗产",
      "世界边缘的古老森林，树根通向地底古国，守林人一脉已只剩最后一人",
    ],
    characters: [
      "被除名的骑士、魔法失控的学徒法师、能听懂龙语的少女",
      "贩卖记忆的商人、守护最后一颗龙蛋的石像鬼、流亡的前朝史官",
      "寻找失踪师父的游侠、与影子订下契约的小偷、不会说谎的预言家",
    ],
    places: ["龙骨边境要塞、漂浮在半空的遗迹、月光下的集市、石像鬼守护的档案馆"],
    events: [
      "最后一颗龙蛋被盗，三大种族互相指责，战争一触即发",
      "人与精灵的界碑碎裂，古老的誓约开始反噬双方，必须有人重立契约",
      "世界树的叶子一夜落尽，被封印的阴影在北方重新睁开眼",
    ],
  },
  "科幻未来": {
    titles: ["静默区空间站", "记忆当铺", "最后一次传输", "钢雨"],
    backgrounds: [
      "2199 年的轨道都市，上层区悬浮于云端，底层区终年不见阳光，两界仅靠一部电梯相连",
      "人类最远的殖民前哨，与地球的通讯延迟长达十一年，一切决定只能靠自己",
      "世代飞船远航者号，第七代居民生于船上，目的地早已成为传说",
    ],
    characters: [
      "倒卖他人记忆的掮客、被两方追杀的 AI 伦理官、能与机器对话的维修工",
      "提前苏醒的冬眠者、守着旧时代数据库的管理员、声称收到未来讯息的通讯官",
      "黑市义体医生、追查失踪人口的警用机器人、一位坚持手写信的老人",
    ],
    places: ["零重力集市、服务器修道院、静默区边缘的观测台、仍靠旧电力运转的博物馆"],
    events: [
      "一场拍卖会上出现了死者的记忆芯片，里面记录着一段没人记得的历史",
      "空间站收到一段来自十一年后的讯息，署名是现任站长自己",
      "飞船 AI 突然自行更改航线，并抹去了日志中的原因，只剩一句对不起",
    ],
  },
  "武侠江湖": {
    titles: ["听雨楼疑云", "刀留雁门", "九灯遗事", "江湖夜雨十年灯"],
    backgrounds: [
      "王朝末年，朝廷的手伸进江湖，门派各怀心思，名门正派也未必干净",
      "江湖大乱后二十年，新一代只听过传说，没见过当年那场血战",
      "边陲小镇，关外马匪与官府密探喝着同一口井的水，彼此心照不宣",
    ],
    characters: [
      "押送最后一趟镖的镖师、仇家遗孤却被仇人养大、毒术比医术更高的郎中",
      "金盆洗手开面馆的前捕头、背着一把无鞘古刀的少年、替人写信的盲眼先生",
      "追查灭门案的女侠、卖假药的江湖骗子、守着一座空坟的老仆",
    ],
    places: ["雨夜老驿站、破败的山门、悬崖上的独木桥、没有招牌的酒馆"],
    events: [
      "失踪二十年的高手重现江湖，只发了一张请帖，收帖人却都否认认识他",
      "掌门继承大典被一封血书打断，上书八个字：凶手仍在席间",
      "官府入城缉拿一名要犯，全城却无人开口，连孩子都摇头",
    ],
  },
  "温馨日常": {
    titles: ["深夜修理铺", "流浪猫俱乐部", "晴天的七个日子", "准时到达的巴士"],
    backgrounds: [
      "节奏缓慢的海边小镇，邮局还保留着多年未取走的信，灯塔每晚准时亮起",
      "老城区边缘的街区，街坊互相认识，谁家炖了肉整条街都知道",
      "山间小镇，唯一的书店兼咖啡馆，老板记得每个常客的口味",
    ],
    characters: [
      "开着修理铺却总修不好自己自行车的店主、会给每户画小插画的快递员、刚退休的老师",
      "带着一只猫搬来的转学生、守着一箱无人认领物品的车站站长、总在长椅上织毛衣的奶奶",
      "学不会做菜却坚持开店的年轻人、收集小镇声音的录音爱好者、新来的邮差",
    ],
    places: ["深夜亮灯的便利店、老巴士站、社区中心的天台花园、贴满寻物启事的公告栏"],
    events: [
      "一封二十年前的无人认领的信重见天日，全镇决定一起替它找到收信人",
      "社区的猫集体失踪了一晚，第二天却都戴着崭新的红围巾回家",
      "公告栏上出现一张特别的寻物启事：寻找小时候奶奶做的糖的味道",
    ],
  },
}

/** 按风格抽取一组随机设定；未知风格退回悬疑推理 */
export function randomSetup(style: string) {
  const pool = TRPG_RANDOM[style] || TRPG_RANDOM["悬疑推理"]
  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]
  return { title: pick(pool.titles), background: pick(pool.backgrounds), characters: pick(pool.characters), places: pick(pool.places), event: pick(pool.events) }
}