/**
 * 进度输出测试：验证实时进度显示
 *
 * 用法: npx tsx src/cli/progress-test.ts
 */

import 'dotenv/config';
import { createFangZhuSession } from '../orchestrator/fang-zhu.js';
import { createProgressHandler } from './progress.js';

console.log('═══ 进度输出测试 ═══\n');

const session = await createFangZhuSession({ onEvent: createProgressHandler() });

console.log('你 > 调用监天采集今日 AI 资讯\n');
console.log('（以下为实时进度）');
console.log('----------------------------------------');

const reply = await session.chat('调用监天采集今日 AI 资讯（24h精选），把采集到的资讯要点告诉我');

console.log('\n----------------------------------------');
console.log(`\n坊主最终回复（${reply.length} 字）:`);
console.log(reply.slice(0, 800));
console.log('\n✅ 进度测试完成');
