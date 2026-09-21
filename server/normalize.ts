/**
 * 把麦当劳官方返回的 data 归一化成 shared/types.ts 中的结构。
 * 所有取值都做了宽松处理：字段缺失不会抛错，只会得到空值。
 * 字段名依据 https://open.mcd.cn/mcp/doc 的示例；如官方结构调整，只需改这里。
 */
import type {
  Address,
  Coupon,
  MealDetail,
  MealModificationGroup,
  MealRound,
  Menu,
  MenuCategory,
  MenuItem,
  OrderInfo,
  PriceQuote,
  Store,
  TakeWay,
} from "../shared/types.js";

type Obj = Record<string, unknown>;

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asObj = (v: unknown): Obj =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
const str = (v: unknown, fallback = ""): string => (v == null ? fallback : String(v));
const optStr = (v: unknown): string | undefined => (v == null || v === "" ? undefined : String(v));
const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const optNum = (v: unknown): number | undefined => (v == null || v === "" ? undefined : num(v));
const bool = (v: unknown): boolean | undefined =>
  typeof v === "boolean" ? v : v == null ? undefined : String(v) === "true";

function listOf(raw: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(raw)) return raw;
  const o = asObj(raw);
  for (const k of keys) if (Array.isArray(o[k])) return o[k] as unknown[];
  return [];
}

export function normalizeStores(raw: unknown): Store[] {
  return listOf(raw, "stores", "list", "storeList")
    .map(asObj)
    .filter((s) => s.storeCode != null)
    .map((s) => ({
      storeCode: str(s.storeCode),
      beCode: str(s.beCode),
      storeName: str(s.storeName ?? s.name, "麦当劳餐厅"),
      address: optStr(s.address ?? s.storeAddress),
      distance: optStr(s.distance),
      reservation: bool(s.reservation),
      reservationTimeOptions: asArray(s.reservationTimeOptions)
        .map(asObj)
        .map((o) => ({ date: str(o.date), today: bool(o.today), text: optStr(o.reservationOptionText) })),
      businessStatus: bool(s.businessStatus),
      businessStartTime: optStr(s.businessStartTime),
      businessEndTime: optStr(s.businessEndTime),
    }));
}

export function normalizeAddress(raw: unknown): Address {
  const a = asObj(raw);
  return {
    addressId: str(a.addressId ?? a.id),
    contactName: optStr(a.contactName),
    phone: optStr(a.phone),
    fullAddress: optStr(a.fullAddress ?? a.address),
  };
}

export function normalizeAddresses(raw: unknown): Address[] {
  return listOf(raw, "addresses", "list", "addressList")
    .map(normalizeAddress)
    .filter((a) => a.addressId);
}

export function normalizeMenu(raw: unknown): Menu {
  const o = asObj(raw);
  const meals = asObj(o.meals);

  const toItem = (entry: unknown): MenuItem | null => {
    const e = asObj(entry);
    const code = str(e.code ?? e.productCode);
    if (!code) return null;
    const m: Obj = { ...asObj(meals[code]) };
    for (const k of ["name", "currentPrice", "price", "image", "originalPrice", "discountType"]) {
      if (e[k] != null && e[k] !== "") m[k] = e[k];
    }
    return {
      code,
      name: str(m.name, code),
      currentPrice: str(m.currentPrice ?? m.price),
      originalPrice: optStr(m.originalPrice),
      image: optStr(m.image),
      discountType: m.discountType == null ? null : str(m.discountType),
      tags: asArray(e.tags ?? m.tags).map((t) => str(t)).filter(Boolean),
      isCanWithOrder: bool(m.isCanWithOrder),
      withOrder: m.withOrder ? asObj(m.withOrder) : undefined,
    };
  };
  const items = (list: unknown): MenuItem[] =>
    asArray(list).map(toItem).filter((x): x is MenuItem => x !== null);

  const categories: MenuCategory[] = asArray(o.categories)
    .map(asObj)
    .map((c) => ({
      name: str(c.name ?? c.categoryName, "未分类"),
      daypart: optNum(c.daypart),
      items: items(c.meals ?? c.products ?? c.items),
    }))
    .filter((c) => c.items.length > 0);

  if (categories.length === 0 && Object.keys(meals).length > 0) {
    categories.push({
      name: "全部餐品",
      items: items(Object.keys(meals).map((code) => ({ code }))),
    });
  }

  const frequent = items(o.frequent);
  const codes = new Set<string>();
  for (const c of categories) for (const it of c.items) codes.add(it.code);
  return { categories, frequent, itemCount: codes.size };
}

function normalizeRounds(raw: unknown): MealRound[] {
  return asArray(raw)
    .map(asObj)
    .map((r, i) => {
      const choices = asArray(r.choices ?? r.items ?? r.comboItemList ?? r.products ?? r.values)
        .map(asObj)
        .map((c) => ({
          code: str(c.code ?? c.productCode),
          name: str(c.name ?? c.productName ?? c.itemName, str(c.code ?? c.productCode)),
          price: optNum(c.price ?? c.addPrice ?? c.extraPrice),
          selected: Boolean(c.selected ?? c.isDefault ?? c.default ?? c.checked ?? num(c.selectedQuantity) > 0),
          image: optStr(c.image ?? c.imageUrl ?? c.img ?? c.picture ?? c.pic),
        }))
        .filter((c) => c.code);
      const rawId = r.round ?? r.roundId ?? r.id ?? i + 1;
      return {
        id: typeof rawId === "number" ? rawId : str(rawId),
        name: str(r.name ?? r.title ?? r.roundName, `第 ${i + 1} 项`),
        min: num(r.minValues ?? r.min ?? r.minQuantity, 1),
        max: Math.max(1, num(r.maxValues ?? r.max ?? r.maxQuantity, 1)),
        choices,
      };
    })
    .filter((r) => r.choices.length > 0);
}

function normalizeModification(raw: unknown): MealModificationGroup[] {
  return asArray(asObj(raw).items)
    .map(asObj)
    .map((g) => ({
      min: num(g.minValues ?? g.min, 0),
      max: Math.max(1, num(g.maxValues ?? g.max, 1)),
      values: asArray(g.values)
        .map(asObj)
        .map((v) => ({
          code: str(v.code),
          name: str(v.name, str(v.code)),
          price: optNum(v.price),
          image: optStr(v.image ?? v.imageUrl ?? v.img ?? v.picture ?? v.pic),
          selectedQuantity: num(v.selectedQuantity, 0),
          minQuantity: num(v.minQuantity, 0),
          maxQuantity: Math.max(1, num(v.maxQuantity, 1)),
          selectedKey: optStr(v.selectedKey),
          unselectedKey: optStr(v.unselectedKey),
        }))
        .filter((v) => v.code),
    }))
    .filter((g) => g.values.length > 0);
}

export function normalizeMealDetail(raw: unknown): MealDetail {
  const d = asObj(raw);
  return {
    code: str(d.code ?? d.productCode),
    name: str(d.name ?? d.productName),
    price: optStr(d.price ?? d.currentPrice),
    image: optStr(d.image),
    rounds: normalizeRounds(d.rounds),
    modification: normalizeModification(d.modification),
    supportModify: bool(d.supportModify),
    raw,
  };
}

export function normalizeCoupons(raw: unknown): Coupon[] {
  return listOf(raw, "coupons", "list", "couponList")
    .map(asObj)
    .filter((c) => c.couponId != null || c.couponCode != null)
    .map((c) => ({
      title: str(c.title ?? c.couponName ?? c.name, "优惠券"),
      couponId: str(c.couponId),
      couponCode: optStr(c.couponCode),
      tradeDateTime: optStr(c.tradeDateTime ?? c.validTime),
      products: asArray(c.products)
        .map(asObj)
        .map((p) => ({ productCode: str(p.productCode ?? p.code), productName: optStr(p.productName ?? p.name) }))
        .filter((p) => p.productCode),
    }));
}

function normalizeTakeWay(raw: unknown): TakeWay | null {
  if (typeof raw === "string") return { code: raw, name: raw, raw };
  const t = asObj(raw);
  const code = optStr(t.takeWayCode ?? t.code ?? t.value ?? t.id);
  if (!code) return null;
  const name = optStr(t.takeWayName ?? t.name ?? t.title ?? t.desc ?? t.label) ?? code;
  return { code, name, raw };
}

/** calculate-price：官方金额为「分」（无引号整数） */
export function normalizeQuote(raw: unknown): PriceQuote {
  const q = asObj(raw);
  return {
    productOriginalPrice: num(q.productOriginalPrice ?? q.productPrice),
    productPrice: num(q.productPrice),
    deliveryOriginalPrice: num(q.deliveryOriginalPrice ?? q.deliveryPrice),
    deliveryPrice: num(q.deliveryPrice),
    originalPrice: num(q.originalPrice ?? q.price),
    discount: num(q.discount),
    price: num(q.price),
    tablewarePrice: optNum(q.tablewarePrice),
    productList: asArray(q.productList)
      .map(asObj)
      .map((p) => ({
        productCode: optStr(p.productCode),
        productName: optStr(p.productName),
        quantity: optNum(p.quantity),
        originalSubtotal: optNum(p.originalSubtotal),
        subtotal: optNum(p.subtotal),
      })),
    takeWayList: asArray(q.takeWayList).map(normalizeTakeWay).filter((t): t is TakeWay => t !== null),
    mealAssistanceList: asArray(q.mealAssistanceList),
    raw,
  };
}

/** create-order（data.orderDetail + orderId/payH5Url）与 query-order（平铺）共用 */
export function normalizeOrder(raw: unknown): OrderInfo {
  const o = asObj(raw);
  const d: Obj = o.orderDetail ? asObj(o.orderDetail) : o;
  const di = d.deliveryInfo ? asObj(d.deliveryInfo) : undefined;
  return {
    orderId: str(o.orderId ?? d.orderId),
    payId: optStr(o.payId),
    payH5Url: optStr(o.payH5Url ?? d.payH5Url),
    orderStatus: str(d.orderStatus ?? o.orderStatus ?? d.status, "未知状态"),
    storeName: optStr(d.storeName),
    storeAddress: optStr(d.storeAddress),
    products: asArray(d.orderProductList ?? d.productList)
      .map(asObj)
      .map((p) => ({
        productName: str(p.productName ?? p.name),
        productImage: optStr(p.productImage ?? p.image),
        quantity: num(p.quantity, 1),
        price: optStr(p.price),
        comboItemList: asArray(p.comboItemList)
          .map(asObj)
          .map((c) => ({ itemName: str(c.itemName ?? c.name), itemQuantity: optNum(c.itemQuantity ?? c.quantity) })),
      })),
    totalAmount: optStr(d.totalAmount),
    realTotalAmount: optStr(d.realTotalAmount),
    totalDiscountAmount: optStr(d.totalDiscountAmount),
    couponList: asArray(d.couponList),
    deliveryInfo: di
      ? {
          deliveryType: optStr(di.deliveryType),
          deliveryAddress: optStr(di.deliveryAddress),
          addressDetail: optStr(di.addressDetail),
          customerNickname: optStr(di.customerNickname),
          mobilePhone: optStr(di.mobilePhone),
          expectDeliveryTime: optStr(di.expectDeliveryTime),
        }
      : undefined,
    createTime: optStr(d.createTime),
    deliveryPrice: optStr(d.deliveryPrice),
    realDeliveryPrice: optStr(d.realDeliveryPrice),
    productPrice: optStr(d.productPrice),
    takeWay: optStr(d.takeWay),
    pickupCode: optStr(d.pickupCode),
    lockerCode: optStr(d.lockerCode),
    lockerQrCode: optStr(d.lockerQrCode),
    remark: optStr(d.remark),
    raw,
  };
}
