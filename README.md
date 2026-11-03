# 麦当劳点餐 MCP App

一个 **[MCP App](https://modelcontextprotocol.io/extensions/apps/build)**：它不只是一组工具，而是随服务下发一个完整的点餐**界面**，在宿主的沙箱 iframe 里渲染，选门店、加购物车、选券、下单、看订单全部在界面里点，不消耗对话轮次。

底层调用 [麦当劳官方 MCP 服务](https://open.mcd.cn/mcp)（`https://mcp.mcd.cn`）。

> **声明**：本项目为非官方的第三方客户端，与麦当劳公司无任何关联，未获其授权或认可。
> 「麦当劳」「McDonald's」及金拱门标识均为麦当劳公司的注册商标，归其所有。
> 本项目仅通过麦当劳对外开放的 MCP 接口访问服务，使用者需自行申请并遵守官方条款。

## 快速开始

需要 Node 20+，以及一个麦当劳 MCP Token（<https://open.mcd.cn/mcp> → 手机号登录 → 控制台 → 激活 → 复制，每分钟限 600 次请求）。

在支持 MCP Apps 的宿主里加入配置即可，不用克隆仓库：

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

然后在对话里说「帮我点个麦当劳」「看看北京中关村的麦当劳菜单」即可。

没有 Token 时，把 `MCD_MCP_TOKEN` 换成 `MCD_MOCK` = `1`，会使用内置模拟数据，不访问官方接口，适合先看界面。

> 宿主必须支持 MCP Apps 的界面渲染才能看到界面。若宿主只渲染文本，则退化为纯工具调用，建议改用下面的远程连接器方式。

## 这个 App 做了什么

| 环节 | 用户看到、操作什么 | 用到的工具 |
|---|---|---|
| 选择门店 | 选自取 / 外送 / 得来速，确认门店或配送地址 | `query-nearby-stores`、`delivery-query-addresses`、`delivery-create-address`、`delivery-query-stores` |
| 浏览菜单 | 分类、餐品名称、价格、划线价、促销标签、套餐详情 | `query-meals`、`query-meal-detail` |
| 点餐 | 加入购物车、增减数量、删除商品、套餐换品与加减配料 | 界面维护购物车，结算时转成官方 `items[]` |
| 结算 | 选优惠券、取餐方式、餐具、备注；核对餐品、配送费、优惠、应付金额 | `query-store-coupons` + `calculate-price` 获取官方报价 |
| 付款 | 点击「确认下单并付款」，界面内生成支付二维码。**麦当劳只支持在其 App 内付款，不提供微信或支付宝收款码**，扫码后会拉起麦当劳 App | `create-order` |
| 查看结果 | 订单状态、取餐码 / 取餐柜 / 配送信息，自动刷新，可取消待支付订单 | `query-order` 轮询、`cancel-order`，在原界面更新 |

## 它是怎么作为 MCP App 工作的

```
宿主（Claude 等）  ──MCP──▶  本服务（server/）  ──JSON-RPC + Bearer Token──▶  https://mcp.mcd.cn
     ▲                          │
     │  ui://mcd-order/index.html（React 打包成的单文件页面）
     └── 在沙箱 iframe 中渲染，界面通过 app.callServerTool 回调本服务的工具
```

- **界面随服务下发**。服务注册了 `ui://mcd-order/index.html` 这个 UI 资源，入口工具 `mcd-order` 带 `_meta.ui` 指向它；宿主拿到后在沙箱 iframe 里渲染。
- **交互不占对话轮次**。界面直接用 `app.callServerTool` 调用本服务的工具，查门店、翻菜单、算价这些都不用经过模型。
- **下单必须由人点击**。`delivery-create-address`、`create-order`、`cancel-order` 声明为 `visibility: ["app"]`，只有界面能调用，模型无法替用户下单。
- **模型仍然看得见状态**。界面通过 `updateModelContext` 把当前门店、购物车、订单状态同步回模型，方便继续对话。
- **跟随宿主外观与尺寸**。主题、语言、容器尺寸都来自宿主的 host context；容器宽度达到 860px 时，菜单切换为「分类 + 卡片网格 + 右侧购物车栏」的宽屏布局。
- **对不支持界面的宿主也可用**。工具的 `content` 里同时给出文本摘要和 JSON，`structuredContent` 里是归一化后的结构。

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

Token 只在服务端使用，不会出现在界面或模型上下文里。

## 其他接入方式

**Claude Desktop 本地 stdio**，指向已构建的文件：

```json
{
  "mcpServers": {
    "mcd-order": {
      "command": "node",
      "args": ["/绝对路径/mcd-mcp/dist/server/main.js", "--stdio"],
      "env": { "MCD_MCP_TOKEN": "你的Token" }
    }
  }
}
```

**远程 HTTP 连接器**，先把服务暴露到公网，再在 设置 → Connectors → Add custom connector 填入地址：

```bash
npm start
npx cloudflared tunnel --url http://localhost:3001   # 连接器地址填 https://xxx.trycloudflare.com/mcp?token=你的Token
```

`MCD_MCP_TOKEN` 只在 stdio 模式生效。HTTP 模式是给部署用的，每个请求必须自带调用方自己的 Token，按 请求头 `x-mcd-token` → 查询参数 `?token=` → `Authorization: Bearer` 的顺序读取，不会回退到环境变量：否则任何能访问到服务的人都会用部署者的麦当劳账号下单、查看配送地址。Claude 的自定义连接器只能填地址，所以把 Token 放在 `?token=` 里；能设置请求头的客户端优先用请求头，`?token=` 会出现在隧道、代理和访问日志里。

## 从源码运行

```bash
npm install
npm run build                              # 打包界面 + 编译服务端

npm start                                  # Streamable HTTP，默认 http://localhost:3001/mcp，Token 由每个请求自带
MCD_MCP_TOKEN=你的Token npm run start:stdio
MCD_MOCK=1 npm start                       # 模拟数据

npm run dev                                # 界面监听打包 + 服务端热重启
```

环境变量见 [.env.example](.env.example)：`MCD_MCP_TOKEN`、`PORT`、`MCD_MOCK`、`MCD_MCP_URL`（可选，默认 `https://mcp.mcd.cn`）。

不经过宿主调试时，MCP Apps 官方仓库自带一个测试宿主：

```bash
git clone --depth 1 https://github.com/modelcontextprotocol/ext-apps.git
cd ext-apps/examples/basic-host && npm install
SERVERS='["http://localhost:3001/mcp?token=你的Token"]' npm start   # 打开 http://localhost:8080，选 mcd-order 点 Call Tool；MCD_MOCK=1 时不用带 Token
```

想核对官方接口的原始返回：

```bash
MCD_MCP_TOKEN=你的Token npm run probe -- query-nearby-stores '{"searchType":1,"beType":1}'
```

## 许可证

[MIT](LICENSE)。本项目的代码以 MIT 授权；麦当劳的商标与品牌资产不在此授权范围内。
