/**
 * UI → 服务端工具调用封装（通过宿主转发 app.callServerTool）。
 * 所有函数返回服务端 structuredContent 中归一化后的数据。
 */
import type { App } from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/client";
import type {
  Address,
  BeType,
  Coupon,
  OrderType,
  MealDetail,
  Menu,
  MenuContext,
  OrderInfo,
  OrderItemInput,
  PriceQuote,
  Store,
} from "../../shared/types.js";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string | number,
    public readonly traceId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function textOf(result: CallToolResult): string {
  return (result.content ?? [])
    .map((c) => (c.type === "text" ? c.text : ""))
    .filter(Boolean)
    .join("\n");
}

async function call<T extends Record<string, unknown>>(
  app: App,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  let result: CallToolResult;
  try {
    result = await app.callServerTool({ name, arguments: args });
  } catch (e) {
    throw new ApiError((e as Error)?.message || "调用失败，请重试");
  }
  const sc = (result.structuredContent ?? {}) as Record<string, unknown>;
  if (result.isError || sc.error) {
    const err = (sc.error ?? {}) as { message?: string; code?: string | number; traceId?: string };
    throw new ApiError(err.message || textOf(result) || "调用失败", err.code, err.traceId);
  }
  return sc as T;
}

export interface NearbyStoreQuery {
  searchType: 1 | 2 | 3;
  beType: BeType;
  city?: string;
  keyword?: string;
  longitude?: number;
  latitude?: number;
}

export interface CreateAddressInput {
  city: string;
  contactName: string;
  gender?: string;
  phone: string;
  address: string;
  addressDetail: string;
}

export interface CreateOrderInput {
  storeCode: string;
  beCode: string;
  beType: BeType;
  orderType: OrderType;
  items: OrderItemInput[];
  addressId?: string;
  takeWayCode?: string;
  reservationDate?: string;
  needTableware?: boolean;
  remark?: string;
}

export const api = {
  queryAddresses: (app: App) =>
    call<{ addresses?: Address[] }>(app, "delivery-query-addresses", {}).then((r) => r.addresses ?? []),

  createAddress: (app: App, input: CreateAddressInput) =>
    call<{ address: Address }>(app, "delivery-create-address", { ...input }).then((r) => r.address),

  queryDeliveryStores: (app: App, addressId: string, beType: BeType) =>
    call<{ stores?: Store[] }>(app, "delivery-query-stores", { addressId, beType }).then((r) => r.stores ?? []),

  queryNearbyStores: (app: App, query: NearbyStoreQuery) =>
    call<{ stores?: Store[] }>(app, "query-nearby-stores", { ...query }).then((r) => r.stores ?? []),

  queryMeals: (app: App, ctx: MenuContext) =>
    call<{ menu: Menu }>(app, "query-meals", { ...ctx }).then((r) => r.menu),

  queryMealDetail: (app: App, ctx: MenuContext, code: string) =>
    call<{ detail: MealDetail }>(app, "query-meal-detail", { code, ...ctx }).then((r) => r.detail),

  queryStoreCoupons: (app: App, ctx: MenuContext) =>
    call<{ coupons?: Coupon[] }>(app, "query-store-coupons", { ...ctx }).then((r) => r.coupons ?? []),

  calculatePrice: (app: App, ctx: MenuContext, items: OrderItemInput[], extra: { needTableware?: boolean } = {}) =>
    call<{ quote: PriceQuote }>(app, "calculate-price", { ...ctx, items, ...extra }).then((r) => r.quote),

  createOrder: (app: App, input: CreateOrderInput) =>
    call<{ order: OrderInfo }>(app, "create-order", { ...input }).then((r) => r.order),

  queryOrder: (app: App, orderId: string) =>
    call<{ order: OrderInfo }>(app, "query-order", { orderId }).then((r) => r.order),

  cancelOrder: (app: App, orderId: string, cancelReasonCode: number) =>
    call<{ cancelled?: boolean }>(app, "cancel-order", { orderId, cancelReasonCode }).then((r) => r.cancelled !== false),
};
