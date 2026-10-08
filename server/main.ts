#!/usr/bin/env node
/**
 * 启动入口。
 *   node dist/server/main.js           → Streamable HTTP（默认 http://localhost:3001/mcp）
 *   node dist/server/main.js --stdio   → stdio（Claude Desktop 本地配置）
 *
 * Token：
 *   stdio 模式用环境变量 MCD_MCP_TOKEN（服务只是宿主拉起的子进程，别人连不上）。
 *   HTTP 模式是要部署出去的，每个请求必须自带调用方自己的 Token：
 *   请求头 x-mcd-token > 查询参数 ?token= > 请求头 Authorization: Bearer。
 *   HTTP 请求不回退到 MCD_MCP_TOKEN，否则任何能访问服务的人都会借用部署者的账号。
 */
import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import type { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import cors from "cors";
import type { Request, Response } from "express";
import { isMock, resolveToken, tokenStorage } from "./mcd-client.js";
import { createServer } from "./server.js";

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function tokenFromRequest(req: Request): string | undefined {
  const header = first(req.headers["x-mcd-token"] as string | string[] | undefined);
  if (header) return header;
  const query = req.query.token;
  if (typeof query === "string" && query) return query;
  const auth = first(req.headers.authorization);
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7);
  return undefined;
}

async function startHttp(factory: () => McpServer): Promise<void> {
  const port = parseInt(process.env.PORT ?? "3001", 10);
  const app = createMcpExpressApp({ host: "0.0.0.0" });
  app.use(cors({ exposedHeaders: ["mcp-session-id", "mcp-protocol-version"] }));

  app.get("/", (_req, res) => {
    res.type("text/plain").send(
      "麦当劳点餐 MCP App\n\nMCP 端点：POST /mcp（Streamable HTTP）\n健康检查：GET /healthz\n模式：" +
        (isMock() ? "MCD_MOCK=1 模拟数据" : "官方接口，每个请求用 x-mcd-token 请求头、?token= 或 Authorization: Bearer 携带自己的 Token") +
        "\n",
    );
  });

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, mock: isMock() });
  });

  app.all("/mcp", async (req: Request, res: Response) => {
    const server = factory();
    const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    const handle = async () => {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    };
    try {
      await tokenStorage.run({ token: tokenFromRequest(req) }, handle);
    } catch (error) {
      console.error("MCP error:", error);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
      }
    }
  });

  const httpServer = app.listen(port, (err?: Error) => {
    if (err) {
      console.error("启动失败:", err);
      process.exit(1);
    }
    console.log(`麦当劳点餐 MCP App 已启动：http://localhost:${port}/mcp`);
    console.log(isMock() ? "模式：MCD_MOCK=1（模拟数据，不访问官方接口）" : "模式：官方接口，每个请求需自带 Token（x-mcd-token 请求头、?token= 或 Authorization: Bearer）");
    if (process.env.MCD_MCP_TOKEN) console.warn("注意：HTTP 模式不使用环境变量 MCD_MCP_TOKEN，它只在 --stdio 模式生效");
  });
  const shutdown = () => httpServer.close(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function startStdio(factory: () => McpServer): Promise<void> {
  await factory().connect(new StdioServerTransport());
  console.error(`麦当劳点餐 MCP App (stdio) 已启动${isMock() ? "，模拟模式" : resolveToken() ? "" : "，警告：未配置 MCD_MCP_TOKEN"}`);
}

const stdio = process.argv.includes("--stdio");
(stdio ? startStdio(createServer) : startHttp(createServer)).catch((e) => {
  console.error(e);
  process.exit(1);
});
