import type { App, McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { MODE_META, type OrderMode, type Store, type Address } from "../../../shared/types.js";
import { Badge, BrandMark } from "./common.js";

export type Stage = "start" | "addresses" | "stores" | "menu" | "checkout" | "order";

const STEPS: { key: Stage[]; label: string }[] = [
  { key: ["start", "addresses", "stores"], label: "选门店" },
  { key: ["menu"], label: "点餐" },
  { key: ["checkout"], label: "结算" },
  { key: ["order"], label: "付款 / 订单" },
];

export function Header({
  app,
  hostContext,
  stage,
  mode,
  store,
  address,
  mock,
  cartCount,
}: {
  app: App;
  hostContext?: McpUiHostContext;
  stage: Stage;
  mode?: OrderMode;
  store?: Store;
  address?: Address;
  mock: boolean;
  cartCount: number;
}) {
  const activeIndex = STEPS.findIndex((s) => s.key.includes(stage));
  const canFullscreen = hostContext?.availableDisplayModes?.includes("fullscreen");
  const isFullscreen = hostContext?.displayMode === "fullscreen";

  const toggleFullscreen = async () => {
    try {
      await app.requestDisplayMode({ mode: isFullscreen ? "inline" : "fullscreen" });
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
        <div className="header-actions">
          {cartCount > 0 && stage === "menu" && <Badge tone="red">购物车 {cartCount}</Badge>}
          {canFullscreen && (
            <button className="btn ghost small" onClick={toggleFullscreen} title={isFullscreen ? "退出全屏" : "全屏"}>
              {isFullscreen ? "退出全屏" : "全屏"}
            </button>
          )}
        </div>
      </div>
      <ol className="steps">
        {STEPS.map((s, i) => (
          <li key={s.label} className={i === activeIndex ? "active" : i < activeIndex ? "done" : ""}>
            <span className="step-index">{i + 1}</span>
            <span>{s.label}</span>
          </li>
        ))}
      </ol>
      {(mode || store) && (
        <div className="context-line muted">
          {mode && <span>{MODE_META[mode].label}</span>}
          {store && <span>· {store.storeName}</span>}
          {mode === "delivery" && address?.fullAddress && <span>· 送至 {address.fullAddress}</span>}
        </div>
      )}
    </header>
  );
}
