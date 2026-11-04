import { Modal } from "./Modal.js";
import { Icon } from "./Icon.js";
import type { App } from "@modelcontextprotocol/ext-apps";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
} from "react";
import type {
  MealDetail,
  MealModificationGroup,
  MealRound,
  Menu,
  MenuCategory,
  MenuContext,
  MenuItem,
  ModificationSelection,
  RoundSelection,
  Store,
} from "../../../shared/types.js";
import { MODE_META, modeFromBeType } from "../../../shared/types.js";
import { api } from "../api.js";
import {
  cartCount,
  cartSubtotal,
  type CartAction,
  type CartLine,
  type CartSelection,
} from "../cart.js";
import { priceNum, yuan } from "../format.js";
import {
  Badge,
  Empty,
  ErrorBox,
  MealImage,
  PlusIcon,
  Skeleton,
  Spinner,
  Stepper,
} from "./common.js";

export function MenuStage({
  app,
  ctx,
  store,
  menu,
  onMenu,
  cart,
  dispatch,
  wide,
  onCheckout,
  onBack,
}: {
  app: App;
  ctx: MenuContext;
  store: Store;
  menu: Menu | null;
  onMenu: (menu: Menu) => void;
  cart: CartLine[];
  dispatch: Dispatch<CartAction>;
  wide: boolean;
  onCheckout: () => void;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [activeCat, setActiveCat] = useState(0);
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      onMenu(await api.queryMeals(app, ctx));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [app, ctx, onMenu]);

  useEffect(() => {
    if (!menu) void load();
  }, [menu, load]);

  const categories = useMemo<MenuCategory[]>(() => {
    if (!menu) return [];
    const cats = [...menu.categories];
    if (menu.frequent.length)
      cats.unshift({ name: "我的常点", items: menu.frequent });
    return cats;
  }, [menu]);

  const current =
    categories[Math.min(activeCat, Math.max(categories.length - 1, 0))];

  // 套餐单品通常不带图，但多数也是菜单里可单卖的餐品：按编码回退到菜单图片
  const imageByCode = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const c of menu?.categories ?? [])
      for (const it of c.items) if (it.image) map[it.code] = it.image;
    for (const it of menu?.frequent ?? [])
      if (it.image) map[it.code] = it.image;
    return map;
  }, [menu]);

  const qtyOf = (code: string) =>
    cart
      .filter((l) => l.productCode === code)
      .reduce((n, l) => n + l.quantity, 0);
  const plainKey = (code: string) =>
    cart.find((l) => l.productCode === code && !l.couponId)?.key;

  const count = cartCount(cart);
  const subtotal = cartSubtotal(cart);

  return (
    <>
      <div className="stage menu-stage">
        <div className="store-toolbar">
          <Icon name="store" size={16} />
          <h2>{store.storeName}</h2>
          <span className="store-mode">
            {MODE_META[modeFromBeType(ctx.beType)].label}
          </span>
          <button className="btn ghost small" onClick={onBack}>
            换门店
          </button>
        </div>
        {loading && !menu && <Skeleton rows={4} />}
        {loading && menu && <Spinner label="正在刷新菜单…" />}
        <ErrorBox error={error} onRetry={load} />
        {menu && categories.length === 0 && (
          <Empty>当前时段没有可售餐品。</Empty>
        )}
        {menu && categories.length > 0 && (
          <div className="menu-body">
            <nav className="cat-nav" aria-label="餐品分类">
              {categories.map((c, i) => (
                <button
                  key={c.name + i}
                  className={i === activeCat ? "active" : ""}
                  aria-pressed={i === activeCat}
                  onClick={() => setActiveCat(i)}
                >
                  {c.name}
                </button>
              ))}
            </nav>
            <div className="menu-list">
              {current?.items.map((item) => {
                const q = qtyOf(item.code);
                const key = plainKey(item.code);
                const hasDiscount =
                  item.originalPrice &&
                  item.originalPrice !== item.currentPrice;
                return (
                  <div key={item.code} className="meal-card">
                    <button
                      className="meal-hit"
                      onClick={() => setDetailItem(item)}
                      title="查看详情"
                    >
                      <MealImage src={item.image} name={item.name} size={72} />
                    </button>
                    <div className="meal-info">
                      <button
                        className="meal-name"
                        onClick={() => setDetailItem(item)}
                      >
                        {item.name}
                      </button>
                      {(item.tags.length > 0 || item.discountType) && (
                        <div className="meal-tags">
                          {item.tags.map((t) => (
                            <Badge key={t} tone="yellow">
                              {t}
                            </Badge>
                          ))}
                          {item.discountType && (
                            <Badge tone="red">{item.discountType}</Badge>
                          )}
                        </div>
                      )}
                      <div className="product-bottom">
                        <div className="meal-price">
                          <span className="price">
                            {yuan(item.currentPrice)}
                          </span>
                          {hasDiscount && (
                            <span className="price-orig">
                              {yuan(item.originalPrice)}
                            </span>
                          )}
                        </div>
                        <div className="meal-actions">
                          {q > 0 && key ? (
                            <Stepper
                              value={q}
                              onInc={() => dispatch({ type: "inc", key })}
                              onDec={() => dispatch({ type: "dec", key })}
                            />
                          ) : q > 0 ? (
                            <Stepper
                              value={q}
                              onInc={() => dispatch({ type: "add", item })}
                              onDec={() => {}}
                            />
                          ) : (
                            <button
                              className="btn round"
                              onClick={() => dispatch({ type: "add", item })}
                              aria-label={`加入 ${item.name}`}
                            >
                              <PlusIcon size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {wide && (
              <aside className="cart-side" aria-label="购物车">
                <h3>购物车 {count > 0 && <Badge tone="red">{count}</Badge>}</h3>
                {cart.length === 0 ? (
                  <Empty>还没有选餐品</Empty>
                ) : (
                  <CartLines cart={cart} dispatch={dispatch} />
                )}
                <div className="cart-side-foot">
                  <div className="cart-estimate">
                    <span>预估合计</span>
                    <strong className="price">{yuan(subtotal)}</strong>
                  </div>
                  <button
                    className="btn primary"
                    disabled={count === 0}
                    onClick={onCheckout}
                  >
                    去结算
                  </button>
                </div>
              </aside>
            )}
          </div>
        )}
      </div>

      {!wide && (
        <footer className="cart-bar">
          <button
            className="cart-summary"
            onClick={() => setCartOpen(true)}
            disabled={count === 0}
          >
            <span className="cart-icon">
              <Icon name="cart" size={22} />
              {count > 0 && <span className="cart-count">{count}</span>}
            </span>
            <span className="cart-total">
              {count === 0 ? (
                "购物车是空的"
              ) : (
                <>
                  预估 <strong>{yuan(subtotal)}</strong>
                </>
              )}
            </span>
          </button>
          <button
            className="btn primary"
            disabled={count === 0}
            onClick={onCheckout}
          >
            去结算
          </button>
        </footer>
      )}

      {detailItem && (
        <MealDetailModal
          app={app}
          ctx={ctx}
          item={detailItem}
          imageByCode={imageByCode}
          onClose={() => setDetailItem(null)}
          onAdd={(selection) => {
            dispatch({ type: "add", item: detailItem, selection });
            setDetailItem(null);
          }}
        />
      )}
      {cartOpen && (
        <CartDrawer
          cart={cart}
          dispatch={dispatch}
          onClose={() => setCartOpen(false)}
          onCheckout={onCheckout}
        />
      )}
    </>
  );
}

// ---------- 餐品详情：可选套餐分区与特调 ----------

type Picked = Record<string, string[]>;
type Mods = Record<string, boolean>;

const roundKey = (r: MealRound) => String(r.id);
const modKey = (gi: number, code: string) => `${gi}:${code}`;
const sortedJoin = (codes: string[]) => [...codes].sort().join(",");

/** 分区里超过一半的选项有图才用图片卡片，避免一排图片里夹着空位 */
function roundHasImages(
  r: MealRound,
  imageByCode: Record<string, string>,
): boolean {
  const withImage = r.choices.filter(
    (c) => c.image ?? imageByCode[c.code],
  ).length;
  return withImage > 0 && withImage * 2 > r.choices.length;
}

function defaultPicked(detail: MealDetail): Picked {
  const picked: Picked = {};
  for (const r of detail.rounds) {
    const selected = r.choices.filter((c) => c.selected).map((c) => c.code);
    picked[roundKey(r)] =
      selected.length || r.min < 1
        ? selected.slice(0, r.max)
        : [r.choices[0].code];
  }
  return picked;
}

function defaultMods(detail: MealDetail): Mods {
  const mods: Mods = {};
  detail.modification.forEach((g, gi) =>
    g.values.forEach(
      (v) => (mods[modKey(gi, v.code)] = v.selectedQuantity > 0),
    ),
  );
  return mods;
}

/** 根据用户选择生成购物车行的搭配信息；与默认完全一致时返回 undefined（按官方默认下单） */
function buildSelection(
  detail: MealDetail,
  picked: Picked,
  mods: Mods,
): CartSelection | undefined {
  const roundsChanged = detail.rounds.some(
    (r) =>
      sortedJoin(picked[roundKey(r)] ?? []) !==
      sortedJoin(r.choices.filter((c) => c.selected).map((c) => c.code)),
  );
  const modChanged = detail.modification.some((g, gi) =>
    g.values.some(
      (v) => (mods[modKey(gi, v.code)] ?? false) !== v.selectedQuantity > 0,
    ),
  );
  if (!roundsChanged && !modChanged) return undefined;

  const roundList: RoundSelection[] | undefined = roundsChanged
    ? detail.rounds
        .map((r) => ({
          round: r.id,
          comboItemList: (picked[roundKey(r)] ?? []).map((code) => ({
            code,
            quantity: 1,
          })),
        }))
        .filter((r) => r.comboItemList.length > 0)
    : undefined;
  const modification: ModificationSelection | undefined = modChanged
    ? {
        values: detail.modification.flatMap((g, gi) =>
          g.values.map((v) => {
            const on = mods[modKey(gi, v.code)] ?? false;
            return {
              code: v.code,
              quantity: on ? Math.max(1, v.selectedQuantity) : 0,
              key: on ? v.selectedKey : v.unselectedKey,
            };
          }),
        ),
      }
    : undefined;

  const roundLabels = detail.rounds
    .map((r) =>
      (picked[roundKey(r)] ?? [])
        .map((code) => r.choices.find((c) => c.code === code)?.name ?? code)
        .join("+"),
    )
    .filter(Boolean);
  const modLabels = detail.modification.flatMap((g, gi) =>
    g.values
      .filter(
        (v) => (mods[modKey(gi, v.code)] ?? false) !== v.selectedQuantity > 0,
      )
      .map((v) => `${mods[modKey(gi, v.code)] ? "加" : "去"}${v.name}`),
  );
  const extraPrice =
    detail.rounds.reduce(
      (sum, r) =>
        sum +
        (picked[roundKey(r)] ?? []).reduce(
          (s, code) => s + (r.choices.find((c) => c.code === code)?.price ?? 0),
          0,
        ),
      0,
    ) +
    detail.modification.reduce(
      (sum, g, gi) =>
        sum +
        g.values.reduce(
          (s, v) =>
            s + ((mods[modKey(gi, v.code)] ?? false) ? (v.price ?? 0) : 0),
          0,
        ),
      0,
    );
  return {
    roundList,
    modification,
    label: [...roundLabels, ...modLabels].join(" · "),
    signature: JSON.stringify({ roundList, modification }),
    extraPrice,
  };
}

function MealDetailModal({
  app,
  ctx,
  item,
  imageByCode,
  onClose,
  onAdd,
}: {
  app: App;
  ctx: MenuContext;
  item: MenuItem;
  imageByCode: Record<string, string>;
  onClose: () => void;
  onAdd: (selection?: CartSelection) => void;
}) {
  const [detail, setDetail] = useState<MealDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [picked, setPicked] = useState<Picked>({});
  const [mods, setMods] = useState<Mods>({});

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    api
      .queryMealDetail(app, ctx, item.code)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setPicked(defaultPicked(d));
        setMods(defaultMods(d));
      })
      .catch((e) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [app, ctx, item.code]);

  const toggleChoice = (r: MealRound, code: string) =>
    setPicked((prev) => {
      const key = roundKey(r);
      const cur = prev[key] ?? [];
      if (r.max <= 1) return { ...prev, [key]: [code] };
      if (cur.includes(code))
        return { ...prev, [key]: cur.filter((c) => c !== code) };
      if (cur.length >= r.max) return prev;
      return { ...prev, [key]: [...cur, code] };
    });

  const toggleMod = (gi: number, code: string, group: MealModificationGroup) =>
    setMods((prev) => {
      const key = modKey(gi, code);
      const on = prev[key] ?? false;
      if (
        !on &&
        group.values.filter((v) => prev[modKey(gi, v.code)]).length >= group.max
      )
        return prev;
      return { ...prev, [key]: !on };
    });

  const missing = detail
    ? detail.rounds.filter(
        (r) =>
          (picked[roundKey(r)] ?? []).length <
          Math.min(r.min, r.choices.length),
      )
    : [];
  const selection = detail ? buildSelection(detail, picked, mods) : undefined;
  const basePrice = priceNum(detail?.price ?? item.currentPrice);
  const total = basePrice + (selection?.extraPrice ?? 0);

  return (
    <Modal label={item.name} onClose={onClose}>
      <div className="modal-head">
        <MealImage
          src={detail?.image ?? item.image}
          name={item.name}
          size={72}
        />
        <div>
          <h3>{item.name}</h3>
          <div className="meal-price">
            <span className="price">
              {yuan(detail?.price ?? item.currentPrice)}
            </span>
            {item.originalPrice && item.originalPrice !== item.currentPrice && (
              <span className="price-orig">{yuan(item.originalPrice)}</span>
            )}
          </div>
        </div>
        <button
          className="btn ghost small close"
          onClick={onClose}
          aria-label="关闭"
        >
          ✕
        </button>
      </div>
      <div className="modal-body">
        {!detail && !error && <Spinner label="加载详情…" />}
        <ErrorBox error={error} compact />
        {detail && detail.rounds.length > 0 && (
          <section>
            <h4>套餐搭配</h4>
            {detail.rounds.map((r) => {
              const cur = picked[roundKey(r)] ?? [];
              return (
                <div key={roundKey(r)} className="round">
                  <div className="round-title muted small">
                    {r.name}
                    <span>
                      {" "}
                      · {r.max > 1 ? `最多选 ${r.max} 项` : "选 1 项"}
                    </span>
                  </div>
                  <div
                    className={`choice-list selectable${roundHasImages(r, imageByCode) ? " with-image" : ""}`}
                    role={r.max > 1 ? "group" : "radiogroup"}
                    aria-label={r.name}
                  >
                    {r.choices.map((c) => {
                      const on = cur.includes(c.code);
                      const withImage = roundHasImages(r, imageByCode);
                      const image = c.image ?? imageByCode[c.code];
                      return (
                        <button
                          key={c.code}
                          type="button"
                          className={`chip${on ? " on" : ""}${withImage ? " card" : ""}`}
                          role={r.max > 1 ? "checkbox" : "radio"}
                          aria-checked={on}
                          onClick={() => toggleChoice(r, c.code)}
                        >
                          {withImage && (
                            <MealImage src={image} name={c.name} size={56} />
                          )}
                          <span className="chip-text">
                            <span className="chip-name">{c.name}</span>
                            {c.price ? (
                              <span className="chip-extra">+¥{c.price}</span>
                            ) : null}
                          </span>
                          {on && (
                            <span className="chip-check" aria-hidden>
                              ✓
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>
        )}
        {detail && detail.modification.length > 0 && (
          <section>
            <h4>配料 / 特调</h4>
            {detail.modification.map((g, gi) => (
              <div key={gi} className="round">
                {g.max > 1 && (
                  <div className="round-title muted small">最多 {g.max} 项</div>
                )}
                <div className="choice-list selectable" role="group">
                  {g.values.map((v) => {
                    const on = mods[modKey(gi, v.code)] ?? false;
                    return (
                      <button
                        key={v.code}
                        type="button"
                        className={`chip${on ? " on" : ""}${v.image ? " card" : ""}`}
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => toggleMod(gi, v.code, g)}
                      >
                        {v.image && (
                          <MealImage src={v.image} name={v.name} size={48} />
                        )}
                        <span className="chip-text">
                          <span className="chip-name">{v.name}</span>
                          {v.price ? (
                            <span className="chip-extra">+¥{v.price}</span>
                          ) : null}
                        </span>
                        {on && (
                          <span className="chip-check" aria-hidden>
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        )}
        {detail &&
          detail.rounds.length === 0 &&
          detail.modification.length === 0 && (
            <p className="muted">单品，无可选搭配。</p>
          )}
        {missing.length > 0 && (
          <div className="warn-text">
            请先选择：{missing.map((r) => r.name).join("、")}
          </div>
        )}
      </div>
      <div className="modal-foot">
        <div className="modal-total">
          <strong className="price">{yuan(total)}</strong>
          {selection && selection.extraPrice > 0 && (
            <span className="muted small">
              {" "}
              含换品加价 ¥{selection.extraPrice}
            </span>
          )}
          {selection && <div className="muted small">{selection.label}</div>}
        </div>
        <button
          className="btn primary"
          disabled={!detail || missing.length > 0}
          onClick={() => onAdd(selection)}
        >
          加入购物车
        </button>
      </div>
    </Modal>
  );
}

// ---------- 购物车抽屉 ----------

export function CartDrawer({
  cart,
  dispatch,
  onClose,
  onCheckout,
}: {
  cart: CartLine[];
  dispatch: Dispatch<CartAction>;
  onClose: () => void;
  onCheckout: () => void;
}) {
  return (
    <Modal label="购物车" className="drawer" onClose={onClose}>
      <div className="drawer-head">
        <h3>购物车</h3>
        <div className="btn-row">
          <button
            className="btn ghost small"
            onClick={() => dispatch({ type: "clear" })}
            disabled={cart.length === 0}
          >
            清空
          </button>
          <button
            className="btn ghost small"
            onClick={onClose}
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
      </div>
      {cart.length === 0 ? (
        <Empty>购物车是空的</Empty>
      ) : (
        <CartLines cart={cart} dispatch={dispatch} />
      )}
      <div className="drawer-foot">
        <span>
          预估 <strong>{yuan(cartSubtotal(cart))}</strong>
        </span>
        <button
          className="btn primary"
          disabled={cart.length === 0}
          onClick={onCheckout}
        >
          去结算
        </button>
      </div>
    </Modal>
  );
}

export function CartLines({
  cart,
  dispatch,
}: {
  cart: CartLine[];
  dispatch: Dispatch<CartAction>;
}) {
  return (
    <ul className="cart-lines">
      {cart.map((l) => (
        <li key={l.key} className="cart-line">
          <MealImage src={l.image} name={l.name} size={36} />
          <div className="cart-line-info">
            <div className="cart-line-heading">
              <div className="cart-line-name">{l.name}</div>
              <button
                className="btn ghost icon-btn"
                onClick={() => dispatch({ type: "remove", key: l.key })}
                aria-label={`移除 ${l.name}`}
                title={`移除 ${l.name}`}
              >
                <Icon name="close" size={12} />
              </button>
            </div>
            {l.selection && (
              <div className="muted small selection-label">
                {l.selection.label}
              </div>
            )}
            <div className="cart-line-controls">
              <div className="muted small">
                {yuan(priceNum(l.unitPrice) + (l.selection?.extraPrice ?? 0))}
                {l.couponTitle && (
                  <span className="coupon-tag"> · {l.couponTitle}</span>
                )}
              </div>
              <Stepper
                value={l.quantity}
                onInc={() => dispatch({ type: "inc", key: l.key })}
                onDec={() => dispatch({ type: "dec", key: l.key })}
                disableInc={!!l.couponId}
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
