# 麦当劳点餐 MCP App

基于 [MCP Apps](https://modelcontextprotocol.io/extensions/apps/build)（`@modelcontextprotocol/ext-apps`）实现的麦当劳中国点餐交互界面。
它把 [麦当劳官方 MCP 服务](https://open.mcd.cn/mcp)（`https://mcp.mcd.cn`）的门店、菜单、计价、下单、查单工具包装成一个可以在 Claude 等支持 MCP Apps 的宿主里直接操作的界面。

| 环节 | 用户看到、操作什么 | 实现方式 |
|---|---|---|
| 选择门店 | 选自取 / 外送 / 得来速，确认门店或配送地址 | `query-nearby-stores`、`delivery-query-addresses`、`delivery-create-address`、`delivery-query-stores` |
| 浏览菜单 | 分类、餐品名称、价格、划线价、促销标签、套餐详情 | `query-meals`、`query-meal-detail` |
| 点餐 | 加入购物车、增减数量、删除商品 | 前端维护购物车（`ui/src/cart.ts`），结算时转成官方 `items[]` |
| 结算 | 选优惠券、取餐方式、餐具、备注；核对餐品、配送费、优惠、应付金额 | `query-store-coupons` + `calculate-price` 获取官方报价 |
| 付款 | 点击「确认下单并付款」，界面内显示支付二维码 | `create-order` 创建订单，把返回的 `payH5Url`（官方扫码支付页）在界面内生成二维码，手机扫码支付；也可让宿主在浏览器打开 |
| 查看结果 | 订单状态、取餐码 / 取餐柜 / 配送信息，自动刷新，可取消待支付订单 | `query-order` 轮询、`cancel-order`，在原界面更新 |

## 工作原理

```
Claude 等宿主  ──MCP──▶  本服务（server/）  ──JSON-RPC + Bearer Token──▶  https://mcp.mcd.cn（麦当劳官方 MCP）
     ▲                       │
     │  ui://mcd-order/index.html（打包后的 React 单文件页面，dist/ui/index.html）
     └── 在沙箱 iframe 中渲染，界面通过 app.callServerTool 调用本服务的工具
```

- `mcd-order` 是模型可见的入口工具，调用后宿主渲染点餐界面；后续查询由界面自己调用工具完成，不占用对话轮次。
- `query-nearby-stores`、`delivery-query-addresses`、`delivery-query-stores`、`query-meals`、`query-order` 同时对模型可见并带界面：模型直接调用它们时，界面会从对应页面打开（例如模型先查了菜单，界面直接进入点餐页）。
- `delivery-create-address`、`create-order`、`cancel-order` 只允许界面调用（`visibility: ["app"]`）：下单必须由用户在界面上点击「确认下单并付款」触发，模型无法替用户下单。
- 服务端把官方返回归一化成稳定的结构（`server/normalize.ts`），并放在 `structuredContent` 里；`content` 中同时给出文本摘要 + JSON 供不支持界面的宿主使用。
- 界面通过 `updateModelContext` 把当前门店、购物车、订单状态同步给模型，方便继续对话。
- 界面尺寸跟随宿主给的 `containerDimensions`：宿主固定高度时填满，只给上限时取上限（480–800px）；容器宽度达到 860px（例如全屏）时，菜单切换为「分类 + 卡片网格 + 右侧购物车栏」布局，结算页两栏。

## 快速开始

### 1. 申请麦当劳 MCP Token

打开 <https://open.mcd.cn/mcp>，手机号登录 → 右上角「控制台」→「激活」→ 同意协议 → 复制 Token。
每个 Token 每分钟限 600 次请求，请勿泄露。

### 2. 安装与构建

```bash
npm install
npm run build        # 打包 UI（dist/ui/index.html）并编译服务端（dist/server/）
```

### 3. 运行

```bash
# Streamable HTTP（默认 http://localhost:3001/mcp）
MCD_MCP_TOKEN=你的Token npm start

# stdio（供 Claude Desktop 等本地宿主启动）
MCD_MCP_TOKEN=你的Token npm run start:stdio

# 没有 Token 时用内置模拟数据调试界面（不访问官方接口）
MCD_MOCK=1 npm start
```

开发时可用 `npm run dev`（UI 监听打包 + 服务端热重启，HTTP 模式）。

环境变量见 [.env.example](.env.example)：`MCD_MCP_TOKEN`、`PORT`、`MCD_MOCK`、`MCD_MCP_URL`（可选，默认 `https://mcp.mcd.cn`）。

### 4. 接入 Claude

**Claude Desktop（本地 stdio）** — 在 `claude_desktop_config.json` 中加入（若你的 Claude Desktop 版本对本地 stdio 服务只渲染文本、不渲染界面，请改用下面的连接器方式）：

```json
{
  "mcpServers": {
    "mcd-order": {
      "command": "node",
      "args": ["/绝对路径/mcp-mcd-apps/dist/server/main.js", "--stdio"],
      "env": { "MCD_MCP_TOKEN": "你的Token" }
    }
  }
}
```

**用 npx 启动（已发布到 npm）** — 使用者只需要 Node 20+ 和一个 Token，不用克隆仓库：

```json
{
  "mcpServers": {
    "mcd-order": {
      "command": "npx",
      "args": ["-y", "@dumbo-ai/mcd-mcp", "--stdio"],
      "env": { "MCD_MCP_TOKEN": "你的Token" }
    }
  }
}
```

发布新版本（`prepack` 会先跑类型检查和构建）：

```bash
npm version patch
npm publish
```

不装包也可以用本地目录验证同样的启动方式：`npx -y --package=/绝对路径/mcp-mcd-apps mcd-mcp --stdio`。

**Claude.ai / Claude Desktop 自定义连接器（远程 HTTP）** — 先把本地服务暴露到公网，再在 设置 → Connectors → Add custom connector 中填入地址：

```bash
MCD_MCP_TOKEN=你的Token npm start
npx cloudflared tunnel --url http://localhost:3001   # 得到 https://xxx.trycloudflare.com，连接器地址填 https://xxx.trycloudflare.com/mcp
```

HTTP 模式下 Token 的解析顺序：请求头 `x-mcd-token` → 查询参数 `?token=` → `Authorization: Bearer`（仅当未设置环境变量时）→ 环境变量 `MCD_MCP_TOKEN`。
把服务部署给多人使用时，建议每个人通过 `x-mcd-token` 请求头携带自己的 Token。

然后在对话里说「帮我点个麦当劳」「打开麦当劳点餐」「看看北京中关村的麦当劳菜单」即可。

### 5. 本地调试（不经过 Claude）

MCP Apps 官方仓库自带一个测试宿主 `examples/basic-host`：

```bash
git clone --depth 1 https://github.com/modelcontextprotocol/ext-apps.git
cd ext-apps/examples/basic-host && npm install
SERVERS='["http://localhost:3001/mcp"]' npm start   # 打开 http://localhost:8080，选择工具 mcd-order 点 Call Tool
```

本仓库的 `.claude/launch.json` 里提供了 `mcd-mcp-server-mock`（模拟数据）和 `mcd-mcp-server` 两个启动配置。

核对官方原始返回可用：

```bash
MCD_MCP_TOKEN=你的Token npm run probe -- query-nearby-stores '{"searchType":1,"beType":1}'
```

## 工具清单

| 工具 | 可见性 | 说明 |
|---|---|---|
| `mcd-order` | 模型 + 界面 | 打开点餐界面。可选参数 `mode`（pickup / delivery / drive）、`city`、`keyword`、`orderId` |
| `query-nearby-stores` | 模型 + 界面 | 到店 / 得来速门店查询（收藏、城市+关键词、经纬度） |
| `delivery-query-addresses` | 模型 + 界面 | 配送地址列表 |
| `delivery-query-stores` | 模型 + 界面 | 按地址查询可配送门店 |
| `query-meals` | 模型 + 界面 | 门店实时菜单 |
| `query-meal-detail` | 模型 + 界面（无界面渲染） | 套餐组成、默认配料 |
| `query-store-coupons` | 模型 + 界面（无界面渲染） | 当前门店可用优惠券 |
| `calculate-price` | 模型 + 界面（无界面渲染） | 官方报价（返回单位为分） |
| `query-order` | 模型 + 界面 | 订单状态 / 取餐 / 配送信息 |
| `delivery-create-address` | 仅界面 | 新增配送地址 |
| `create-order` | 仅界面 | 创建订单，返回 `orderId` 与 `payH5Url` |
| `cancel-order` | 仅界面 | 取消待支付订单 |

## 注意事项

- **金额单位**：官方 `calculate-price` 返回「分」，其余接口返回「元」字符串；界面已分别处理（`fenToYuan` / `yuan`）。
- **支付**：麦当劳只支持在麦当劳 App 内付款，接口不提供微信或支付宝的收款码。`payH5Url` 是一个「扫码进入麦当劳 App 支付」的展示页，页面里的二维码编码的是同域 `/mcp/jumpToApp?orderId=…`，扫码后拉起麦当劳 App。界面用 `qrcode` 在本地直接生成这个 `jumpToApp` 二维码（不依赖网络，沙箱内可用），用麦当劳 App 或微信扫码即可；不会自动跳转，「浏览器打开」会打开官方展示页。支付后订单状态由 `query-order` 轮询更新（每 8 秒，最长 30 分钟）。
- **优惠券**：官方模型是「券绑定到某一件商品」（`items[].couponId/couponCode`）。界面里选券后会自动绑定到第一件适用餐品；数量大于 1 时会拆成「1 件用券 + 其余原价」两行。
- **到店取餐方式**：`create-order` 在到店场景要求 `takeWayCode`，来自 `calculate-price` 返回的 `takeWayList`；界面在结算页让用户选择。
- **套餐换品与特调**：餐品详情弹窗里每个分区（如「主食」「饮品」或「蓝区」「粉区」）可点选，配料可加/去。只有与官方默认搭配不同时才会在 `items[]` 里带 `roundList` / `modification`，否则按默认下单。特调的 `key` 取自详情返回的 `selectedKey` / `unselectedKey`，如官方接口报参数错误请用 `npm run probe -- query-meal-detail ...` 核对字段后调整 `server/normalize.ts`。
- **未覆盖的官方能力**：预约时段（`reservationDate`）、企业团餐（`beType=6` / `gmServiceCode`）、随单购（`withOrder`）。服务端工具已透传这些参数，界面暂未提供入口。
- **字段兼容**：官方返回结构以 <https://open.mcd.cn/mcp/doc> 为准；如有变化，只需调整 `server/normalize.ts`。
- Token 不会出现在界面或模型上下文中，仅在服务端使用。

## 目录结构

```
server/            MCP 服务端（stdio / Streamable HTTP）
  main.ts          启动入口、Token 注入
  server.ts        工具与 ui:// 资源注册
  mcd-client.ts    调用 https://mcp.mcd.cn 的 JSON-RPC 客户端
  normalize.ts     官方返回 → 统一结构
  mock.ts          MCD_MOCK=1 时的模拟数据
shared/types.ts    服务端与界面共用的类型
ui/                React 界面（Vite + vite-plugin-singlefile 打包成单个 HTML）
  src/Shell.tsx    页面状态机：选店 → 点餐 → 结算 → 付款 / 订单
  src/cart.ts      购物车与优惠券绑定逻辑
  src/api.ts       app.callServerTool 封装
  src/components/  各阶段页面
scripts/probe.ts   直接调用官方工具查看原始返回
```
