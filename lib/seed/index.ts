import type { MemoryItem, SeedItem } from "@/lib/memory";
import SEED_FLASHCARDS from "./flashcards";
import SEED_EXCERPTS from "./excerpts";
import SEED_SNIPPETS from "./snippets";
import SEED_HABITS from "./habits";

import { seedOnce } from "@/lib/memory";

/**
 * 种子汇总：一次灌进统一记忆层。
 *
 * ⚠️ 口径（2026-10-02）：这些条目是**大模型在开发阶段产出并固化成常量**的，
 * 不经过任何运行期接口 —— 所以即使大模型 key 全废，四个工具照常可用。
 *
 * 想增量补第二批（如 key 恢复后）：改 scripts/gen-seed.mjs 或直接在 seed/ 下加文件，
 * 再调 `ensureSeed()` 即可；seedOnce 按 `kind:title` 去重，不会覆盖用户已改过的条目。
 */
export const SEED_ITEMS: SeedItem[] = [
  ...SEED_FLASHCARDS,
  ...SEED_EXCERPTS,
  ...SEED_SNIPPETS,
  ...SEED_HABITS,
];

/**
 * 灌种子；返回新增条数。
 * 只在工具页首次加载时调用，所以种子库不会被游戏中心首屏 bundle 拉进来。
 */
export function ensureSeed(): number {
  return seedOnce(SEED_ITEMS);
}

export { SEED_FLASHCARDS, SEED_EXCERPTS, SEED_SNIPPETS, SEED_HABITS };
export default SEED_ITEMS;
