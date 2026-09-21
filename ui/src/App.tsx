/**
 * 根组件：建立与宿主的连接（useApp），接收工具输入/结果，并把 App 实例交给 Shell。
 */
import type { App, McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";
import type { CallToolResult } from "@modelcontextprotocol/client";
import { useEffect, useState } from "react";
import { Shell } from "./Shell.js";

export function OrderApp() {
  const [toolResult, setToolResult] = useState<CallToolResult | null>(null);
  const [toolInput, setToolInput] = useState<Record<string, unknown> | undefined>();
  const [hostContext, setHostContext] = useState<McpUiHostContext | undefined>();

  const { app, error } = useApp({
    appInfo: { name: "麦当劳点餐", version: "0.1.0" },
    capabilities: { availableDisplayModes: ["inline", "fullscreen"] },
    onAppCreated: (created: App) => {
      created.ontoolinput = (params) => setToolInput(params.arguments);
      created.ontoolresult = (result) => setToolResult(result);
      created.onhostcontextchanged = (params) => setHostContext((prev) => ({ ...prev, ...params }));
      created.onerror = (e) => console.error("[mcd-order]", e);
    },
  });

  // 传入初始 host context，宿主一开始就是浅色/深色时也能立即生效
  useHostStyles(app, app?.getHostContext() ?? null);

  useEffect(() => {
    if (app) setHostContext(app.getHostContext());
  }, [app]);

  if (error) {
    return (
      <div className="shell centered">
        <div className="error-box">
          <strong>无法连接宿主</strong>
          <div>{error.message}</div>
        </div>
      </div>
    );
  }
  if (!app) {
    return (
      <div className="shell centered">
        <div className="spinner" /> <span>正在连接…</span>
      </div>
    );
  }
  return <Shell app={app} hostContext={hostContext} toolResult={toolResult} toolInput={toolInput} />;
}
