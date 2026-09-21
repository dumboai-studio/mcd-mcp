/**
 * 本地模拟数据（MCD_MOCK=1 时启用），不访问麦当劳官方接口。
 * 用于在没有 Token 的情况下调试 UI 全流程；数据结构与官方文档示例保持一致。
 */
import { McdError } from "./mcd-client.js";

type Obj = Record<string, unknown>;

const STORES = [
  {
    storeCode: "MOCK0001",
    beCode: "BE0001",
    storeName: "麦当劳北京中关村餐厅",
    address: "北京市海淀区中关村大街 1 号",
    distance: "350m",
    reservation: true,
    reservationTimeOptions: [
      { date: "2026-09-16", today: true, reservationOptionText: "午餐(10:30至15:29)，下午茶(15:30至17:59)，夜市(18:00至23:59)" },
      { date: "2026-09-17", today: false, reservationOptionText: "早餐(06:00至10:29)，午餐(10:30至15:29)" },
    ],
    businessStatus: true,
    businessStartTime: "06:00",
    businessEndTime: "23:59",
  },
  {
    storeCode: "MOCK0002",
    beCode: "BE0001",
    storeName: "麦当劳北京五道口餐厅",
    address: "北京市海淀区成府路 28 号",
    distance: "1.2km",
    reservation: false,
    reservationTimeOptions: [],
    businessStatus: true,
    businessStartTime: "00:00",
    businessEndTime: "23:59",
  },
  {
    storeCode: "MOCK0003",
    beCode: "BE0001",
    storeName: "麦当劳北京苏州街餐厅（得来速）",
    address: "北京市海淀区苏州街 3 号",
    distance: "2.8km",
    reservation: false,
    reservationTimeOptions: [],
    businessStatus: false,
    businessStartTime: "07:00",
    businessEndTime: "22:00",
  },
];

const ADDRESSES: Obj[] = [
  { addressId: "A1001", contactName: "张三", phone: "152****6666", fullAddress: "北京市海淀区中关村软件园 二期 A 座 5 层" },
  { addressId: "A1002", contactName: "李四", phone: "138****8888", fullAddress: "北京市朝阳区望京 SOHO T1 12 层" },
];

interface MockMeal {
  name: string;
  currentPrice: string;
  originalPrice?: string;
  discountType?: string | null;
  tags?: string[];
  combo?: string[];
}

const MEALS: Record<string, MockMeal> = {
  "9900001001": { name: "巨无霸中套餐", currentPrice: "42", originalPrice: "45", discountType: "促销优惠", combo: ["巨无霸", "中薯条", "可口可乐(中)"] },
  "9900001002": { name: "麦辣鸡腿堡中套餐", currentPrice: "39.5", originalPrice: "44", discountType: "促销优惠", tags: ["人气"], combo: ["麦辣鸡腿堡", "中薯条", "可口可乐(中)"] },
  "9900001003": { name: "板烧鸡腿堡中套餐", currentPrice: "40", originalPrice: "40", discountType: null, combo: ["板烧鸡腿堡", "中薯条", "可口可乐(中)"] },
  "500001": { name: "巨无霸", currentPrice: "27", originalPrice: "27", discountType: null },
  "500002": { name: "麦辣鸡腿堡", currentPrice: "22.5", originalPrice: "22.5", discountType: null, tags: ["招牌"] },
  "500101": { name: "板烧鸡腿堡", currentPrice: "22", originalPrice: "22", discountType: null },
  "500003": { name: "双层吉士汉堡", currentPrice: "20", originalPrice: "20", discountType: null, tags: ["第二份半价"] },
  "500004": { name: "麦香鱼", currentPrice: "18", originalPrice: "18", discountType: null },
  "600001": { name: "中薯条", currentPrice: "13", originalPrice: "13", discountType: null },
  "600002": { name: "麦乐鸡（5 块）", currentPrice: "16", originalPrice: "18", discountType: "麦金卡优惠" },
  "600003": { name: "麦辣鸡翅（2 块）", currentPrice: "14", originalPrice: "14", discountType: null },
  "600004": { name: "玉米杯", currentPrice: "9", originalPrice: "9", discountType: null },
  "700001": { name: "可口可乐（中杯）", currentPrice: "9.5", originalPrice: "9.5", discountType: null },
  "700002": { name: "鲜煮咖啡", currentPrice: "12", originalPrice: "12", discountType: null },
  "700003": { name: "香草奶昔", currentPrice: "15", originalPrice: "15", discountType: null },
  "800001": { name: "圆筒冰淇淋", currentPrice: "7", originalPrice: "7", discountType: null },
  "800002": { name: "麦旋风（奥利奥）", currentPrice: "13.5", originalPrice: "13.5", discountType: null, tags: ["新品"] },
  "800003": { name: "香芋派", currentPrice: "8", originalPrice: "8", discountType: null },
};

const CATEGORIES: { name: string; daypart: number; codes: string[] }[] = [
  { name: "人气热卖", daypart: 8, codes: ["9900001001", "9900001002", "9900001003", "500002"] },
  { name: "汉堡", daypart: 8, codes: ["500001", "500002", "500101", "500003", "500004"] },
  { name: "小食", daypart: 8, codes: ["600001", "600002", "600003", "600004"] },
  { name: "饮品", daypart: 8, codes: ["700001", "700002", "700003"] },
  { name: "甜品", daypart: 8, codes: ["800001", "800002", "800003"] },
];

const COUPONS: Obj[] = [
  {
    title: "巨无霸中套餐立减 5 元",
    couponId: "CP1001",
    couponCode: "MC5OFF",
    tradeDateTime: "2026-09-01 00:00:00-2026-12-31 23:59:59",
    products: [{ productCode: "9900001001", productName: "巨无霸中套餐" }],
  },
  {
    title: "圆筒冰淇淋免费券",
    couponId: "CP1002",
    couponCode: "ICEFREE",
    tradeDateTime: "2026-09-01 00:00:00-2026-10-31 23:59:59",
    products: [{ productCode: "800001", productName: "圆筒冰淇淋" }],
  },
  {
    title: "全场满 50 减 8",
    couponId: "CP1003",
    couponCode: "ALL8",
    tradeDateTime: "2026-09-01 00:00:00-2026-12-31 23:59:59",
    products: [],
  },
];

const FOOD_EMOJI: [RegExp, string][] = [[/套餐/, "🍔"], [/堡|巨无霸|吉士/, "🍔"], [/薯/, "🍟"], [/鸡/, "🍗"], [/咖啡/, "☕"], [/可乐|奶昔/, "🥤"], [/冰淇淋|麦旋风/, "🍦"], [/派/, "🥧"], [/玉米/, "🌽"], [/鱼/, "🐟"]];
/** 模拟图片：内联 SVG（data: URI），宿主 CSP 允许 data: 图片 */
const svgImage = (name: string): string => {
  const emoji = FOOD_EMOJI.find(([re]) => re.test(name))?.[1] ?? "🍽️";
  const hue = (Array.from(name).reduce((h, ch) => h + ch.charCodeAt(0), 0) * 37) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" rx="28" fill="hsl(${hue} 70% 88%)"/><text x="100" y="132" font-size="88" text-anchor="middle" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">${emoji}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
};

const fen = (yuan: string | number): number => Math.round(Number(yuan) * 100);
const yuan = (f: number): string => (f / 100).toFixed(2).replace(/\.?0+$/, "");

interface Item {
  productCode: string;
  quantity: number;
  couponId?: string;
  couponCode?: string;
  roundList?: { round: string | number; comboItemList: { code: string; quantity: number }[] }[];
}

/** 套餐分区可选项（模拟）：主食 / 小食 / 饮品，部分换品加价（分） */
const COMBO_ROUNDS = [
  { round: 1, name: "主食", codes: ["500001", "500002", "500101", "500003"] },
  { round: 2, name: "小食", codes: ["600001", "600002", "600004"] },
  { round: 3, name: "饮品", codes: ["700001", "700003", "700002"] },
];
const COMBO_EXTRA: Record<string, number> = { "500003": 200, "600002": 300, "700003": 500, "700002": 300 };
const comboDefault = (meal: MockMeal, round: (typeof COMBO_ROUNDS)[number]) =>
  round.codes.find((code) => meal.combo?.some((name) => MEALS[code].name.startsWith(name.replace(/\(.*$/, "")))) ?? round.codes[0];
const comboExtraFen = (roundList: Item["roundList"]) =>
  (roundList ?? []).reduce((sum, r) => sum + r.comboItemList.reduce((s, c) => s + (COMBO_EXTRA[c.code] ?? 0) * c.quantity, 0), 0);

function readItems(args: Obj): Item[] {
  const items = Array.isArray(args.items) ? (args.items as Obj[]) : [];
  if (items.length === 0) throw new McdError("items 不能为空", 400);
  return items.map((it) => {
    const productCode = String(it.productCode ?? "");
    if (!MEALS[productCode]) throw new McdError(`餐品 ${productCode} 不存在或已售罄`, 400);
    return {
      productCode,
      quantity: Math.max(1, Number(it.quantity ?? 1)),
      couponId: it.couponId ? String(it.couponId) : undefined,
      couponCode: it.couponCode ? String(it.couponCode) : undefined,
      roundList: Array.isArray(it.roundList) ? (it.roundList as Item["roundList"]) : undefined,
    };
  });
}

function priceItems(items: Item[], beType: number, needTableware: boolean) {
  let productOriginalPrice = 0;
  let discount = 0;
  const productList = items.map((it) => {
    const meal = MEALS[it.productCode];
    const originalSubtotal = (fen(meal.currentPrice) + comboExtraFen(it.roundList)) * it.quantity;
    let subtotal = originalSubtotal;
    if (it.couponId === "CP1001" && it.productCode === "9900001001") subtotal -= 500;
    if (it.couponId === "CP1002" && it.productCode === "800001") subtotal -= fen(meal.currentPrice);
    productOriginalPrice += originalSubtotal;
    discount += originalSubtotal - subtotal;
    return { productCode: it.productCode, productName: meal.name, quantity: it.quantity, originalSubtotal, subtotal };
  });
  if (items.some((it) => it.couponId === "CP1003") && productOriginalPrice >= 5000) discount += 800;
  const productPrice = productOriginalPrice - discount;
  const deliveryOriginalPrice = beType === 2 || beType === 6 ? 900 : 0;
  const deliveryPrice = deliveryOriginalPrice > 0 && productOriginalPrice >= 8000 ? 0 : deliveryOriginalPrice;
  const tablewarePrice = needTableware ? 100 : 0;
  const originalPrice = productOriginalPrice + deliveryOriginalPrice + tablewarePrice;
  const price = productPrice + deliveryPrice + tablewarePrice;
  return { productOriginalPrice, productPrice, deliveryOriginalPrice, deliveryPrice, originalPrice, discount, price, productList, tablewarePrice };
}

const TAKE_WAYS: Record<number, Obj[]> = {
  1: [
    { takeWayCode: "counter", takeWayName: "柜台取餐" },
    { takeWayCode: "locker-in", takeWayName: "店内取餐柜" },
  ],
  5: [{ takeWayCode: "drive-thru", takeWayName: "得来速车道取餐" }],
};

interface MockOrder {
  createdAt: number;
  cancelled: boolean;
  beType: number;
  detail: Obj;
}
const ORDERS = new Map<string, MockOrder>();

function statusOf(order: MockOrder): string {
  if (order.cancelled) return "订单已取消";
  const elapsed = (Date.now() - order.createdAt) / 1000;
  const delivery = order.beType === 2 || order.beType === 6;
  if (elapsed < 25) return "待支付";
  if (elapsed < 70) return "制作中";
  if (elapsed < 130) return delivery ? "配送中" : "待取餐";
  return "已完成";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function mockCall(tool: string, args: Obj): Promise<unknown> {
  await sleep(250 + Math.random() * 350); // 模拟网络延迟
  switch (tool) {
    case "now-time-info": {
      const now = new Date();
      return { timestamp: now.getTime(), formatted: now.toISOString(), date: now.toISOString().slice(0, 10), timezone: "Asia/Shanghai" };
    }
    case "delivery-query-addresses":
      return { addresses: ADDRESSES };
    case "delivery-create-address": {
      for (const k of ["city", "contactName", "phone", "address", "addressDetail"]) {
        if (!args[k]) throw new McdError(`${k} 必填`, 400);
      }
      const phone = String(args.phone);
      if (!/^\d{11}$/.test(phone)) throw new McdError("phone 必须是 11 位纯数字", 400);
      const addr = {
        addressId: `A${1000 + ADDRESSES.length + 1}`,
        contactName: String(args.contactName),
        phone: phone.slice(0, 3) + "****" + phone.slice(7),
        fullAddress: `${args.city}${args.address} ${args.addressDetail}`,
      };
      ADDRESSES.push(addr);
      return addr;
    }
    case "delivery-query-stores": {
      if (!args.addressId) throw new McdError("addressId 必填", 400);
      if (!ADDRESSES.some((a) => a.addressId === String(args.addressId))) throw new McdError("地址不存在", 400);
      return STORES.slice(0, 2).map(({ address: _a, distance: _d, ...s }) => s);
    }
    case "query-nearby-stores": {
      const searchType = Number(args.searchType ?? 1);
      if (searchType === 2 && (!args.city || !args.keyword)) throw new McdError("searchType=2 时 city 与 keyword 必填", 400);
      if (Number(args.beType) === 5) return [STORES[2], STORES[0]];
      return searchType === 1 ? [STORES[0]] : STORES;
    }
    case "query-meals": {
      if (!args.storeCode) throw new McdError("storeCode 必填", 400);
      const meals: Obj = {};
      for (const [code, m] of Object.entries(MEALS)) {
        meals[code] = { name: m.name, currentPrice: m.currentPrice, originalPrice: m.originalPrice, discountType: m.discountType ?? null, isCanWithOrder: false, image: svgImage(m.name) };
      }
      return {
        frequent: [{ code: "500001", tags: ["我的常点"] }],
        categories: CATEGORIES.map((c) => ({ name: c.name, daypart: c.daypart, meals: c.codes.map((code) => ({ code, tags: MEALS[code].tags ?? [] })) })),
        meals,
      };
    }
    case "query-meal-detail": {
      const code = String(args.code ?? "");
      const meal = MEALS[code];
      if (!meal) throw new McdError("餐品不存在", 400);
      return {
        code,
        name: meal.name,
        price: meal.currentPrice,
        image: svgImage(meal.name),
        rounds: meal.combo
          ? COMBO_ROUNDS.map((r) => ({
              round: r.round,
              name: r.name,
              minValues: 1,
              maxValues: 1,
              choices: r.codes.map((c) => ({ code: c, name: MEALS[c].name, price: (COMBO_EXTRA[c] ?? 0) / 100, selected: c === comboDefault(meal, r) })),
            }))
          : [],
        modification: { items: [{ maxValues: 2, minValues: 0, values: [{ code: "100160", price: 0, name: "番茄片", maxQuantity: 1, minQuantity: 0, selectedQuantity: 1 }, { code: "101125", price: 0, name: "生菜", maxQuantity: 1, minQuantity: 0, selectedQuantity: 1 }] }] },
        supportModify: true,
      };
    }
    case "query-store-coupons":
      if (!args.storeCode) throw new McdError("storeCode 必填", 400);
      return COUPONS;
    case "calculate-price": {
      const items = readItems(args);
      const beType = Number(args.beType ?? 1);
      const priced = priceItems(items, beType, Boolean(args.needTableware));
      return { ...priced, takeWayList: TAKE_WAYS[beType] ?? [], mealAssistanceList: [] };
    }
    case "create-order": {
      const items = readItems(args);
      const beType = Number(args.beType ?? 1);
      const delivery = beType === 2 || beType === 6;
      if (delivery && !args.addressId) throw new McdError("外送场景下 addressId 必填", 400);
      if (!delivery && !args.takeWayCode) throw new McdError("到店场景下 takeWayCode 必填，请先通过 calculate-price 获取 takeWayList", 400);
      const priced = priceItems(items, beType, Boolean(args.needTableware));
      const orderId = `1030${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const store = STORES.find((s) => s.storeCode === String(args.storeCode)) ?? STORES[0];
      const address = ADDRESSES.find((a) => a.addressId === String(args.addressId));
      const detail: Obj = {
        storeName: store.storeName,
        storeAddress: store.address,
        orderProductList: priced.productList.map((p, i) => ({
          productName: p.productName,
          quantity: p.quantity,
          price: yuan(p.subtotal),
          comboItemList: items[i]?.roundList?.length
            ? items[i].roundList!.flatMap((r) => r.comboItemList.map((c) => ({ itemName: MEALS[c.code]?.name ?? c.code, itemQuantity: c.quantity })))
            : (MEALS[p.productCode].combo ?? []).map((n) => ({ itemName: n, itemQuantity: 1 })),
        })),
        totalAmount: yuan(priced.originalPrice),
        realTotalAmount: yuan(priced.price),
        totalDiscountAmount: yuan(priced.discount),
        couponList: items.filter((i) => i.couponId).map((i) => ({ couponId: i.couponId, couponCode: i.couponCode })),
        deliveryInfo: delivery
          ? { deliveryType: "立即送出", deliveryAddress: address?.fullAddress, addressDetail: "", customerNickname: address?.contactName, mobilePhone: address?.phone, expectDeliveryTime: "" }
          : undefined,
        createTime: new Date().toISOString().replace("T", " ").slice(0, 19),
        deliveryPrice: yuan(priced.deliveryOriginalPrice),
        realDeliveryPrice: yuan(priced.deliveryPrice),
        productPrice: yuan(priced.productPrice),
        takeWay: delivery ? undefined : String(args.takeWayCode),
        pickupCode: "",
        lockerCode: "",
        lockerQrCode: "",
        remark: args.remark ? String(args.remark) : "",
      };
      ORDERS.set(orderId, { createdAt: Date.now(), cancelled: false, beType, detail });
      return {
        orderId,
        payId: `PAY${Date.now()}`,
        payH5Url: `https://m.mcd.cn/mcp/scanToPay?orderId=${orderId}`,
        orderDetail: { orderStatus: "待支付", ...detail },
      };
    }
    case "query-order": {
      const orderId = String(args.orderId ?? "");
      const order = ORDERS.get(orderId);
      if (!order) throw new McdError("订单不存在（模拟模式仅保留本次进程内创建的订单）", 404);
      const status = statusOf(order);
      const ready = status === "待取餐" || status === "已完成";
      return {
        orderId,
        orderStatus: status,
        ...order.detail,
        pickupCode: status === "待支付" || order.cancelled ? "" : orderId.slice(-4),
        lockerCode: ready && order.detail.takeWay === "locker-in" ? "8523" : "",
      };
    }
    case "cancel-order": {
      const orderId = String(args.orderId ?? "");
      const order = ORDERS.get(orderId);
      if (!order) throw new McdError("订单不存在", 404);
      if (statusOf(order) !== "待支付") throw new McdError("当前订单状态不允许取消", 400);
      order.cancelled = true;
      return { cancelResult: true, orderId };
    }
    default:
      throw new McdError(`模拟模式不支持工具 ${tool}`, 404);
  }
}
