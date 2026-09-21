/** 分 → "¥12.5" */
export function fenToYuan(fen: number | undefined | null): string {
  if (fen == null || !Number.isFinite(fen)) return "—";
  const s = (fen / 100).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  return `¥${s}`;
}

/** 元字符串 → "¥12.5" */
export function yuan(v: string | number | undefined | null): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return `¥${v}`;
  return `¥${n.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")}`;
}

export function priceNum(v: string | number | undefined | null): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 官方 takeWay 编码 → 中文 */
export function takeWayLabel(code: string | undefined): string {
  if (!code) return "—";
  const map: Record<string, string> = {
    "locker-in": "店内取餐柜",
    "locker-out": "店外取餐柜",
    counter: "柜台取餐",
    "dine-in": "堂食",
    "take-out": "打包带走",
    "drive-thru": "得来速车道",
    dt: "得来速车道",
  };
  return map[code] ?? code;
}

/**
 * 官方 payH5Url 是「扫码进入麦当劳 App 支付」的展示页，页面里的二维码编码的是同域的 /mcp/jumpToApp?orderId=…，
 * 扫码后直接拉起麦当劳 App 付款。界面里直接编码 jumpToApp，省掉中间那一跳；无法识别时原样返回。
 */
export function appPayTarget(payUrl: string): string {
  try {
    const u = new URL(payUrl);
    if (/\/mcp\/scanToPay$/.test(u.pathname)) {
      u.pathname = u.pathname.replace(/\/mcp\/scanToPay$/, "/mcp/jumpToApp");
      return u.toString();
    }
  } catch {
    /* 非法 URL，原样使用 */
  }
  return payUrl;
}

export function isTerminalStatus(status: string | undefined): boolean {
  if (!status) return false;
  return /完成|取消|关闭|退款|失败|已送达|已取餐/.test(status);
}

export function isUnpaidStatus(status: string | undefined): boolean {
  return !!status && /待支付|未支付|待付款/.test(status);
}

export interface StatusTimeline {
  steps: string[];
  /** 当前所处步骤下标；-1 表示已取消/关闭 */
  current: number;
  cancelled: boolean;
}

/** 把官方订单状态文本映射到进度条 */
export function statusTimeline(status: string | undefined, delivery: boolean): StatusTimeline {
  const steps = ["已下单", "已支付", "制作中", delivery ? "配送中" : "待取餐", "已完成"];
  const s = status ?? "";
  if (/取消|关闭|退款|失败/.test(s)) return { steps, current: -1, cancelled: true };
  if (/完成|已送达|已取餐/.test(s)) return { steps, current: 4, cancelled: false };
  if (/配送|骑手|待取餐|可取餐|请取餐|已出餐/.test(s)) return { steps, current: 3, cancelled: false };
  if (/制作|备餐|已接单|已支付|已付款/.test(s)) return { steps, current: 2, cancelled: false };
  if (isUnpaidStatus(s)) return { steps, current: 0, cancelled: false };
  return { steps, current: 1, cancelled: false };
}
