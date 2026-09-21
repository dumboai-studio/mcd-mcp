import type { ReactNode } from "react";
import { useState } from "react";
import { ApiError } from "../api.js";
import { statusTimeline } from "../format.js";

/** 加载占位：rows 行卡片骨架 */
export function Skeleton({ rows = 3, card = true }: { rows?: number; card?: boolean }) {
  return (
    <div className="skeleton-list" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`skeleton-row${card ? " card" : ""}`}>
          <div className="skeleton-block img" />
          <div className="skeleton-lines">
            <div className="skeleton-block line w60" />
            <div className="skeleton-block line w40" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 订单进度条 */
export function OrderTimeline({ status, delivery }: { status: string | undefined; delivery: boolean }) {
  const t = statusTimeline(status, delivery);
  return (
    <ol className={`timeline${t.cancelled ? " cancelled" : ""}`} aria-label="订单进度">
      {t.steps.map((label, i) => (
        <li key={label} className={t.cancelled ? "" : i < t.current ? "done" : i === t.current ? "active" : ""}>
          <span className="dot" />
          <span className="label">{label}</span>
        </li>
      ))}
    </ol>
  );
}

/** 金拱门样式的品牌标（矢量绘制，不依赖图片） */
/**
 * 金拱门。几何比例取自麦当劳官方素材的像素实测：拱占红底宽 48%、高 44%，
 * 两道拱共用中间那条腿，每道拱各自关于自己的峰对称。
 */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="brand-mark" viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="麦当劳">
      <rect width="100" height="100" rx="22" fill="var(--mcd-red)" />
      <g
        transform="translate(26 27)"
        fill="none"
        stroke="var(--mcd-yellow)"
        strokeWidth="5.5"
        strokeLinecap="butt"
        strokeLinejoin="round"
      >
        <path d="M2.75 44V23C2.75 10.45 8.06 2.75 13.38 2.75C18.69 2.75 24 10.45 24 23V44" />
        <path d="M24 44V23C24 10.45 29.31 2.75 34.63 2.75C39.94 2.75 45.25 10.45 45.25 23V44" />
      </g>
    </svg>
  );
}

export function PlusIcon({ size = 14 }: { size?: number }) {
  return (
    <svg className="icon" viewBox="0 0 16 16" width={size} height={size} aria-hidden>
      <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function MinusIcon({ size = 14 }: { size?: number }) {
  return (
    <svg className="icon" viewBox="0 0 16 16" width={size} height={size} aria-hidden>
      <path d="M2.5 8h11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="loading">
      <div className="spinner" />
      {label && <span>{label}</span>}
    </div>
  );
}

export function ErrorBox({
  error,
  onRetry,
  compact,
}: {
  error: unknown;
  onRetry?: () => void;
  compact?: boolean;
}) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  const traceId = error instanceof ApiError ? error.traceId : undefined;
  return (
    <div className={`error-box${compact ? " compact" : ""}`} role="alert">
      <div className="error-text">
        <strong>出错了</strong> {message}
        {traceId && <div className="muted small">traceId: {traceId}</div>}
      </div>
      {onRetry && (
        <button className="btn ghost small" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "red" | "yellow" | "green" | "gray" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

const EMOJI: [RegExp, string][] = [
  [/套餐/, "🍔🍟"],
  [/堡|汉堡|巨无霸|吉士/, "🍔"],
  [/薯/, "🍟"],
  [/鸡翅|麦乐鸡|鸡块|鸡腿/, "🍗"],
  [/咖啡/, "☕"],
  [/可乐|雪碧|饮|茶|奶昔|汁/, "🥤"],
  [/冰淇淋|圆筒|麦旋风|甜筒/, "🍦"],
  [/派/, "🥧"],
  [/玉米/, "🌽"],
  [/鱼/, "🐟"],
];

export function foodEmoji(name: string): string {
  for (const [re, emoji] of EMOJI) if (re.test(name)) return emoji;
  return "🍽️";
}

/** 餐品图片，加载失败或缺失时显示表情占位 */
export function MealImage({ src, name, size = 64 }: { src?: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.45) };
  if (!src || failed) {
    return (
      <div className="meal-img placeholder" style={style} aria-hidden>
        {foodEmoji(name)}
      </div>
    );
  }
  return <img className="meal-img" style={style} src={src} alt={name} loading="lazy" onError={() => setFailed(true)} />;
}

export function Stepper({
  value,
  onInc,
  onDec,
  disableInc,
}: {
  value: number;
  onInc: () => void;
  onDec: () => void;
  disableInc?: boolean;
}) {
  return (
    <div className="stepper">
      <button className="step" onClick={onDec} aria-label="减少">
        <MinusIcon />
      </button>
      <span className="qty">{value}</span>
      <button className="step" onClick={onInc} disabled={disableInc} aria-label="增加">
        <PlusIcon />
      </button>
    </div>
  );
}
