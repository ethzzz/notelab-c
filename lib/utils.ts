import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/** 类名合并：clsx 条件合并 + tailwind-merge 去重（shadcn 风格组件库基建） */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}