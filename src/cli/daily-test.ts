/**
 * 监天采集测试：验证 aihot_fetch 工具 + PI 后端真正能采集到资讯
 *
 * 用法: npx tsx src/cli/daily-test.ts
 *
 * 让监天调用 aihot_fetch 采集今日 AI 资讯，验证工具调用链路通。
 */

import 'dotenv/config';
import { loadManifest } from '../manifests/loader.js';
import { runPiAgent } from '../runner/pi-backend.js';

console.log('═══ 监天采集测试 ═══\n');
console.log('让监天调用 aihot_fetch 采集今日 AI 资讯…\n');

try {
  const role = loadManifest('jian-tian');
  const reply = await runPiAgent(role, '采集今日精选 AI 科创资讯（24小时内），挑重点的，给我看看。');

  console.log('═══ 监天回报 ═══');
  console.log(reply.slice(0, 2000)); // 截断显示
  if (reply.length > 2000) console.log(`\n…（共 ${reply.length} 字，已截断显示）`);
  console.log('\n✅ 监天采集测试通过 —— aihot_fetch 工具调用成功，资讯已采集。');
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.log(`\n❌ 采集失败: ${msg}`);
  process.exit(1);
}
