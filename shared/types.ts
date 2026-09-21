/**
 * 服务端与 UI 共用的类型定义。
 * 服务端把麦当劳官方 MCP 的返回归一化成这些结构，UI 只依赖这里的字段。
 */

/** 业务类型：1 到店自取，2 麦乐送，5 得来速，6 企业团餐 */
export type BeType = 1 | 2 | 5 | 6;
/** 订单类型：1 到店，2 外送 */
export type OrderType = 1 | 2;
/** UI 中的点餐方式 */
export type OrderMode = "pickup" | "delivery" | "drive";

export const MODE_META: Record<
  OrderMode,
  { label: string; short: string; beType: BeType; orderType: OrderType; delivery: boolean }
> = {
  pickup: { label: "到店自取", short: "自取", beType: 1, orderType: 1, delivery: false },
  delivery: { label: "麦乐送外送", short: "外送", beType: 2, orderType: 2, delivery: true },
  drive: { label: "得来速车道取餐", short: "得来速", beType: 5, orderType: 1, delivery: false },
};

export function modeFromBeType(beType: number | string | undefined): OrderMode {
  switch (Number(beType)) {
    case 2:
    case 6:
      return "delivery";
    case 5:
      return "drive";
    default:
      return "pickup";
  }
}

export interface ReservationOption {
  date: string;
  today?: boolean;
  text?: string;
}

export interface Store {
  storeCode: string;
  beCode: string;
  storeName: string;
  address?: string;
  distance?: string;
  reservation?: boolean;
  reservationTimeOptions: ReservationOption[];
  businessStatus?: boolean;
  businessStartTime?: string;
  businessEndTime?: string;
}

export interface Address {
  addressId: string;
  contactName?: string;
  phone?: string;
  fullAddress?: string;
}

export interface MenuItem {
  code: string;
  name: string;
  /** 单位：元（字符串，官方原样返回） */
  currentPrice: string;
  originalPrice?: string;
  image?: string;
  discountType?: string | null;
  tags: string[];
  isCanWithOrder?: boolean;
  withOrder?: Record<string, unknown>;
}

export interface MenuCategory {
  name: string;
  daypart?: number;
  items: MenuItem[];
}

export interface Menu {
  categories: MenuCategory[];
  frequent: MenuItem[];
  itemCount: number;
}

export interface MealChoice {
  code: string;
  name: string;
  /** 换品加价（元） */
  price?: number;
  /** 官方默认搭配 */
  selected: boolean;
  image?: string;
}

/** 套餐的一个分区（如「主食」「饮品」或「蓝区」「粉区」） */
export interface MealRound {
  id: string | number;
  name: string;
  min: number;
  max: number;
  choices: MealChoice[];
}

export interface MealModificationValue {
  code: string;
  name: string;
  price?: number;
  image?: string;
  selectedQuantity: number;
  minQuantity: number;
  maxQuantity: number;
  selectedKey?: string;
  unselectedKey?: string;
}

/** 单品特调分组（如加/去配料） */
export interface MealModificationGroup {
  min: number;
  max: number;
  values: MealModificationValue[];
}

export interface MealDetail {
  code: string;
  name: string;
  price?: string;
  image?: string;
  rounds: MealRound[];
  modification: MealModificationGroup[];
  supportModify?: boolean;
  raw?: unknown;
}

/** items[].roundList[]：套餐某分区选中的单品 */
export interface RoundSelection {
  round: string | number;
  comboItemList: { code: string; quantity: number }[];
}

/** items[].modification：单品特调 */
export interface ModificationSelection {
  values: { code: string; quantity: number; key?: string }[];
}

export interface Coupon {
  title: string;
  couponId: string;
  couponCode?: string;
  tradeDateTime?: string;
  /** 适用餐品；为空表示官方未限定 */
  products: { productCode: string; productName?: string }[];
}

/** calculate-price / create-order 的 items[] 元素 */
export interface OrderItemInput {
  productCode: string;
  quantity: number;
  couponId?: string;
  couponCode?: string;
  roundList?: RoundSelection[];
  modification?: ModificationSelection;
}

export interface TakeWay {
  code: string;
  name: string;
  raw?: unknown;
}

export interface QuoteLine {
  productCode?: string;
  productName?: string;
  quantity?: number;
  originalSubtotal?: number;
  subtotal?: number;
}

/** calculate-price 归一化结果，金额单位：分 */
export interface PriceQuote {
  productOriginalPrice: number;
  productPrice: number;
  deliveryOriginalPrice: number;
  deliveryPrice: number;
  originalPrice: number;
  discount: number;
  price: number;
  tablewarePrice?: number;
  productList: QuoteLine[];
  takeWayList: TakeWay[];
  mealAssistanceList: unknown[];
  raw?: unknown;
}

export interface OrderProduct {
  productName: string;
  productImage?: string;
  quantity: number;
  price?: string;
  comboItemList: { itemName: string; itemQuantity?: number }[];
}

export interface DeliveryInfo {
  deliveryType?: string;
  deliveryAddress?: string;
  addressDetail?: string;
  customerNickname?: string;
  mobilePhone?: string;
  expectDeliveryTime?: string;
}

/** create-order / query-order 归一化结果，金额单位：元（字符串） */
export interface OrderInfo {
  orderId: string;
  payId?: string;
  payH5Url?: string;
  orderStatus: string;
  storeName?: string;
  storeAddress?: string;
  products: OrderProduct[];
  totalAmount?: string;
  realTotalAmount?: string;
  totalDiscountAmount?: string;
  couponList: unknown[];
  deliveryInfo?: DeliveryInfo;
  createTime?: string;
  deliveryPrice?: string;
  realDeliveryPrice?: string;
  productPrice?: string;
  takeWay?: string;
  pickupCode?: string;
  lockerCode?: string;
  lockerQrCode?: string;
  remark?: string;
  raw?: unknown;
}

/** 官方接口统一响应包裹 */
export interface McdEnvelope<T = unknown> {
  success?: boolean;
  code?: number | string;
  message?: string;
  datetime?: string;
  traceId?: string;
  data?: T;
}

/** 菜单 / 查券 / 计价 / 下单共用的门店上下文 */
export interface MenuContext {
  storeCode: string;
  beCode: string;
  orderType: OrderType;
  beType: BeType;
  reservationDate?: string;
}

/** 工具 structuredContent.view 的取值，UI 据此决定打开哪个页面 */
export type ToolView = "start" | "addresses" | "stores" | "menu" | "order";

export interface StartPayload {
  view: "start";
  presets: { mode?: OrderMode; city?: string; keyword?: string; orderId?: string };
  tokenConfigured: boolean;
  mock: boolean;
}

export interface ToolErrorPayload {
  error: { message: string; code?: string | number; traceId?: string };
}
