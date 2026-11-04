import type { App } from "@modelcontextprotocol/ext-apps";
import { useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import {
  MODE_META,
  type Address,
  type Coupon,
  type MenuContext,
  type OrderInfo,
  type OrderMode,
  type PriceQuote,
  type Store,
} from "../../../shared/types.js";
import { api } from "../api.js";
import {
  cartToItems,
  couponEligibleLine,
  couponInUse,
  type CartAction,
  type CartLine,
} from "../cart.js";
import { fenToYuan } from "../format.js";
import { CartLines } from "./MenuStage.js";
import { Icon } from "./Icon.js";
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
    if (list.length && !list.some((t) => t.code === takeWayCode))
      setTakeWayCode(list[0].code);
  }, [quote, takeWayCode]);

  const needTakeWay = !delivery && (quote?.takeWayList.length ?? 0) > 0;
  const canSubmit =
    items.length > 0 &&
    !!quote &&
    !quoting &&
    !submitting &&
    (!delivery || !!address) &&
    (!needTakeWay || !!takeWayCode);

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
        remark:
          delivery && remark.trim() ? remark.trim().slice(0, 50) : undefined,
      });
      onOrderCreated(order);
    } catch (e) {
      setSubmitError(e);
    } finally {
      setSubmitting(false);
    }
  };

  const total = quote ? fenToYuan(quote.price) : "—";
  const couponOptions = (coupons ?? []).map((coupon) => {
    const inUse = couponInUse(cart, coupon.couponId);
    return {
      coupon,
      inUse,
      eligible: !inUse && !!couponEligibleLine(cart, coupon),
    };
  });
  const availableCoupons = couponOptions.filter(
    (option) => option.inUse || option.eligible,
  );
  const unavailableCoupons = couponOptions.filter(
    (option) => !option.inUse && !option.eligible,
  );

  return (
    <div className="stage checkout-stage">
      <div className="checkout-content">
        <div className="stage-head checkout-head">
          <h2 className="stage-title">确认订单</h2>
          <button className="btn ghost small" onClick={onBack}>
            ← 继续点餐
          </button>
        </div>

        <div className="checkout-layout">
          <div className="checkout-main">
            <section className="panel" aria-labelledby="checkout-items-title">
              <div className="checkout-store">
                <Icon name="store" size={18} />
                <div>
                  <div className="checkout-store-name">{store.storeName}</div>
                  <div className="muted small">{MODE_META[mode].label}</div>
                </div>
              </div>
              {delivery && address && (
                <div className="checkout-address muted">
                  送至：{address.fullAddress ?? `地址 ${address.addressId}`}{" "}
                  {address.contactName} {address.phone}
                </div>
              )}
              {delivery && !address && (
                <div className="sub-panel">
                  <div className="warn-text">请选择配送地址</div>
                  <ErrorBox error={addrError} compact />
                  {addrList === null && !addrError && (
                    <Spinner label="加载地址…" />
                  )}
                  <ul className="card-list compact">
                    {(addrList ?? []).map((a) => (
                      <li key={a.addressId} className="card">
                        <div className="card-main">
                          <div>
                            {a.contactName}{" "}
                            <span className="muted">{a.phone}</span>
                          </div>
                          <div className="muted small">{a.fullAddress}</div>
                        </div>
                        <button
                          className="btn small"
                          onClick={() => onAddress(a)}
                        >
                          选择
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="checkout-section-head">
                <h3 className="panel-title" id="checkout-items-title">
                  餐品
                </h3>
                <span className="muted small">
                  {cart.reduce((sum, line) => sum + line.quantity, 0)} 件
                </span>
              </div>
              {cart.length === 0 ? (
                <Empty>购物车是空的，请返回点餐。</Empty>
              ) : (
                <CartLines cart={cart} dispatch={dispatch} />
              )}
            </section>

            <section className="panel" aria-labelledby="checkout-options-title">
              <h3 className="panel-title" id="checkout-options-title">
                {delivery ? "配送设置" : "取餐设置"}
              </h3>
              {!delivery && (
                <>
                  {quote && quote.takeWayList.length === 0 && (
                    <div className="muted">按门店默认方式取餐</div>
                  )}
                  {!quote && (
                    <div className="muted small">计价后显示可选取餐方式</div>
                  )}
                  <div className="radio-row" role="group" aria-label="取餐方式">
                    {(quote?.takeWayList ?? []).map((t) => (
                      <label
                        key={t.code}
                        className={`radio${takeWayCode === t.code ? " checked" : ""}`}
                      >
                        <input
                          type="radio"
                          name="takeWay"
                          value={t.code}
                          checked={takeWayCode === t.code}
                          onChange={() => setTakeWayCode(t.code)}
                        />
                        {t.name}
                      </label>
                    ))}
                  </div>
                </>
              )}
              <div className="checkout-extras">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={needTableware}
                    onChange={(e) => setNeedTableware(e.target.checked)}
                  />
                  需要餐具
                  {quote?.tablewarePrice
                    ? `（${fenToYuan(quote.tablewarePrice)}）`
                    : ""}
                </label>
                {delivery && (
                  <label className="checkout-remark">
                    订单备注（最多 50 字）
                    <input
                      value={remark}
                      maxLength={50}
                      onChange={(e) => setRemark(e.target.value)}
                      placeholder="如：无接触配送，放门口"
                    />
                  </label>
                )}
              </div>
            </section>
          </div>

          <aside className="panel checkout-summary" aria-label="结算信息">
            <section aria-labelledby="checkout-coupons-title">
              <h3 className="panel-title" id="checkout-coupons-title">
                优惠券{" "}
                {quote && quote.discount > 0 && (
                  <Badge tone="green">已优惠 {fenToYuan(quote.discount)}</Badge>
                )}
              </h3>
              {coupons === null && !couponError && (
                <Skeleton rows={2} card={false} />
              )}
              <ErrorBox error={couponError} compact />
              {coupons && availableCoupons.length === 0 && (
                <div className="muted small">暂无可用优惠券</div>
              )}
              <CheckoutCoupons options={availableCoupons} dispatch={dispatch} />
              {unavailableCoupons.length > 0 && (
                <details className="coupon-unavailable">
                  <summary>不可用优惠券（{unavailableCoupons.length}）</summary>
                  <CheckoutCoupons
                    options={unavailableCoupons}
                    dispatch={dispatch}
                  />
                </details>
              )}
            </section>

            <section
              className="checkout-pricing"
              aria-labelledby="checkout-price-title"
            >
              <h3 className="panel-title" id="checkout-price-title">
                费用明细 {quoting && <Badge tone="gray">计算中…</Badge>}
              </h3>
              <ErrorBox error={quoteError} compact />
              {!quote && quoting && <Spinner label="正在计算金额…" />}
              {quote && (
                <dl className="price-table">
                  <dt>商品金额</dt>
                  <dd>
                    {fenToYuan(quote.productPrice)}
                    {quote.productOriginalPrice !== quote.productPrice && (
                      <span className="price-orig">
                        {" "}
                        {fenToYuan(quote.productOriginalPrice)}
                      </span>
                    )}
                  </dd>
                  {(delivery || quote.deliveryPrice > 0) && (
                    <>
                      <dt>配送费</dt>
                      <dd>
                        {fenToYuan(quote.deliveryPrice)}
                        {quote.deliveryOriginalPrice !==
                          quote.deliveryPrice && (
                          <span className="price-orig">
                            {" "}
                            {fenToYuan(quote.deliveryOriginalPrice)}
                          </span>
                        )}
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
                </dl>
              )}
            </section>

            <div className="checkout-payment">
              <div className="checkout-total">
                <span>应付金额</span>
                <strong className="price">{total}</strong>
              </div>
              <ErrorBox error={submitError} />
              <button
                className="btn primary large"
                disabled={!canSubmit}
                onClick={() => void submit()}
              >
                {submitting ? "正在下单…" : "确认下单并付款"}
              </button>
              <p className="muted small checkout-note">
                金额以门店实时报价为准
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function CheckoutCoupons({
  options,
  dispatch,
}: {
  options: { coupon: Coupon; inUse: boolean; eligible: boolean }[];
  dispatch: Dispatch<CartAction>;
}) {
  if (options.length === 0) return null;
  return (
    <ul className="coupon-list">
      {options.map(({ coupon, inUse, eligible }) => (
        <li
          key={coupon.couponId}
          className={`coupon${inUse ? " in-use" : ""}${!inUse && !eligible ? " disabled" : ""}`}
        >
          <div className="coupon-main">
            <div className="coupon-title">{coupon.title}</div>
            <details className="coupon-terms">
              <summary>使用规则</summary>
              <div>
                {coupon.products.length > 0
                  ? `适用：${coupon.products.map((p) => p.productName ?? p.productCode).join("、")}`
                  : "适用：不限餐品"}
              </div>
              {coupon.tradeDateTime && (
                <div>有效期：{coupon.tradeDateTime}</div>
              )}
            </details>
          </div>
          {inUse ? (
            <button
              className="btn small"
              onClick={() =>
                dispatch({ type: "removeCoupon", couponId: coupon.couponId })
              }
            >
              取消使用
            </button>
          ) : (
            <button
              className="btn small"
              disabled={!eligible}
              onClick={() => dispatch({ type: "applyCoupon", coupon })}
              title={eligible ? "" : "购物车中没有适用餐品"}
            >
              使用
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
