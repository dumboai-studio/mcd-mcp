/**
 * 麦当劳官方 MCP（https://mcp.mcd.cn）调用封装。
 *
 * 官方服务是 Streamable HTTP，tools/call 可直接以无状态 JSON-RPC POST 调用，
 * 每个请求携带 `Authorization: Bearer <MCD_MCP_TOKEN>`。
 * 工具结果的 content[0].text 是一个 JSON 字符串：{ success, code, message, data, traceId }。
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { McdEnvelope } from "../shared/types.js";
import { mockCall } from "./mock.js";

export const MCD_ENDPOINT = process.env.MCD_MCP_URL?.trim() || "https://mcp.mcd.cn";

/** HTTP 模式下按请求注入的 Token（见 main.ts） */
export const tokenStorage = new AsyncLocalStorage<string>();

export class McdError extends Error {
  constructor(
    message: string,
    public readonly code?: string | number,
    public readonly traceId?: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "McdError";
  }
}

export function isMock(): boolean {
  return /^(1|true|yes|on)$/i.test(process.env.MCD_MOCK ?? "");
}

export function resolveToken(): string | undefined {
  const raw = tokenStorage.getStore() ?? process.env.MCD_MCP_TOKEN ?? "";
  const token = raw.replace(/^Bearer\s+/i, "").trim();
  return token || undefined;
}

let rpcId = 1;

interface JsonRpcResponse {
  id?: number | string | null;
  result?: {
    content?: { type: string; text?: string }[];
    structuredContent?: unknown;
    isError?: boolean;
  };
  error?: { code?: number; message?: string };
}

function parseRpcResponse(text: string, contentType: string, id: number): JsonRpcResponse {
  if (contentType.includes("text/event-stream")) {
    // SSE：逐条解析 data: 行，找到与本次 id 匹配的响应
    let last: JsonRpcResponse | undefined;
    for (const line of text.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      try {
        const msg = JSON.parse(payload) as JsonRpcResponse;
        if (msg && ("result" in msg || "error" in msg)) {
          last = msg;
          if (msg.id === id) return msg;
        }
      } catch {
        /* 忽略无法解析的行 */
      }
    }
    if (last) return last;
    throw new McdError("麦当劳 MCP 服务返回了无法解析的事件流", "BAD_RESPONSE");
  }
  try {
    return JSON.parse(text) as JsonRpcResponse;
  } catch {
    throw new McdError(`麦当劳 MCP 服务返回了非 JSON 内容：${text.slice(0, 200)}`, "BAD_RESPONSE");
  }
}

function parseEnvelope(text: string, structured: unknown): McdEnvelope {
  if (structured && typeof structured === "object" && "success" in (structured as object)) {
    return structured as McdEnvelope;
  }
  const trimmed = text.trim();
  if (!trimmed) return { success: true, data: null };
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && "success" in (parsed as object)) {
      return parsed as McdEnvelope;
    }
    return { success: true, data: parsed };
  } catch {
    // 个别工具（如活动日历）返回 Markdown 文本
    return { success: true, data: trimmed };
  }
}

/** 调用官方工具，返回完整响应包裹（含 success/message/traceId） */
export async function callMcdEnvelope(
  tool: string,
  args: Record<string, unknown> = {},
): Promise<McdEnvelope> {
  if (isMock()) {
    return { success: true, code: 200, message: "mock", data: await mockCall(tool, args) };
  }
  const token = resolveToken();
  if (!token) {
    throw new McdError(
      "未配置麦当劳 MCP Token：请设置环境变量 MCD_MCP_TOKEN（在 https://open.mcd.cn/mcp 登录 → 控制台 → 激活 → 复制）",
      "NO_TOKEN",
    );
  }

  const id = rpcId++;
  const body = {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name: tool, arguments: args },
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  let res: Response;
  try {
    res = await fetch(MCD_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${token}`,
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    const reason = controller.signal.aborted ? "请求超时" : (e as Error).message;
    throw new McdError(`无法连接麦当劳 MCP 服务：${reason}`, "NETWORK");
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  if (res.status === 401) {
    throw new McdError("麦当劳 MCP Token 无效或已过期，请到 https://open.mcd.cn/mcp 重新获取", 401, undefined, 401);
  }
  if (res.status === 429) {
    throw new McdError("请求过于频繁（每个 Token 每分钟最多 600 次），请稍后再试", 429, undefined, 429);
  }
  if (!res.ok) {
    throw new McdError(`麦当劳 MCP 服务返回 HTTP ${res.status}：${text.slice(0, 200)}`, res.status, undefined, res.status);
  }

  const rpc = parseRpcResponse(text, res.headers.get("content-type") ?? "", id);
  if (rpc.error) {
    throw new McdError(rpc.error.message ?? "工具调用失败", rpc.error.code);
  }
  const result = rpc.result ?? {};
  const textContent = result.content?.find((c) => c.type === "text")?.text ?? "";
  if (result.isError) {
    throw new McdError(textContent || "工具调用失败", "TOOL_ERROR");
  }
  return parseEnvelope(textContent, result.structuredContent);
}

/** 调用官方工具并返回 data；success=false 时抛出 McdError */
export async function callMcd<T = unknown>(tool: string, args: Record<string, unknown> = {}): Promise<T> {
  const envelope = await callMcdEnvelope(tool, args);
  if (envelope.success === false) {
    throw new McdError(envelope.message || "请求失败", envelope.code, envelope.traceId);
  }
  return envelope.data as T;
}
