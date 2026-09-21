import { MODE_META, type OrderMode, type Store } from "../../../shared/types.js";
import { Badge, Empty } from "./common.js";

export function StoreStage({
  stores,
  mode,
  onSelect,
  onBack,
}: {
  stores: Store[];
  mode: OrderMode;
  onSelect: (store: Store) => void;
  onBack: () => void;
}) {
  return (
    <div className="stage">
      <div className="stage-head">
        <button className="btn ghost small" onClick={onBack}>
          ← 返回
        </button>
        <h2 className="stage-title">选择门店（{MODE_META[mode].label}）</h2>
      </div>
      {stores.length === 0 && <Empty>没有找到可用门店，请换个位置或地址试试。</Empty>}
      <ul className="card-list">
        {stores.map((s) => {
          const closed = s.businessStatus === false;
          return (
            <li key={`${s.storeCode}-${s.beCode}`} className={`card${closed ? " disabled" : ""}`}>
              <div className="card-main">
                <div className="card-title">
                  {s.storeName}
                  {closed ? <Badge tone="gray">休息中</Badge> : s.businessStatus ? <Badge tone="green">营业中</Badge> : null}
                  {s.reservation && <Badge tone="yellow">可预约</Badge>}
                </div>
                {s.address && <div className="muted">{s.address}</div>}
                <div className="muted small">
                  {s.distance && <span>距离 {s.distance} · </span>}
                  {s.businessStartTime && s.businessEndTime && (
                    <span>
                      营业 {s.businessStartTime}–{s.businessEndTime}
                    </span>
                  )}
                </div>
              </div>
              <button className="btn primary small" disabled={closed} onClick={() => onSelect(s)}>
                选这家
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
