/**
 * CLI 交互入口：与驿馆角色对话的 REPL（带实时进度）
 *
 * 用法:
 *   npm run chat              ← 默认跟小二聊（日常对话、通用搜索）
 *   npm run chat -- xiao-er   ← 显式指定小二
 *   npm run chat -- fang-zhu  ← 切换到坊主（调度各角色完成情报工作）
 *
 * 启动后进入交互式对话，后台每一步（工具调用、流式回复）实时显示。
 * 输入 :quit 或 Ctrl+C 退出。
 */

import 'dotenv/config';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import process from 'node:process';
import { loadManifest } from '../manifests/loader.js';
import { createAgentSession, type AgentSession } from '../orchestrator/session.js';
import { createFangZhuSession } from '../orchestrator/fang-zhu.js';
import { createProgressHandler } from './progress.js';

/** 默认对话角色。 */
const DEFAULT_ROLE = 'xiao-er';

/**
 * 根据角色创建会话。
 *
 * 坊主走专用工厂（动态装配角色工具），
 * 其他角色走通用工厂（按 manifest.tools 从 registry 解析）。
 */
async function createSession(
  roleCode: string,
  onEvent: (event: import('@earendil-works/pi-agent-core').AgentEvent) => void,
): Promise<AgentSession> {
  if (roleCode === 'fang-zhu') {
    return createFangZhuSession({ onEvent });
  }
  return createAgentSession(roleCode, { onEvent });
}

async function main(): Promise<void> {
  const roleCode = process.argv[2] ?? DEFAULT_ROLE;

  // 加载 manifest 获取角色中文名
  let roleName: string;
  try {
    roleName = loadManifest(roleCode).name;
  } catch {
    console.error(`[错误] 找不到角色 "${roleCode}"，请检查 manifests/roles/ 目录`);
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════');
  console.log(`  观天驿 Skywatch Courier · ${roleName}`);
  console.log('  风声雨声读书声声声入耳');
  console.log('  家事国事天下事事事关心');
  console.log('═══════════════════════════════════════════════');
  console.log(`正在唤醒${roleName}…`);

  let session: AgentSession;
  try {
    session = await createSession(roleCode, createProgressHandler());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n[启动失败] ${msg}`);
    console.error('\n常见原因：');
    console.error('  1. 缺少 API key（需在 .env 设置 SKYCOURIER_API_KEY）');
    console.error('  2. manifest 或 persona 文件缺失');
    process.exit(1);
  }

  console.log(`\n${roleName}已就位，请问有什么事？（输入 :quit 退出）\n`);

  const rl = readline.createInterface({ input, output });

  while (true) {
    const userInput = await rl.question('你 > ').catch(() => null);
    if (userInput === null) break; // EOF

    const trimmed = userInput.trim();
    if (!trimmed) continue;
    if (trimmed === ':quit' || trimmed === ':q' || trimmed === 'exit') break;

    // 进度由 progress handler 实时输出（工具调用 + 流式文本）
    process.stdout.write(`\n${roleName} > `);
    try {
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