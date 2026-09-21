/**
 * 麦当劳点餐 MCP App 服务端。
 *
 * - 模型可见的入口工具 `mcd-order` 打开点餐界面（ui://mcd-order/index.html）
 * - 其余工具按官方同名转发到 https://mcp.mcd.cn，并把返回归一化后放进 structuredContent
 * - 写操作（新增地址 / 创建订单 / 取消订单）仅允许 UI 调用（visibility: ["app"]），
 *   保证下单必须由用户在界面上点击「确认下单并付款」触发
 */
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { OrderItemInput, StartPayload } from "../shared/types.js";
import { callMcd, isMock, McdError, resolveToken } from "./mcd-client.js";
import {
  normalizeAddress,
  normalizeAddresses,
  normalizeCoupons,
  normalizeMealDetail,
  normalizeMenu,
  normalizeOrder,
  normalizeQuote,
  normalizeStores,
} from "./normalize.js";

export const RESOURCE_URI = "ui://mcd-order/index.html";

/** 打包后的 UI（源码运行：../dist/ui/index.html；编译后运行：../ui/index.html） */
const UI_HTML_PATH = import.meta.filename.endsWith(".ts")
  ? path.resolve(import.meta.dirname, "../dist/ui/index.html")
  : path.resolve(import.meta.dirname, "../ui/index.html");

/** 包根的 package.json（源码运行：server/ 的上一级；编译后运行：dist/server/ 的上两级） */
const PACKAGE_JSON_PATH = import.meta.filename.endsWith(".ts")
  ? path.resolve(import.meta.dirname, "../package.json")
  : path.resolve(import.meta.dirname, "../../package.json");

/** serverInfo.version 必须跟随发布版本，否则宿主拿到的版本号会在发版后失真 */
const SERVER_VERSION = ((): string => {
  try {
    const version: unknown = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")).version;
    if (typeof version === "string" && version) return version;
  } catch {
    // 读不到时不让服务起不来，降级为占位版本
  }
  return "0.0.0";
})();

/** 餐品图片、取餐柜二维码等静态资源所在域名，需要在 CSP 中放行 */
const RESOURCE_DOMAINS = [
  "https://*.mcd.cn",
  "https://*.mcdchina.net",
  "https://mcd-portal-prod-cos1-1300270282.cos.ap-shanghai.myqcloud.com",
];

let uiHtmlCache: string | undefined;
async function readUiHtml(): Promise<string> {
  if (uiHtmlCache && process.env.NODE_ENV !== "development") return uiHtmlCache;
  try {
    uiHtmlCache = await fs.readFile(UI_HTML_PATH, "utf-8");
    return uiHtmlCache;
  } catch (e) {
    return `<!doctype html><meta charset="utf-8"><p style="font-family:sans-serif">UI 尚未构建：请先运行 <code>npm run build</code>。(${(e as Error).message})</p>`;
  }
}

type Payload = Record<string, unknown>;

function ok(payload: Payload, summary: string): CallToolResult {
  return {
    content: [{ type: "text", text: `${summary}\n${JSON.stringify(payload)}` }],
    structuredContent: payload,
  };
}

function fail(e: unknown): CallToolResult {
  const err = e instanceof McdError ? e : new McdError((e as Error)?.message ?? String(e));
  const suffix = err.traceId ? `（traceId: ${err.traceId}）` : "";
  return {
    content: [{ type: "text", text: `调用失败：${err.message}${suffix}` }],
    isError: true,
    structuredContent: { error: { message: err.message, code: err.code, traceId: err.traceId } },
  };
}

// ---- 公共入参 ----
const beTypeSchema = z.coerce
  .number()
  .int()
  .describe("业务类型：1 到店自取，2 麦乐送外送，5 得来速，6 企业团餐");
const orderTypeSchema = z.coerce.number().int().describe("订单类型：1 到店，2 外送");
const reservationDateSchema = z
  .string()
  .optional()
  .describe("预约时间（预约场景必填），格式 yyyy-MM-dd HH:mm");
const storeContext = {
  storeCode: z.string().describe("门店编码，来自门店查询结果"),
  beCode: z.string().describe("BE 编码，来自门店查询结果"),
  orderType: orderTypeSchema,
  beType: beTypeSchema,
  reservationDate: reservationDateSchema,
};
const modificationSchema = z
  .object({
    values: z.array(
      z.object({
        code: z.string().describe("特调项编码"),
        quantity: z.coerce.number().int().min(0),
        key: z.string().optional().describe("query-meal-detail 返回的 selectedKey / unselectedKey"),
      }),
    ),
  })
  .optional()
  .describe("单品特调，来自 query-meal-detail 的 modification");
const roundListSchema = z
  .array(
    z.object({
      round: z.union([z.string(), z.number()]).describe("套餐分区 id，来自 query-meal-detail 的 rounds[].round"),
      comboItemList: z
        .array(
          z.object({
            code: z.string().describe("分区内选中的单品编码"),
            quantity: z.coerce.number().int().min(1),
            modification: modificationSchema,
          }),
        )
        .min(1),
    }),
  )
  .optional()
  .describe("套餐各分区选中的单品；不传则按官方默认搭配");
const itemsSchema = z
  .array(
    z.object({
      productCode: z.string().describe("餐品编码，来自 query-meals"),
      quantity: z.coerce.number().int().min(1),
      couponId: z.string().optional(),
      couponCode: z.string().optional(),
      roundList: roundListSchema,
      modification: modificationSchema,
    }),
  )
  .min(1)
  .describe("商品列表");

function cleanItems(items: OrderItemInput[]): OrderItemInput[] {
  return items.map((it) => {
    const out: OrderItemInput = { productCode: it.productCode, quantity: it.quantity };
    if (it.couponId) out.couponId = it.couponId;
    if (it.couponCode) out.couponCode = it.couponCode;
    if (it.roundList?.length) out.roundList = it.roundList;
    if (it.modification?.values?.length) out.modification = it.modification;
    return out;
  });
}

/** 去掉 undefined 字段，避免把 `key: undefined` 传给官方接口 */
function compact(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== ""));
}

const UI = { ui: { resourceUri: RESOURCE_URI } } as const;
const APP_ONLY = { ui: { visibility: ["app"] } } as const;
const PLAIN = { ui: { visibility: ["model", "app"] } } as const;

/**
 * 工具注解：宿主（如 Claude、飞象）据此决定界面发起的调用是否需要用户审批。
 * 查询类工具声明只读，可免审批直接执行；下单、取消、新增地址保持非只读，宿主会弹确认。
 */
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true } as const;
const CANCEL = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true } as const;

export function createServer(): McpServer {
  const server = new McpServer({ name: "麦当劳点餐 MCP App", version: SERVER_VERSION });

  // ---------- 入口：打开点餐界面 ----------
  registerAppTool(
    server,
    "mcd-order",
    {
      title: "麦当劳点餐",
      description:
        "打开麦当劳交互式点餐界面：选择自取/外送/得来速与门店 → 浏览菜单加购 → 选优惠券结算 → 确认下单并付款 → 查看订单状态。" +
        "用户想点麦当劳、看麦当劳菜单、下单、查看麦当劳订单时调用。可传入点餐方式、城市和位置关键词作为预填；传入 orderId 时直接打开订单状态页。",
      inputSchema: {
        mode: z
          .enum(["pickup", "delivery", "drive"])
          .optional()
          .describe("pickup=到店自取，delivery=麦乐送外送，drive=得来速"),
        city: z.string().optional().describe("城市名，如“北京市”（到店场景用于搜索门店）"),
        keyword: z.string().optional().describe("位置关键词，如“中关村”（到店场景用于搜索门店）"),
        orderId: z.string().optional().describe("已有订单号，传入时直接展示该订单状态"),
      },
      annotations: READ_ONLY,
      _meta: UI,
    },
    async (args) => {
      const payload: StartPayload = {
        view: "start",
        presets: compact(args) as StartPayload["presets"],
        tokenConfigured: Boolean(resolveToken()) || isMock(),
        mock: isMock(),
      };
      const hint = payload.tokenConfigured
        ? "已打开麦当劳点餐界面，请在界面中完成选店、点餐、结算和付款。"
        : "已打开麦当劳点餐界面，但服务端尚未配置 MCD_MCP_TOKEN，界面中的查询会失败。";
      return ok(payload as unknown as Payload, hint);
    },
  );

  // ---------- 门店 / 地址 ----------
  registerAppTool(
    server,
    "query-nearby-stores",
    {
      title: "查询附近门店（到店/得来速）",
      description: "到店自取或得来速场景下查询可点餐门店。searchType=1 收藏门店，2 按城市+关键词，3 按经纬度。返回 storeCode/beCode 供后续菜单、计价、下单使用。",
      inputSchema: {
        searchType: z.coerce.number().int().describe("1 收藏门店，2 按位置（需 city+keyword），3 按经纬度"),
        beType: z.coerce.number().int().describe("1 到店自取，5 得来速"),
        city: z.string().optional(),
        keyword: z.string().optional(),
        longitude: z.coerce.number().optional(),
        latitude: z.coerce.number().optional(),
      },
      annotations: READ_ONLY,
      _meta: UI,
    },
    async (args) => {
      try {
        const stores = normalizeStores(await callMcd("query-nearby-stores", compact(args)));
        return ok({ view: "stores", context: compact(args), stores }, `找到 ${stores.length} 家门店。`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  registerAppTool(
    server,
    "delivery-query-addresses",
    {
      title: "查询配送地址",
      description: "查询用户已保存的麦乐送配送地址列表，外送点餐第一步。",
      inputSchema: {},
      annotations: READ_ONLY,
      _meta: UI,
    },
    async () => {
      try {
        const addresses = normalizeAddresses(await callMcd("delivery-query-addresses", {}));
        return ok({ view: "addresses", addresses }, `共有 ${addresses.length} 个配送地址。`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  registerAppTool(
    server,
    "delivery-create-address",
    {
      title: "新增配送地址（仅界面）",
      description: "在点餐界面中新增配送地址。",
      inputSchema: {
        city: z.string(),
        contactName: z.string(),
        gender: z.string().optional(),
        phone: z.string().regex(/^\d{11}$/, "手机号需为 11 位数字"),
        address: z.string(),
        addressDetail: z.string(),
      },
      annotations: WRITE,
      _meta: APP_ONLY,
    },
    async (args) => {
      try {
        const address = normalizeAddress(await callMcd("delivery-create-address", compact(args)));
        return ok({ address }, `已新增地址 ${address.fullAddress ?? address.addressId}。`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  registerAppTool(
    server,
    "delivery-query-stores",
    {
      title: "查询可配送门店",
      description: "外送场景下按配送地址查询可配送门店。",
      inputSchema: {
        addressId: z.string().describe("配送地址 ID，来自 delivery-query-addresses"),
        beType: z.coerce.number().int().describe("2 麦乐送，6 企业团餐"),
      },
      annotations: READ_ONLY,
      _meta: UI,
    },
    async (args) => {
      try {
        const stores = normalizeStores(await callMcd("delivery-query-stores", compact(args)));
        return ok({ view: "stores", context: compact(args), stores }, `找到 ${stores.length} 家可配送门店。`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  // ---------- 菜单 ----------
  registerAppTool(
    server,
    "query-meals",
    {
      title: "查询菜单",
      description: "查询门店当前可售餐品（分类、餐品编码、价格、促销标签）。需要门店查询返回的 storeCode/beCode，以及 orderType/beType。",
      inputSchema: storeContext,
      annotations: READ_ONLY,
      _meta: UI,
    },
    async (args) => {
      try {
        const menu = normalizeMenu(await callMcd("query-meals", compact(args)));
        return ok(
          { view: "menu", context: compact(args), menu },
          `菜单共 ${menu.categories.length} 个分类、${menu.itemCount} 个餐品。`,
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  registerAppTool(
    server,
    "query-meal-detail",
    {
      title: "查询餐品详情",
      description: "查看套餐组成与可选特调。",
      inputSchema: { code: z.string().describe("餐品编码"), ...storeContext },
      annotations: READ_ONLY,
      _meta: PLAIN,
    },
    async (args) => {
      try {
        const detail = normalizeMealDetail(await callMcd("query-meal-detail", compact(args)));
        return ok({ detail }, `${detail.name}（${detail.code}）详情。`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  // ---------- 结算 ----------
  registerAppTool(
    server,
    "query-store-coupons",
    {
      title: "查询门店可用优惠券",
      description: "查询当前门店和取餐方式下可用的优惠券（含适用餐品）。",
      inputSchema: storeContext,
      annotations: READ_ONLY,
      _meta: PLAIN,
    },
    async (args) => {
      try {
        const coupons = normalizeCoupons(await callMcd("query-store-coupons", compact(args)));
        return ok({ coupons }, `可用优惠券 ${coupons.length} 张。`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  registerAppTool(
    server,
    "calculate-price",
    {
      title: "计算价格",
      description: "按购物车内容（可含优惠券）获取官方报价：商品金额、配送费、优惠、应付金额，以及到店场景的取餐方式列表。返回金额单位为分。",
      inputSchema: {
        ...storeContext,
        items: itemsSchema,
        gmServiceCode: z.string().optional(),
        needTableware: z.boolean().optional(),
        withOrder: z.record(z.string(), z.unknown()).optional(),
      },
      annotations: READ_ONLY,
      _meta: PLAIN,
    },
    async (args) => {
      try {
        const quote = normalizeQuote(
          await callMcd("calculate-price", compact({ ...args, items: cleanItems(args.items) })),
        );
        return ok({ quote }, `应付 ¥${(quote.price / 100).toFixed(2)}（商品 ¥${(quote.productPrice / 100).toFixed(2)}，配送费 ¥${(quote.deliveryPrice / 100).toFixed(2)}，优惠 ¥${(quote.discount / 100).toFixed(2)}）。`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  // ---------- 下单 / 订单 ----------
  registerAppTool(
    server,
    "create-order",
    {
      title: "创建订单（仅界面）",
      description: "由点餐界面在用户点击「确认下单并付款」后调用，创建真实订单并返回支付链接 payH5Url。",
      inputSchema: {
        storeCode: z.string(),
        beCode: z.string(),
        beType: beTypeSchema,
        // 官方文档的参数表未列出，但线上接口会校验：1 到店，2 外送
        orderType: orderTypeSchema,
        items: itemsSchema,
        addressId: z.string().optional().describe("外送必填"),
        takeWayCode: z.string().optional().describe("到店必填，来自 calculate-price 的 takeWayList"),
        reservationDate: reservationDateSchema,
        gmServiceCode: z.string().optional(),
        needTableware: z.boolean().optional(),
        remark: z.string().max(50).optional().describe("订单备注，仅外送"),
        withOrder: z.record(z.string(), z.unknown()).optional(),
      },
      annotations: WRITE,
      _meta: APP_ONLY,
    },
    async (args) => {
      try {
        const order = normalizeOrder(
          await callMcd("create-order", compact({ ...args, items: cleanItems(args.items) })),
        );
        return ok(
          { view: "order", order },
          `订单已创建：${order.orderId}，状态「${order.orderStatus}」，应付 ¥${order.realTotalAmount ?? "?"}。支付链接：${order.payH5Url ?? "无"}`,
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  registerAppTool(
    server,
    "query-order",
    {
      title: "查询订单状态",
      description: "查询麦当劳点餐订单的状态、取餐码/取餐柜信息或配送信息。",
      inputSchema: { orderId: z.string().describe("订单号") },
      annotations: READ_ONLY,
      _meta: UI,
    },
    async (args) => {
      try {
        const order = normalizeOrder(await callMcd("query-order", compact(args)));
        const extra = order.pickupCode ? `，取餐码 ${order.pickupCode}` : "";
        return ok({ view: "order", order }, `订单 ${order.orderId} 状态「${order.orderStatus}」${extra}。`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  registerAppTool(
    server,
    "cancel-order",
    {
      title: "取消订单（仅界面）",
      description: "取消待支付订单。",
      inputSchema: {
        orderId: z.string(),
        cancelReasonCode: z.coerce
          .number()
          .int()
          .describe("1 改主意了，2 重复下单，3 点错了，4 地址/电话填错了，5 送达时间选错了，-1 其它"),
      },
      annotations: CANCEL,
      _meta: APP_ONLY,
    },
    async (args) => {
      try {
        const data = (await callMcd<Record<string, unknown>>("cancel-order", compact(args))) ?? {};
        const cancelled = data.cancelResult !== false;
        return ok({ cancelled, orderId: args.orderId }, cancelled ? "订单已取消。" : "取消失败。");
      } catch (e) {
        return fail(e);
      }
    },
  );

  // ---------- UI 资源 ----------
  registerAppResource(
    server,
    "麦当劳点餐界面",
    RESOURCE_URI,
    {
      description: "麦当劳点餐交互界面（选店、菜单、购物车、结算、付款、订单状态）",
      mimeType: RESOURCE_MIME_TYPE,
      _meta: { ui: { csp: { resourceDomains: RESOURCE_DOMAINS }, prefersBorder: true } },
    },
    async () => ({
      contents: [
        {
          uri: RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: await readUiHtml(),
          _meta: { ui: { csp: { resourceDomains: RESOURCE_DOMAINS }, prefersBorder: true } },
        },
      ],
    }),
  );

  return server;
}
