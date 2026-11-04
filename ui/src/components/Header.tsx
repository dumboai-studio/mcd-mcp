import type { App, McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import {
  MODE_META,
  type OrderMode,
  type Store,
  type Address,
} from "../../../shared/types.js";
import { Badge, BrandMark } from "./common.js";

export type Stage =
  "start" | "addresses" | "stores" | "menu" | "checkout" | "order";

const STEPS: { key: Stage[]; label: string }[] = [
  { key: ["start", "addresses", "stores"], label: "选门店" },
  { key: ["menu"], label: "点餐" },
  { key: ["checkout"], label: "结算" },
  { key: ["order"], label: "订单" },
];

export function Header({
  app,
  hostContext,
  stage,
  mode,
  store,
  address,
  mock,
}: {
  app: App;
  hostContext?: McpUiHostContext;
  stage: Stage;
  mode?: OrderMode;
  store?: Store;
  address?: Address;
  mock: boolean;
}) {
  const activeIndex = STEPS.findIndex((s) => s.key.includes(stage));
  const canFullscreen =
    hostContext?.availableDisplayModes?.includes("fullscreen");
  const isFullscreen = hostContext?.displayMode === "fullscreen";

  const toggleFullscreen = async () => {
    try {
      await app.requestDisplayMode({
        mode: isFullscreen ? "inline" : "fullscreen",
      });
    } catch (e) {
      console.warn("requestDisplayMode failed", e);
    }
  };

  return (
    <header className="header">
      <div className="header-row">
        <div className="brand">
          <BrandMark />
          <span className="brand-name">麦当劳点餐</span>
          {mock && <Badge tone="yellow">模拟数据</Badge>}
        </div>
        <ol className="steps" aria-label="点餐进度">
          {STEPS.map((s, i) => (
            <li
              key={s.label}
              aria-current={i === activeIndex ? "step" : undefined}
              className={
                i === activeIndex ? "active" : i < activeIndex ? "done" : ""
              }
            >
              <span className="step-index">{i + 1}</span>
              <span>{s.label}</span>
            </li>
          ))}
        </ol>
        {canFullscreen && (
          <div className="header-actions">
            <button
              className="btn ghost small"
              onClick={toggleFullscreen}
              title={isFullscreen ? "退出全屏" : "全屏"}
            >
              {isFullscreen ? "退出全屏" : "全屏"}
            </button>
          </div>
        )}
      </div>
      {((stage !== "menu" && (mode || store)) ||
        (mode === "delivery" && address?.fullAddress)) && (
        <div className="context-line muted">
          {stage !== "menu" && mode && <span>{MODE_META[mode].label}</span>}
          {stage !== "menu" && store && <span>{store.storeName}</span>}
          {mode === "delivery" && address?.fullAddress && (
            <span>送至 {address.fullAddress}</span>
          )}
        </div>
      )}
    </header>
  );
}
