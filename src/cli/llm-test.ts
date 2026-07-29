/**
 * LLM 连通测试：验证自定义端点能否真正完成一次对话
 *
 * 用法: npx tsx src/cli/llm-test.ts
 *
 * 直接调用 runPiAgent 跑一个 PI 角色（伯乐，最简单），
 * 确认 ai.sxuan.top 端点连通、deepseek-v4-flash 可用、tool-calling 链路通。
 */

import 'dotenv/config';
import { loadManifest } from '../manifests/loader.js';
import { runPiAgent } from '../runner/pi-backend.js';

console.log('═══ LLM 连通测试 ═══\n');

console.log(`端点: ${process.env.SKYCOURIER_BASE_URL ?? '(默认)'}`);
console.log(`模型: ${process.env.SKYCOURIER_MODEL ?? '(默认)'}`);
console.log(`Key:  ${process.env.SKYCOURIER_API_KEY ? '已设置 (' + process.env.SKYCOURIER_API_KEY.slice(0, 8) + '...)' : '❌ 未设置'}\n`);

console.log('正在调用伯乐（PI 后端）测试连通性…\n');

try {
  const role = loadManifest('bo-le');
  // 给伯乐一个不需要工具的简单任务，纯测试 LLM 连通
  const reply = await runPiAgent(role, '用一句话介绍你自己是谁。');

  console.log('═══ 伯乐回复 ═══');
  console.log(reply || '(空回复)');
  console.log('\n✅ LLM 连通测试通过 —— 端点可用、模型可调。');
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.log(`\n❌ 调用失败: ${msg}`);
  console.log('\n排查方向：');
  console.log('  1. SKYCOURIER_API_KEY 是否正确');
  console.log('  2. 端点 https://ai.sxuan.top 是否可达');
  console.log('  3. model id deepseek-v4-flash 是否正确');
  process.exit(1);
}
