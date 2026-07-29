/**
 * CLI 交互入口：与坊主对话的 REPL（带实时进度）
 *
 * 用法: npm run chat
 *
 * 启动后进入交互式对话，用户输入需求，坊主自主调度角色完成。
 * 后台每一步（调用哪个角色、完成与否）实时显示进度，不再是黑盒。
 * 输入 :quit 或 Ctrl+C 退出。
 */

import 'dotenv/config';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import process from 'node:process';
import { createFangZhuSession } from '../orchestrator/fang-zhu.js';
import { createProgressHandler } from './progress.js';

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════');
  console.log('  观天驿 Skywatch Courier · 坊主');
  console.log('  风声雨声读书声声声入耳');
  console.log('  家事国事天下事事事关心');
  console.log('═══════════════════════════════════════════════');
  console.log('正在唤醒坊主与各司人员…');

  let session;
  try {
    // 挂载进度处理器：实时显示坊主调用了哪个角色、流式回复
    session = await createFangZhuSession({
      onEvent: createProgressHandler(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n[启动失败] ${msg}`);
    console.error('\n常见原因：');
    console.error('  1. 缺少 API key（需在 .env 设置 SKYCOURIER_API_KEY）');
    console.error('  2. manifest 或 persona 文件缺失');
    process.exit(1);
  }

  console.log('\n坊主已在堂，请问有何吩咐？（输入 :quit 退出）\n');

  const rl = readline.createInterface({ input, output });

  while (true) {
    const userInput = await rl.question('你 > ').catch(() => null);
    if (userInput === null) break; // EOF

    const trimmed = userInput.trim();
    if (!trimmed) continue;
    if (trimmed === ':quit' || trimmed === ':q' || trimmed === 'exit') break;

    // 进度由 progress handler 实时输出（工具调用 + 流式文本）
    process.stdout.write('\n坊主 > ');
    try {
      // chat 返回的是最终完整回复，但流式文本已由 handler 逐字输出，
      // 这里不再重复打印；仅处理无流式输出的兜底情况
      await session.chat(trimmed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`\n[执行出错] ${msg}`);
    }
    process.stdout.write('\n\n');
  }

  console.log('\n驿馆打烊，后会有期。');
  rl.close();
}

await main();
