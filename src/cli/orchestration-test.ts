/**
 * 坊主编排测试：验证对话驱动 + agent-as-tool 链路
 *
 * 用法: npx tsx src/cli/orchestration-test.ts
 *
 * 验证：用户 → 坊主 → tool-calling 调用角色 → 角色执行 → 结果回流。
 * 用一个不需要外部工具的简单调度场景。
 */

import 'dotenv/config';
import { createFangZhuSession } from '../orchestrator/fang-zhu.js';

console.log('═══ 坊主编排测试 ═══\n');
console.log('场景：让坊主调度伯乐做一个简单判断，验证 tool-calling 链路。\n');

try {
  const session = await createFangZhuSession();
  console.log('坊主已就绪，发送请求…\n');

  // 一个能触发坊主调用角色、又不需要外部工具的请求
  const reply = await session.chat(
    '请调用伯乐，让它判断"某AI公司发布新大模型"这条资讯算不算高价值科创情报，用一句话回答。',
  );

  console.log('═══ 坊主回复 ═══');
  console.log(reply);
  console.log('\n✅ 编排测试通过 —— 坊主成功调度角色完成协作。');
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.log(`\n❌ 编排失败: ${msg}`);
  process.exit(1);
}
