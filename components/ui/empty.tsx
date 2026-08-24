/** 公共空状态 */
export default function Empty({ text = "暂无数据", className = "" }: { text?: string; className?: string }) {
  return <div className={`text-zinc-400 text-sm text-center py-8 ${className}`}>{text}</div>
}