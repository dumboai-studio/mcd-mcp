import type { App } from "@modelcontextprotocol/ext-apps";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import type { OrderInfo } from "../../../shared/types.js";
import { api } from "../api.js";
import { appPayTarget, isTerminalStatus, isUnpaidStatus, takeWayLabel, yuan } from "../format.js";
import { Badge, ErrorBox, MealImage, OrderTimeline, Skeleton } from "./common.js";

const CANCEL_REASONS: { code: number; label: string }[] = [
  { code: 1, label: "改主意了" },
  { code: 2, label: "重复下单" },
  { code: 3, label: "点错了 / 点多了 / 点少了" },
  { code: 4, label: "地址 / 电话填错了" },
  { code: 5, label: "送达时间选错了" },
  { code: -1, label: "其它原因" },
];

const POLL_MS = 8000;
const POLL_MAX_MS = 30 * 60 * 1000;

function statusTone(status: string): "red" | "yellow" | "green" | "gray" {
  if (isUnpaidStatus(status)) return "red";
  if (/取消|关闭|失败|退款/.test(status)) return "gray";
  if (/完成|已送达|已取餐/.test(status)) return "green";
  return "yellow";
}

export function OrderStage({
  app,
  orderId,
  initialOrder,
  onOrder,
  onRestart,
}: {
  app: App;
  orderId: string;
  initialOrder: OrderInfo | null;
  onOrder: (order: OrderInfo) => void;
  onRestart: () => void;
}) {
  const [order, setOrder] = useState<OrderInfo | null>(initialOrder);
  const [loading, setLoading] = useState(!initialOrder);
  const [error, setError] = useState<unknown>(null);
  const [payMsg, setPayMsg] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState(1);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<unknown>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const payUrlRef = useRef<string | undefined>(initialOrder?.payH5Url);
  if (order?.payH5Url) payUrlRef.current = order.payH5Url;
  const payUrl = payUrlRef.current;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fresh = await api.queryOrder(app, orderId);
      const merged: OrderInfo = { ...fresh, payH5Url: fresh.payH5Url ?? payUrlRef.current };
      setOrder(merged);
      onOrder(merged);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [app, orderId, onOrder]);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!initialOrder || initialOrder.orderId !== orderId) void refreshRef.current();
  }, [orderId, initialOrder]);

  const openPay = useCallback(
    async (url: string) => {
      if (!app.getHostCapabilities()?.openLinks) {
        setPayMsg("当前环境不支持自动打开链接，请复制下方支付链接到浏览器打开。");
        return;
      }
      try {
        const r = await app.openLink({ url });
        setPayMsg(r.isError ? "未能自动打开支付页，请手动打开下方链接。" : "已在浏览器打开支付页，完成支付后回到这里查看订单状态。");
      } catch (e) {
        setPayMsg(`打开支付页失败：${(e as Error).message}，请手动打开下方链接。`);
      }
    },
    [app],
  );

  // 支付二维码：编码官方扫码支付页，纯前端生成，不依赖网络
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (!payUrl) {
      setQr(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(appPayTarget(payUrl), { width: 240, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => !cancelled && setQr(url))
      .catch(() => !cancelled && setQr(null));
    return () => {
      cancelled = true;
    };
  }, [payUrl]);

  // 非终态时轮询订单状态
  const status = order?.orderStatus;
  useEffect(() => {
    if (!status || isTerminalStatus(status)) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > POLL_MAX_MS) {
        clearInterval(timer);
        return;
      }
      void refreshRef.current();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [status, orderId]);

  const cancel = async () => {
    setCancelling(true);
    setCancelError(null);
    try {
      await api.cancelOrder(app, orderId, cancelReason);
      setCancelOpen(false);
      await refreshRef.current();
    } catch (e) {
      setCancelError(e);
    } finally {
      setCancelling(false);
    }
  };

  const unpaid = isUnpaidStatus(status);
  const terminal = isTerminalStatus(status);

  // 状态不再是待支付时收起取消面板
  useEffect(() => {
    if (!unpaid) setCancelOpen(false);
  }, [unpaid]);
  const delivery = !!order?.deliveryInfo?.deliveryAddress || !!order?.deliveryInfo?.deliveryType;

  return (
    <div className="stage order-stage">
      <div className="stage-head">
        <h2 className="stage-title">订单状态</h2>
        <div className="btn-row">
          <button className="btn ghost small" onClick={() => void refresh()} disabled={loading}>
            {loading ? "刷新中…" : "刷新"}
          </button>
        </div>
      </div>
      <ErrorBox error={error} onRetry={refresh} />
      {!order && loading && <Skeleton rows={3} />}

      {order && (
        <>
          <section className={`status-card ${statusTone(order.orderStatus)}`}>
            <div className="status-head">
              <div className="status-main">
                <div className="status-label">{order.orderStatus}</div>
                <div className="muted small">
                  订单号 {order.orderId}
                  {order.createTime && <span> · {order.createTime}</span>}
                </div>
              </div>
              {!terminal && (
                <div className="muted small">
                  自动刷新中{lastRefresh && `（${lastRefresh.toLocaleTimeString()}）`}
                </div>
              )}
            </div>
            <OrderTimeline status={order.orderStatus} delivery={delivery} />
          </section>

          {unpaid && (
            <section className="panel pay-panel">
              <h3 className="panel-title">
                扫码付款 <span className="price">{yuan(order.realTotalAmount)}</span>
              </h3>
              {payUrl ? (
                <div className="qr-row">
                  <div className="qr-box" aria-label="支付二维码">
                    {qr ? <img src={qr} alt="支付二维码" width={184} height={184} /> : <div className="qr-placeholder">生成二维码…</div>}
                  </div>
                  <div className="qr-side">
                    <p>
                      用<strong>麦当劳 App 或微信</strong>扫码，会跳转到麦当劳 App 完成支付。支付完成后这里会自动更新订单状态。
                    </p>
                    <p className="muted small">麦当劳只支持在 App 内付款；也可以直接打开麦当劳 App，在「我的订单」中支付。</p>
                    <div className="pay-link">
                      <input readOnly value={payUrl} onFocus={(e) => e.currentTarget.select()} aria-label="支付链接" />
                      <button className="btn small" onClick={() => void openPay(payUrl)}>
                        浏览器打开
                      </button>
                    </div>
                    {payMsg && <div className="notice">{payMsg}</div>}
                  </div>
                </div>
              ) : (
                <p className="muted">本次查询未返回支付链接，请在麦当劳 App「我的订单」中完成支付。</p>
              )}
            </section>
          )}

          {!delivery && (order.takeWay || order.pickupCode || order.lockerCode || order.lockerQrCode) && (
            <section className="panel">
              <h3 className="panel-title">取餐信息</h3>
              <div className="pickup-grid">
                {order.takeWay && (
                  <div>
                    <div className="muted small">取餐方式</div>
                    <div>{takeWayLabel(order.takeWay)}</div>
                  </div>
                )}
                {order.pickupCode && (
                  <div>
                    <div className="muted small">取餐码</div>
                    <div className="pickup-code">{order.pickupCode}</div>
                  </div>
                )}
                {order.lockerCode && (
                  <div>
                    <div className="muted small">取餐柜密码</div>
                    <div className="pickup-code">{order.lockerCode}</div>
                  </div>
                )}
              </div>
              {order.lockerQrCode && <MealImage src={order.lockerQrCode} name="取餐柜二维码" size={140} />}
            </section>
          )}

          {delivery && order.deliveryInfo && (
            <section className="panel">
              <h3 className="panel-title">配送信息</h3>
              <div className="kv">
                {order.deliveryInfo.deliveryType && (
                  <>
                    <span className="muted">配送方式</span>
                    <span>{order.deliveryInfo.deliveryType}</span>
                  </>
                )}
                {order.deliveryInfo.expectDeliveryTime && (
                  <>
                    <span className="muted">预计送达</span>
                    <span>{order.deliveryInfo.expectDeliveryTime}</span>
                  </>
                )}
                <span className="muted">收货地址</span>
                <span>
                  {order.deliveryInfo.deliveryAddress} {order.deliveryInfo.addressDetail}
                </span>
                <span className="muted">收货人</span>
                <span>
                  {order.deliveryInfo.customerNickname} {order.deliveryInfo.mobilePhone}
                </span>
                {order.remark && (
                  <>
                    <span className="muted">备注</span>
                    <span>{order.remark}</span>
                  </>
                )}
              </div>
            </section>
          )}

          <section className="panel">
            <h3 className="panel-title">
              {order.storeName ?? "门店"} {order.storeAddress && <span className="muted small">{order.storeAddress}</span>}
            </h3>
            <ul className="order-products">
              {order.products.map((p, i) => (
                <li key={i}>
                  <MealImage src={p.productImage} name={p.productName} size={40} />
                  <div className="order-product-info">
                    <div>
                      {p.productName} <span className="muted">×{p.quantity}</span>
                    </div>
                    {p.comboItemList.length > 0 && (
                      <div className="muted small">{p.comboItemList.map((c) => `${c.itemName}${c.itemQuantity && c.itemQuantity > 1 ? `×${c.itemQuantity}` : ""}`).join("，")}</div>
                    )}
                  </div>
                  <div>{yuan(p.price)}</div>
                </li>
              ))}
            </ul>
            <dl className="price-table">
              {order.productPrice && (
                <>
                  <dt>商品金额</dt>
                  <dd>{yuan(order.productPrice)}</dd>
                </>
              )}
              {order.realDeliveryPrice && Number(order.realDeliveryPrice) > 0 && (
                <>
                  <dt>配送费</dt>
                  <dd>{yuan(order.realDeliveryPrice)}</dd>
                </>
              )}
              {order.totalDiscountAmount && Number(order.totalDiscountAmount) > 0 && (
                <>
                  <dt>优惠</dt>
                  <dd className="discount">-{yuan(order.totalDiscountAmount)}</dd>
                </>
              )}
              <dt className="total">实付</dt>
              <dd className="total">{yuan(order.realTotalAmount ?? order.totalAmount)}</dd>
            </dl>
          </section>

          <div className="btn-row order-actions">
            {unpaid && !cancelOpen && (
              <button className="btn" onClick={() => setCancelOpen(true)}>
                取消订单
              </button>
            )}
            <button className="btn ghost" onClick={onRestart}>
              再点一单
            </button>
          </div>
          {cancelOpen && (
            <section className="panel">
              <h3 className="panel-title">取消订单</h3>
              <label>
                取消原因
                <select value={cancelReason} onChange={(e) => setCancelReason(Number(e.target.value))}>
                  {CANCEL_REASONS.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <ErrorBox error={cancelError} compact />
              <div className="btn-row">
                <button className="btn danger" disabled={cancelling} onClick={() => void cancel()}>
                  {cancelling ? "取消中…" : "确认取消"}
                </button>
                <button className="btn" onClick={() => setCancelOpen(false)}>
                  返回
                </button>
              </div>
            </section>
          )}
          <p className="muted small">
            <Badge tone="gray">提示</Badge> 订单状态来自 query-order；支付完成后状态可能需要几秒才会更新。
          </p>
        </>
      )}
    </div>
  );
}
