import type { App } from "@modelcontextprotocol/ext-apps";
import { useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import { MODE_META, type Address, type Coupon, type MenuContext, type OrderInfo, type OrderMode, type PriceQuote, type Store } from "../../../shared/types.js";
import { api } from "../api.js";
import { cartToItems, couponEligibleLine, couponInUse, type CartAction, type CartLine } from "../cart.js";
import { fenToYuan } from "../format.js";
import { CartLines } from "./MenuStage.js";
import { Badge, Empty, ErrorBox, Skeleton, Spinner } from "./common.js";

export function CheckoutStage({
  app,
  ctx,
  mode,
  store,
  address,
  onAddress,
  cart,
  dispatch,
  onBack,
  onOrderCreated,
}: {
  app: App;
  ctx: MenuContext;
  mode: OrderMode;
  store: Store;
  address?: Address;
  onAddress: (address: Address) => void;
  cart: CartLine[];
  dispatch: Dispatch<CartAction>;
  onBack: () => void;
  onOrderCreated: (order: OrderInfo) => void;
}) {
  const delivery = MODE_META[mode].delivery;
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [couponError, setCouponError] = useState<unknown>(null);
  const [quote, setQuote] = useState<PriceQuote | null>(null);
  const [quoteError, setQuoteError] = useState<unknown>(null);
  const [quoting, setQuoting] = useState(false);
  const [takeWayCode, setTakeWayCode] = useState("");
  const [remark, setRemark] = useState("");
  const [needTableware, setNeedTableware] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [addrList, setAddrList] = useState<Address[] | null>(null);
  const [addrError, setAddrError] = useState<unknown>(null);

  // 可用优惠券
  useEffect(() => {
    let cancelled = false;
    api
      .queryStoreCoupons(app, ctx)
      .then((c) => !cancelled && setCoupons(c))
      .catch((e) => !cancelled && setCouponError(e));
    return () => {
      cancelled = true;
    };
  }, [app, ctx]);

  // 外送但没有地址（例如模型直接打开了菜单）：让用户在这里补选
  useEffect(() => {
    if (!delivery || address || addrList !== null) return;
    api.queryAddresses(app).then(setAddrList).catch(setAddrError);
  }, [app, delivery, address, addrList]);

  // 官方报价（防抖 + 丢弃过期结果）
  const items = useMemo(() => cartToItems(cart), [cart]);
  const seq = useRef(0);
  useEffect(() => {
    if (items.length === 0) {
      setQuote(null);
      return;
    }
    const mySeq = ++seq.current;
    setQuoting(true);
    setQuoteError(null);
    const timer = setTimeout(async () => {
      try {
        const q = await api.calculatePrice(app, ctx, items, { needTableware });
        if (mySeq === seq.current) setQuote(q);
      } catch (e) {
        if (mySeq === seq.current) setQuoteError(e);
      } finally {
        if (mySeq === seq.current) setQuoting(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [app, ctx, items, needTableware]);

  // 取餐方式默认选第一项
  useEffect(() => {
    const list = quote?.takeWayList ?? [];
    if (list.length && !list.some((t) => t.code === takeWayCode)) setTakeWayCode(list[0].code);
  }, [quote, takeWayCode]);

  const needTakeWay = !delivery && (quote?.takeWayList.length ?? 0) > 0;
  const canSubmit =
    items.length > 0 && !!quote && !quoting && !submitting && (!delivery || !!address) && (!needTakeWay || !!takeWayCode);

  const submit = async () => {
    if (!canSubmit || !quote) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const order = await api.createOrder(app, {
        storeCode: store.storeCode,
        beCode: store.beCode,
        beType: MODE_META[mode].beType,
        orderType: MODE_META[mode].orderType,
        items,
        addressId: delivery ? address?.addressId : undefined,
        takeWayCode: !delivery && takeWayCode ? takeWayCode : undefined,
        needTableware: needTableware || undefined,
        remark: delivery && remark.trim() ? remark.trim().slice(0, 50) : undefined,
      });
      onOrderCreated(order);
    } catch (e) {
      setSubmitError(e);
    } finally {
      setSubmitting(false);
    }
  };

  const total = quote ? fenToYuan(quote.price) : "—";

  return (
    <>
      <div className="stage checkout-stage">
        <div className="stage-head">
          <button className="btn ghost small" onClick={onBack}>
            ← 继续点餐
          </button>
          <h2 className="stage-title">确认订单</h2>
        </div>

        <section className="panel">
          <h3 className="panel-title">
            {MODE_META[mode].label} · {store.storeName}
          </h3>
          {delivery && address && (
            <div className="muted">
              送至：{address.fullAddress ?? `地址 ${address.addressId}`} {address.contactName} {address.phone}
            </div>
          )}
          {delivery && !address && (
            <div className="sub-panel">
              <div className="warn-text">请选择配送地址</div>
              <ErrorBox error={addrError} compact />
              {addrList === null && !addrError && <Spinner label="加载地址…" />}
              <ul className="card-list compact">
                {(addrList ?? []).map((a) => (
                  <li key={a.addressId} className="card">
                    <div className="card-main">
                      <div>
                        {a.contactName} <span className="muted">{a.phone}</span>
                      </div>
                      <div className="muted small">{a.fullAddress}</div>
                    </div>
                    <button className="btn small" onClick={() => onAddress(a)}>
                      选择
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="panel">
          <h3 className="panel-title">餐品</h3>
          {cart.length === 0 ? <Empty>购物车是空的，请返回点餐。</Empty> : <CartLines cart={cart} dispatch={dispatch} />}
        </section>

        <section className="panel">
          <h3 className="panel-title">
            优惠券 {quote && quote.discount > 0 && <Badge tone="green">已优惠 {fenToYuan(quote.discount)}</Badge>}
          </h3>
          {coupons === null && !couponError && <Skeleton rows={2} card={false} />}
          <ErrorBox error={couponError} compact />
          {coupons && coupons.length === 0 && <div className="muted">当前门店没有可用优惠券。</div>}
          <ul className="coupon-list">
            {(coupons ?? []).map((c) => {
              const inUse = couponInUse(cart, c.couponId);
              const eligible = !inUse && !!couponEligibleLine(cart, c);
              return (
                <li key={c.couponId} className={`coupon${inUse ? " in-use" : ""}${!inUse && !eligible ? " disabled" : ""}`}>
                  <div className="coupon-main">
                    <div className="coupon-title">{c.title}</div>
                    <div className="muted small">
                      {c.products.length > 0 ? `适用：${c.products.map((p) => p.productName ?? p.productCode).join("、")}` : "适用：不限餐品"}
                      {c.tradeDateTime && <span> · 有效期 {c.tradeDateTime}</span>}
                    </div>
                  </div>
                  {inUse ? (
                    <button className="btn small" onClick={() => dispatch({ type: "removeCoupon", couponId: c.couponId })}>
                      取消使用
                    </button>
                  ) : (
                    <button className="btn primary small" disabled={!eligible} onClick={() => dispatch({ type: "applyCoupon", coupon: c })} title={eligible ? "" : "购物车中没有适用餐品"}>
                      使用
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {!delivery && (
          <section className="panel">
            <h3 className="panel-title">取餐方式</h3>
            {quote && quote.takeWayList.length === 0 && <div className="muted">门店未返回取餐方式选项，将按默认方式下单。</div>}
            {!quote && <div className="muted small">计价后显示可选取餐方式</div>}
            <div className="radio-row">
              {(quote?.takeWayList ?? []).map((t) => (
                <label key={t.code} className={`radio${takeWayCode === t.code ? " checked" : ""}`}>
                  <input type="radio" name="takeWay" value={t.code} checked={takeWayCode === t.code} onChange={() => setTakeWayCode(t.code)} />
                  {t.name}
                </label>
              ))}
            </div>
          </section>
        )}

        <section className="panel">
          <h3 className="panel-title">其他</h3>
          <label className="checkbox">
            <input type="checkbox" checked={needTableware} onChange={(e) => setNeedTableware(e.target.checked)} />
            需要餐具{quote?.tablewarePrice ? `（${fenToYuan(quote.tablewarePrice)}）` : ""}
          </label>
          {delivery && (
            <label>
              订单备注（最多 50 字）
              <input value={remark} maxLength={50} onChange={(e) => setRemark(e.target.value)} placeholder="如：无接触配送，放门口" />
            </label>
          )}
        </section>

        <section className="panel">
          <h3 className="panel-title">
            费用明细 {quoting && <Badge tone="gray">计算中…</Badge>}
          </h3>
          <ErrorBox error={quoteError} compact />
          {quote && (
            <dl className="price-table">
              <dt>商品金额</dt>
              <dd>
                {fenToYuan(quote.productPrice)}
                {quote.productOriginalPrice !== quote.productPrice && <span className="price-orig"> {fenToYuan(quote.productOriginalPrice)}</span>}
              </dd>
              {(delivery || quote.deliveryPrice > 0) && (
                <>
                  <dt>配送费</dt>
                  <dd>
                    {fenToYuan(quote.deliveryPrice)}
                    {quote.deliveryOriginalPrice !== quote.deliveryPrice && <span className="price-orig"> {fenToYuan(quote.deliveryOriginalPrice)}</span>}
                  </dd>
                </>
              )}
              {needTableware && quote.tablewarePrice != null && (
                <>
                  <dt>餐具费</dt>
                  <dd>{fenToYuan(quote.tablewarePrice)}</dd>
                </>
              )}
              {quote.discount > 0 && (
                <>
                  <dt>优惠</dt>
                  <dd className="discount">-{fenToYuan(quote.discount)}</dd>
                </>
              )}
              <dt className="total">应付金额</dt>
              <dd className="total">{fenToYuan(quote.price)}</dd>
            </dl>
          )}
          <p className="muted small">金额为麦当劳官方实时报价（calculate-price）。</p>
        </section>
        <ErrorBox error={submitError} />
      </div>

      <footer className="cart-bar">
        <div className="cart-total">
          应付 <strong className="price">{total}</strong>
        </div>
        <button className="btn primary large" disabled={!canSubmit} onClick={() => void submit()}>
          {submitting ? "正在下单…" : "确认下单并付款"}
        </button>
      </footer>
    </>
  );
}
