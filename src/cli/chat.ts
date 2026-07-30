/**
 * CLI 交互入口：与驿馆角色对话的 REPL（带实时进度 + 斜杠命令 + 自动角色转交）
 *
 * 核心交互流：
 *   1. 用户输入消息
 *   2. 当前角色 Agent 处理（可调用工具）
 *   3. 如果 Agent 调用 transfer_to_agent → CLI 自动切换会话
 *   4. 转交后用户继续与目标角色对话，无缝衔接
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

/** 转移信号正则：[TRANSFER_TO:fang-zhu] 上下文内容 */
const TRANSFER_RE = /\[TRANSFER_TO:([a-z-]+)\]\s*(.*)/s;

/** 终端颜色。 */
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

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

/** 打印角色转移横幅。 */
function printTransferBanner(fromName: string, toName: string): void {
  console.log(`\n${MAGENTA}═══════════════════════════════════════════════${RESET}`);
  console.log(`${MAGENTA}  ✦ ${fromName} → ${toName}：角色转交${RESET}`);
  console.log(`${MAGENTA}  当前接待角色已切换${RESET}`);
  console.log(`${MAGENTA}═══════════════════════════════════════════════${RESET}\n`);
}

/** 列出当前会话挂载的工具。 */
function listTools(session: AgentSession): string {
  const tools = session.agent.state.tools;
  if (tools.length === 0) return '当前角色未挂载任何工具。';
  const lines = tools.map((t) => `  ${t.name} — ${t.label ?? ''}`.trimEnd());
  return `当前工具（${tools.length}）：\n${lines.join('\n')}`;
}

/**
 * 检测 agent 输出中是否包含转交信号。
 * 如果检测到，返回目标角色代号和上下文。
 */
function detectTransfer(
  output: string,
): { targetRoleCode: string; context: string } | null {
  const match = output.match(TRANSFER_RE);
  if (!match) return null;
  return {
    targetRoleCode: match[1],
    context: match[2].trim(),
  };
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
  const progressHandler = createProgressHandler(roleName);

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
    const userInput = await rl.question(`${CYAN}你${RESET} > `).catch(() => null);
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
          // 更新进度处理器中的角色名
          progressHandler.setRoleName(roleName);
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

    // ── 正常对话 + 自动角色转交 ──
    process.stdout.write(`${GREEN}${roleName}${RESET} > `);
    let outputText: string;
    try {
      outputText = await session.chat(trimmed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(`\n[执行出错] ${msg}`);
      outputText = '';
    }
    process.stdout.write('\n\n');

    // 检查是否需要转交
    if (outputText) {
      const transfer = detectTransfer(outputText);
      if (transfer) {
        const targetCode = transfer.targetRoleCode;
        const context = transfer.context;

        // 验证目标角色存在
        let targetName: string;
        try {
          targetName = loadManifest(targetCode).name;
        } catch {
          console.log(`[转交失败] 目标角色「${targetCode}」不存在\n`);
          continue;
        }

        // 打印转交横幅
        printTransferBanner(roleName, targetName);

        // 切换 session 到目标角色
        try {
          session = await createSession(targetCode, progressHandler);
          roleCode = targetCode;
          roleName = targetName;
          progressHandler.setRoleName(roleName);

          // 将上下文（用户原始请求 + 转交原因）作为首条消息发给新角色
          const handoffMessage = `（从小二转交）${context}\n\n请继续处理。`;
          process.stdout.write(`${GREEN}${roleName}${RESET} > `);
          await session.chat(handoffMessage);
          process.stdout.write('\n\n');
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`[转交失败] ${msg}\n`);
          // 尝试切回旧角色
          continue;
        }
      }
    }
  }

  console.log('\n驿馆打烊，后会有期。');
  rl.close();
}

await main();