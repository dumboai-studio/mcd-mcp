/**
 * 直接调用官方工具并打印原始返回，用于核对字段：
 *   npm run probe -- query-nearby-stores '{"searchType":1,"beType":1}'
 *   MCD_MOCK=1 npm run probe -- query-meals '{"storeCode":"MOCK0001","beCode":"BE0001","orderType":1,"beType":1}'
 */
import { callMcdEnvelope } from "../server/mcd-client.js";

const [tool, json] = process.argv.slice(2);
if (!tool) {
  console.error("用法: npm run probe -- <tool> '<json args>'");
  process.exit(1);
}
const args = json ? (JSON.parse(json) as Record<string, unknown>) : {};
try {
  const envelope = await callMcdEnvelope(tool, args);
  console.log(JSON.stringify(envelope, null, 2));
} catch (e) {
  console.error("调用失败:", (e as Error).message);
  process.exit(2);
}
