import type { App } from "@modelcontextprotocol/ext-apps";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { MODE_META, type OrderMode, type StartPayload, type Store } from "../../../shared/types.js";
import { api } from "../api.js";
import { ErrorBox } from "./common.js";

const MODES: OrderMode[] = ["pickup", "delivery", "drive"];
const MODE_ICON: Record<OrderMode, string> = { pickup: "🏪", delivery: "🛵", drive: "🚗" };
const MODE_DESC: Record<OrderMode, string> = {
  pickup: "到餐厅柜台或取餐柜取餐",
  delivery: "麦乐送配送到指定地址",
  drive: "驾车在得来速车道取餐",
};

export function StartStage({
  app,
  mode,
  presets,
  onMode,
  onStores,
}: {
  app: App;
  mode: OrderMode;
  presets: StartPayload["presets"];
  onMode: (mode: OrderMode) => void;
  onStores: (stores: Store[]) => void;
}) {
  const [city, setCity] = useState(presets.city ?? "");
  const [keyword, setKeyword] = useState(presets.keyword ?? "");
  const [loading, setLoading] = useState<"search" | "fav" | null>(null);
  const [error, setError] = useState<unknown>(null);
  const autoRan = useRef<string>("");

  useEffect(() => {
    if (presets.city) setCity(presets.city);
    if (presets.keyword) setKeyword(presets.keyword);
  }, [presets.city, presets.keyword]);

  const search = async (searchType: 1 | 2, c = city, k = keyword) => {
    const beType = MODE_META[mode].beType as 1 | 5;
    setError(null);
    setLoading(searchType === 2 ? "search" : "fav");
    try {
      const stores = await api.queryNearbyStores(
        app,
        searchType === 2 ? { searchType: 2, beType, city: c.trim(), keyword: k.trim() } : { searchType: 1, beType },
      );
      onStores(stores);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(null);
    }
  };

  // 模型预填了城市和关键词时自动搜索一次
  useEffect(() => {
    const sig = `${mode}|${presets.city ?? ""}|${presets.keyword ?? ""}`;
    if (mode !== "delivery" && presets.city && presets.keyword && autoRan.current !== sig) {
      autoRan.current = sig;
      void search(2, presets.city, presets.keyword);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, presets.city, presets.keyword]);

  // 宿主的 iframe 沙箱通常没有 allow-forms，原生表单提交会被浏览器拦截，
  // 因此这里不用 <form>，改为按钮点击 + 回车键触发。
  const submit = () => {
    if (loading) return;
    if (!city.trim() || !keyword.trim()) {
      setError(new Error("请填写城市和位置关键词"));
      return;
    }
    void search(2);
  };
  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="stage">
      <h2 className="stage-title">选择点餐方式</h2>
      <div className="mode-grid">
        {MODES.map((m) => (
          <button
            key={m}
            className={`mode-card${m === mode ? " active" : ""}`}
            onClick={() => onMode(m)}
            type="button"
          >
            <span className="mode-icon">{MODE_ICON[m]}</span>
            <span className="mode-label">{MODE_META[m].label}</span>
            <span className="mode-desc muted small">{MODE_DESC[m]}</span>
          </button>
        ))}
      </div>

      {mode === "delivery" ? (
        <div className="panel">
          <p className="muted">外送需要先选择配送地址，再查询可配送门店。</p>
          <button className="btn primary" onClick={() => onMode("delivery")}>
            选择配送地址
          </button>
        </div>
      ) : (
        <div className="panel">
          <h3 className="panel-title">查找门店</h3>
          <div className="form-row">
            <label>
              城市
              <input value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={onEnter} placeholder="如：北京市" />
            </label>
            <label>
              位置关键词
              <input value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={onEnter} placeholder="如：中关村 / 五道口" />
            </label>
          </div>
          <div className="btn-row">
            <button className="btn primary" type="button" disabled={loading !== null} onClick={submit}>
              {loading === "search" ? "搜索中…" : "搜索门店"}
            </button>
            <button className="btn" type="button" disabled={loading !== null} onClick={() => void search(1)}>
              {loading === "fav" ? "加载中…" : "我的收藏门店"}
            </button>
          </div>
          <ErrorBox error={error} compact />
        </div>
      )}
    </div>
  );
}
