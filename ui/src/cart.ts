/**
 * 购物车：纯前端维护，结算时转换成官方 items[] 结构。
 * 优惠券绑定在具体的购物车行上（官方 items[].couponId/couponCode）。
 */
import type { Coupon, MenuItem, ModificationSelection, OrderItemInput, RoundSelection } from "../../shared/types.js";
import { priceNum } from "./format.js";

/** 用户在详情弹窗里对套餐 / 特调做出的选择；未改动默认搭配时为 undefined */
export interface CartSelection {
  roundList?: RoundSelection[];
  modification?: ModificationSelection;
  /** 展示用，如「麦辣鸡腿堡+中薯条+可乐」 */
  label: string;
  /** 用于区分不同搭配的购物车行 */
  signature: string;
  /** 换品加价（元） */
  extraPrice: number;
}

export interface CartLine {
  key: string;
  productCode: string;
  name: string;
  unitPrice: string;
  image?: string;
  quantity: number;
  couponId?: string;
  couponCode?: string;
  couponTitle?: string;
  selection?: CartSelection;
}

export type CartAction =
  | { type: "add"; item: MenuItem; quantity?: number; selection?: CartSelection }
  | { type: "inc"; key: string }
  | { type: "dec"; key: string }
  | { type: "setQuantity"; key: string; quantity: number }
  | { type: "remove"; key: string }
  | { type: "clear" }
  | { type: "applyCoupon"; coupon: Coupon }
  | { type: "removeCoupon"; couponId: string };

const keyOf = (productCode: string, couponId?: string, signature?: string) => [productCode, couponId ?? "", signature ?? ""].join("#");

export function couponEligibleLine(lines: CartLine[], coupon: Coupon): CartLine | undefined {
  const codes = new Set(coupon.products.map((p) => p.productCode));
  return lines.find((l) => !l.couponId && (codes.size === 0 || codes.has(l.productCode)));
}

export function couponInUse(lines: CartLine[], couponId: string): boolean {
  return lines.some((l) => l.couponId === couponId);
}

export function cartReducer(lines: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case "add": {
      const key = keyOf(action.item.code, undefined, action.selection?.signature);
      const qty = Math.max(1, action.quantity ?? 1);
      const existing = lines.find((l) => l.key === key);
      if (existing) return lines.map((l) => (l.key === key ? { ...l, quantity: l.quantity + qty } : l));
      return [
        ...lines,
        {
          key,
          productCode: action.item.code,
          name: action.item.name,
          unitPrice: action.item.currentPrice,
          image: action.item.image,
          quantity: qty,
          selection: action.selection,
        },
      ];
    }
    case "inc":
      return lines.map((l) => (l.key === action.key && !l.couponId ? { ...l, quantity: l.quantity + 1 } : l));
    case "dec":
      return lines
        .map((l) => (l.key === action.key ? { ...l, quantity: l.quantity - 1 } : l))
        .filter((l) => l.quantity > 0);
    case "setQuantity":
      return lines
        .map((l) => (l.key === action.key ? { ...l, quantity: Math.floor(action.quantity) } : l))
        .filter((l) => l.quantity > 0);
    case "remove":
      return lines.filter((l) => l.key !== action.key);
    case "clear":
      return [];
    case "applyCoupon": {
      const { coupon } = action;
      if (couponInUse(lines, coupon.couponId)) return lines;
      const target = couponEligibleLine(lines, coupon);
      if (!target) return lines;
      const withCoupon: CartLine = {
        ...target,
        key: keyOf(target.productCode, coupon.couponId, target.selection?.signature),
        quantity: 1,
        couponId: coupon.couponId,
        couponCode: coupon.couponCode,
        couponTitle: coupon.title,
      };
      if (target.quantity > 1) {
        // 拆分：一份用券，其余保持原价
        return lines.flatMap((l) => (l.key === target.key ? [{ ...l, quantity: l.quantity - 1 }, withCoupon] : [l]));
      }
      return lines.map((l) => (l.key === target.key ? withCoupon : l));
    }
    case "removeCoupon": {
      const line = lines.find((l) => l.couponId === action.couponId);
      if (!line) return lines;
      const rest = lines.filter((l) => l.key !== line.key);
      const plainKey = keyOf(line.productCode, undefined, line.selection?.signature);
      const plain = rest.find((l) => l.key === plainKey);
      if (plain) return rest.map((l) => (l.key === plainKey ? { ...l, quantity: l.quantity + line.quantity } : l));
      const { couponId: _c, couponCode: _cc, couponTitle: _ct, ...bare } = line;
      return [...rest, { ...bare, key: plainKey }];
    }
    default:
      return lines;
  }
}

export function cartToItems(lines: CartLine[]): OrderItemInput[] {
  return lines.map((l) => {
    const item: OrderItemInput = { productCode: l.productCode, quantity: l.quantity };
    if (l.couponId) item.couponId = l.couponId;
    if (l.couponCode) item.couponCode = l.couponCode;
    if (l.selection?.roundList?.length) item.roundList = l.selection.roundList;
    if (l.selection?.modification?.values.length) item.modification = l.selection.modification;
    return item;
  });
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((n, l) => n + l.quantity, 0);
}

/** 按菜单单价估算的小计（元），最终以 calculate-price 为准 */
export function cartSubtotal(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + (priceNum(l.unitPrice) + (l.selection?.extraPrice ?? 0)) * l.quantity, 0);
}
