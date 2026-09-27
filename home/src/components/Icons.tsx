/** 内联 SVG 图标集（无第三方图标库，保持轻量）。统一 currentColor + 1.7 描边。 */
import type { ReactElement, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Stroke({ children, ...rest }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** 项目：层叠方块 */
export function LayersIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
      <path d="m3 17.5 9 5 9-5" opacity={0.45} />
    </Stroke>
  );
}

/** 文章：书页 */
export function BookIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5v-15Z" />
      <path d="M4 19.5A1.5 1.5 0 0 1 5.5 18H19v3H5.5A1.5 1.5 0 0 1 4 19.5Z" />
      <path d="M8 7.5h7" opacity={0.6} />
      <path d="M8 11h5" opacity={0.6} />
    </Stroke>
  );
}

/** 工具：扳手 */
export function WrenchIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <path d="M14.7 6.3a4 4 0 0 0 5.1 5.1l-8.5 8.5a2.5 2.5 0 0 1-3.5-3.5l8.5-8.5Z" />
      <path d="M14.7 6.3 17 4" />
      <path d="m6.5 17.5 1.5 1.5" opacity={0.6} />
    </Stroke>
  );
}

/** 返回主页：房子 */
export function HomeIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <path d="m3 10.5 9-7 9 7" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M10 20v-5h4v5" />
    </Stroke>
  );
}

/** GitHub（实心品牌标） */
export function GitHubIcon(props: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      width="18"
      height="18"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/** 邮箱 */
export function MailIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m3.8 7 7.3 5.1a1.5 1.5 0 0 0 1.8 0L20.2 7" />
    </Stroke>
  );
}

/** 外链箭头 */
export function ArrowUpRightIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <path d="M7 17 17 7" />
      <path d="M9 7h8v8" />
    </Stroke>
  );
}

/** 右箭头（卡片 CTA） */
export function ArrowRightIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <path d="M4 12h15" />
      <path d="m13 6 6 6-6 6" />
    </Stroke>
  );
}

/** 日历（文章日期） */
export function CalendarIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17" />
      <path d="M8 3.5v3" />
      <path d="M16 3.5v3" />
    </Stroke>
  );
}

/** 刷新（文章重试） */
export function RefreshIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4.5h-4.5" />
    </Stroke>
  );
}

/** 锁定 / 敬请期待（占位工具） */
export function HourglassIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <path d="M7 3h10" />
      <path d="M7 21h10" />
      <path d="M7.5 3c0 4 4.5 5.2 4.5 9s-4.5 5-4.5 9" />
      <path d="M16.5 3c0 4-4.5 5.2-4.5 9s4.5 5 4.5 9" />
    </Stroke>
  );
}

/** 移动端菜单 */
export function MenuIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </Stroke>
  );
}

/** 关闭 */
export function CloseIcon(props: IconProps): ReactElement {
  return (
    <Stroke {...props}>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </Stroke>
  );
}
