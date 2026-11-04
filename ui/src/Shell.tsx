/**
 * 页面状态机：start → addresses/stores → menu → checkout → order
 * 同时负责接收宿主推送的工具结果（模型直接调用某个工具时，从对应页面打开）。
 */
import type { App, McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/client";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  MODE_META,
  modeFromBeType,
  type Address,
  type Menu,
  type MenuContext,
  type OrderInfo,
  type OrderMode,
  type StartPayload,
  type Store,
} from "../../shared/types.js";
import { cartReducer, type CartLine } from "./cart.js";
import { Header, type Stage } from "./components/Header.js";
import { StartStage } from "./components/StartStage.js";
import { AddressStage } from "./components/AddressStage.js";
import { StoreStage } from "./components/StoreStage.js";
import { MenuStage } from "./components/MenuStage.js";
import { CheckoutStage } from "./components/CheckoutStage.js";
import { OrderStage } from "./components/OrderStage.js";
import { ErrorBox } from "./components/common.js";

interface Session {
  mode: OrderMode;
  store?: Store;
  address?: Address;
}

export function Shell({
  app,
  hostContext,
  toolResult,
  toolInput,
}: {
  app: App;
  hostContext?: McpUiHostContext;
  toolResult: CallToolResult | null;
  toolInput?: Record<string, unknown>;
}) {
  const [stage, setStage] = useState<Stage>("start");
  const [session, setSession] = useState<Session>({ mode: "pickup" });
  const [presets, setPresets] = useState<StartPayload["presets"]>({});
  const [meta, setMeta] = useState<{ mock: boolean; tokenConfigured: boolean }>({ mock: false, tokenConfigured: true });
  const [stores, setStores] = useState<Store[] | null>(null);
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [cart, dispatch] = useReducer(cartReducer, [] as CartLine[]);
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [toolError, setToolError] = useState<unknown>(null);

  // ---- 宿主推送的工具结果：决定初始页面 ----
  useEffect(() => {
    if (!toolResult) return;
    const sc = (toolResult.structuredContent ?? {}) as Record<string, unknown>;
    if (toolResult.isError || sc.error) {
      const err = sc.error as { message?: string } | undefined;
      const text = toolResult.content?.map((c) => (c.type === "text" ? c.text : "")).join("") ?? "";
      setToolError(new Error(err?.message || text || "工具调用失败"));
      return;
    }
    setToolError(null);
    switch (sc.view) {
      case "start": {
        const payload = sc as unknown as StartPayload;
        setMeta({ mock: !!payload.mock, tokenConfigured: payload.tokenConfigured !== false });
        const p = payload.presets ?? {};
        setPresets(p);
        if (p.orderId) {
          setOrderId(p.orderId);
          setOrder(null);
          setStage("order");
        } else if (p.mode) {
          setSession((s) => ({ ...s, mode: p.mode as OrderMode }));
          setStage(p.mode === "delivery" ? "addresses" : "start");
        }
        break;
      }
      case "addresses":
        setAddresses((sc.addresses as Address[]) ?? []);
        setSession((s) => ({ ...s, mode: "delivery" }));
        setStage("addresses");
        break;
      case "stores": {
        const ctx = (sc.context ?? {}) as { beType?: number; addressId?: string };
        const mode = modeFromBeType(ctx.beType ?? (toolInput?.beType as number | undefined));
        setSession((s) => ({
          ...s,
          mode,
          address: ctx.addressId ? { addressId: ctx.addressId, ...(s.address?.addressId === ctx.addressId ? s.address : {}) } : s.address,
        }));
        setStores((sc.stores as Store[]) ?? []);
        setStage("stores");
        break;
      }
      case "menu": {
        const ctx = (sc.context ?? {}) as Partial<MenuContext>;
        const mode = modeFromBeType(ctx.beType);
        setSession((s) => ({
          ...s,
          mode,
          store:
            s.store?.storeCode === ctx.storeCode
              ? s.store
              : { storeCode: ctx.storeCode ?? "", beCode: ctx.beCode ?? "", storeName: `门店 ${ctx.storeCode ?? ""}`, reservationTimeOptions: [] },
        }));
        setMenu((sc.menu as Menu) ?? null);
        setStage("menu");
        break;
      }
      case "order": {
        const o = sc.order as OrderInfo | undefined;
        if (o) {
          setOrder(o);
          setOrderId(o.orderId);
          setStage("order");
        }
        break;
      }
      default:
        break;
    }
  }, [toolResult, toolInput]);

  const menuContext = useMemo<MenuContext | null>(() => {
    if (!session.store) return null;
    const m = MODE_META[session.mode];
    return { storeCode: session.store.storeCode, beCode: session.store.beCode, orderType: m.orderType, beType: m.beType };
  }, [session.mode, session.store]);

  // ---- 把关键状态同步给模型（宿主支持时） ----
  const lastContext = useRef("");
  useEffect(() => {
    if (!app.getHostCapabilities()?.updateModelContext) return;
    const lines = [
      `点餐方式：${MODE_META[session.mode].label}`,
      session.store ? `门店：${session.store.storeName}（${session.store.storeCode}）` : "门店：未选择",
      session.mode === "delivery" && session.address ? `配送地址：${session.address.fullAddress ?? session.address.addressId}` : "",
      cart.length
        ? `购物车：${cart.map((l) => `${l.name}${l.selection ? `（${l.selection.label}）` : ""}×${l.quantity}${l.couponTitle ? `（券：${l.couponTitle}）` : ""}`).join("，")}`
        : "购物车：空",
      order ? `订单：${order.orderId} 状态「${order.orderStatus}」应付 ${order.realTotalAmount ?? "?"} 元` : "",
      `当前页面：${stage}`,
    ].filter(Boolean);
    const text = lines.join("\n");
    if (text === lastContext.current) return;
    lastContext.current = text;
    const timer = setTimeout(() => {
      app.updateModelContext({ content: [{ type: "text", text }] }).catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, [app, session, cart, order, stage]);

  // ---- 导航回调 ----
  const chooseMode = useCallback((mode: OrderMode) => {
    setSession({ mode });
    setStores(null);
    setMenu(null);
    dispatch({ type: "clear" });
    setStage(mode === "delivery" ? "addresses" : "start");
  }, []);

  const onStoresFound = useCallback((found: Store[]) => {
    setStores(found);
    setStage("stores");
  }, []);

  const onAddressChosen = useCallback((address: Address, found: Store[]) => {
    setSession((s) => ({ ...s, mode: "delivery", address }));
    setStores(found);
    setStage("stores");
  }, []);

  const onStoreChosen = useCallback((store: Store) => {
    setSession((s) => ({ ...s, store }));
    setMenu(null);
    dispatch({ type: "clear" });
    setStage("menu");
  }, []);

  const onOrderCreated = useCallback((created: OrderInfo) => {
    setOrder(created);
    setOrderId(created.orderId);
    dispatch({ type: "clear" });
    setStage("order");
  }, []);

  const restart = useCallback(() => {
    setSession({ mode: "pickup" });
    setStores(null);
    setAddresses(null);
    setMenu(null);
    setOrder(null);
    setOrderId(null);
    setPresets({});
    dispatch({ type: "clear" });
    setStage("start");
  }, []);

  // ---- 尺寸：跟随宿主给的容器尺寸；宿主固定高度时填满，只给上限时取上限（最多 800） ----
  const dims = hostContext?.containerDimensions as { height?: number; maxHeight?: number; width?: number } | undefined;
  const fullscreen = hostContext?.displayMode === "fullscreen";
  const shellHeight = fullscreen
    ? "100vh"
    : dims?.height && dims.height > 0
      ? `${Math.max(dims.height, 320)}px`
      : `${Math.min(Math.max(dims?.maxHeight ?? 640, 480), 800)}px`;

  // 宽屏（≥ 860px）时菜单用网格 + 右侧购物车栏
  const shellRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const el = shellRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWide(w >= 860);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const shellStyle = {
    height: shellHeight,
    paddingTop: hostContext?.safeAreaInsets?.top,
    paddingRight: hostContext?.safeAreaInsets?.right,
    paddingBottom: hostContext?.safeAreaInsets?.bottom,
    paddingLeft: hostContext?.safeAreaInsets?.left,
  };

  return (
    <div ref={shellRef} className="shell" data-display={hostContext?.displayMode ?? "inline"} data-wide={wide ? "true" : "false"} style={shellStyle}>
      <Header
        app={app}
        hostContext={hostContext}
        stage={stage}
        mode={session.mode}
        store={session.store}
        address={session.address}
        mock={meta.mock}
      />
      {!meta.tokenConfigured && (
        <div className="notice warn">服务端未配置 MCD_MCP_TOKEN，查询会失败。请在 https://open.mcd.cn/mcp 申请后配置环境变量。</div>
      )}
      {toolError != null && <ErrorBox error={toolError} />}

      {stage === "start" && (
        <StartStage app={app} mode={session.mode} presets={presets} onMode={chooseMode} onStores={onStoresFound} />
      )}
      {stage === "addresses" && (
        <AddressStage
          app={app}
          addresses={addresses}
          onAddresses={setAddresses}
          onChosen={onAddressChosen}
          onBack={() => setStage("start")}
        />
      )}
      {stage === "stores" && (
        <StoreStage
          stores={stores ?? []}
          mode={session.mode}
          onSelect={onStoreChosen}
          onBack={() => setStage(session.mode === "delivery" ? "addresses" : "start")}
        />
      )}
      {stage === "menu" && menuContext && session.store && (
        <MenuStage
          app={app}
          ctx={menuContext}
          store={session.store}
          menu={menu}
          onMenu={setMenu}
          cart={cart}
          dispatch={dispatch}
          wide={wide}
          onCheckout={() => setStage("checkout")}
          onBack={() => setStage("stores")}
        />
      )}
      {stage === "checkout" && menuContext && session.store && (
        <CheckoutStage
          app={app}
          ctx={menuContext}
          mode={session.mode}
          store={session.store}
          address={session.address}
          onAddress={(address) => setSession((s) => ({ ...s, address }))}
          cart={cart}
          dispatch={dispatch}
          onBack={() => setStage("menu")}
          onOrderCreated={onOrderCreated}
        />
      )}
      {stage === "order" && orderId && (
        <OrderStage app={app} orderId={orderId} initialOrder={order} onOrder={setOrder} onRestart={restart} />
      )}
      {stage === "menu" && !menuContext && (
        <div className="stage">
          <ErrorBox error={new Error("缺少门店信息，请重新选择门店")} />
          <button className="btn" onClick={restart}>
            重新开始
          </button>
        </div>
      )}
    </div>
  );
}
