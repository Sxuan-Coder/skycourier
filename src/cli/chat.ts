/**
 * CLI 交互入口：与驿馆角色对话的 REPL（带实时进度 + 斜杠命令）
 *
 * 用法:
 *   npm run chat              ← 默认跟小二聊（日常对话、通用搜索）
 *   npm run chat -- xiao-er   ← 显式指定小二
 *   npm run chat -- fang-zhu  ← 切换到坊主（调度各角色完成情报工作）
 *
 * REPL 内斜杠命令：
 *   /agent [名称]   切换角色（中文/英文均可，Tab 补全）
 *   /tools          列出当前角色的工具
 *   /help           显示帮助
 *   /quit           退出
 *
 * 输入 :quit 或 Ctrl+C 也可退出（向后兼容）。
 */

import 'dotenv/config';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import process from 'node:process';
import type { AgentEvent } from '@earendil-works/pi-agent-core';
import { loadManifest } from '../manifests/loader.js';
import { createAgentSession, type AgentSession } from '../orchestrator/session.js';
import { createFangZhuSession } from '../orchestrator/fang-zhu.js';
import { createProgressHandler } from './progress.js';
import { createCompleter, handleSlashCommand } from './commands.js';

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
  onEvent: (event: AgentEvent) => void,
): Promise<AgentSession> {
  if (roleCode === 'fang-zhu') {
    return createFangZhuSession({ onEvent });
  }
  return createAgentSession(roleCode, { onEvent });
}

/** 打印角色横幅。 */
function printBanner(roleName: string): void {
  console.log('═══════════════════════════════════════════════');
  console.log(`  观天驿 Skywatch Courier · ${roleName}`);
  console.log('  风声雨声读书声声声入耳');
  console.log('  家事国事天下事事事关心');
  console.log('═══════════════════════════════════════════════');
}

/** 列出当前会话挂载的工具。 */
function listTools(session: AgentSession): string {
  const tools = session.agent.state.tools;
  if (tools.length === 0) return '当前角色未挂载任何工具。';
  const lines = tools.map((t) => `  ${t.name} — ${t.label ?? ''}`.trimEnd());
  return `当前工具（${tools.length}）：\n${lines.join('\n')}`;
}

async function main(): Promise<void> {
  let roleCode = process.argv[2] ?? DEFAULT_ROLE;

  // 验证初始角色
  let roleName: string;
  try {
    roleName = loadManifest(roleCode).name;
  } catch {
    console.error(`[错误] 找不到角色 "${roleCode}"，请检查 manifests/roles/ 目录`);
    process.exit(1);
  }

  printBanner(roleName);
  console.log(`正在唤醒${roleName}…`);

  // 进度处理器（跨角色切换复用）
  const progressHandler = createProgressHandler();

  let session: AgentSession;
  try {
    session = await createSession(roleCode, progressHandler);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n[启动失败] ${msg}`);
    console.error('\n常见原因：');
    console.error('  1. 缺少 API key（需在 .env 设置 SKYCOURIER_API_KEY）');
    console.error('  2. manifest 或 persona 文件缺失');
    process.exit(1);
  }

  console.log(`\n${roleName}已就位，请问有什么事？（输入 /help 查看命令）\n`);

  // Tab 自动补全
  const rl = readline.createInterface({
    input,
    output,
    completer: createCompleter(),
  });

  while (true) {
    const userInput = await rl.question('你 > ').catch(() => null);
    if (userInput === null) break; // EOF

    const trimmed = userInput.trim();
    if (!trimmed) continue;

    // 向后兼容旧命令
    if (trimmed === ':quit' || trimmed === ':q' || trimmed === 'exit') break;

    // 斜杠命令
    if (trimmed.startsWith('/')) {
      const result = handleSlashCommand(trimmed);

      if (result.exit) break;

      if (result.switchAgent) {
        // 切换角色
        const newRoleCode = result.switchAgent;
        try {
          const newRoleName = loadManifest(newRoleCode).name;
          session = await createSession(newRoleCode, progressHandler);
          roleCode = newRoleCode;
          roleName = newRoleName;
          console.log(`\n✦ 已切换到${newRoleName}（${newRoleCode}）\n`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`\n[切换失败] ${msg}\n`);
        }
        continue;
      }

      if (result.showTools) {
        console.log(listTools(session) + '\n');
        continue;
      }

      if (result.message) {
        console.log(result.message + '\n');
        continue;
      }

      continue;
    }

    // 正常对话
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