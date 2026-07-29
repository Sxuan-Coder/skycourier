/**
 * CLI 后端 + 可扩展执行器接口
 *
 * 将角色任务交给外部 CLI coding agent（codex / claude code）执行。
 * 当前实现 codex + claude code 两种，其余（hermes / opencode）预留扩展接口。
 *
 * 设计：CliExecutor 接口 + 注册表。新增 CLI 工具只需：
 *   1. 实现一个 CliExecutor
 *   2. registerCliExecutor('hermes', hermesExecutor)
 * 主逻辑无需改动。
 *
 * 调用方式（已实测确认）：
 *   claude code:  claude -p "<prompt>" [--model <m>]      ← stdout 即回复
 *   codex:        codex exec "<prompt>" [-m <m>]           ← stdout 即回复
 */

import { spawn } from 'node:child_process';
import type { RoleManifest } from '../manifests/types.js';
import { loadPersona } from '../manifests/loader.js';

// ─── 执行器接口（扩展点）────────────────────────────────────────

/**
 * 单个 CLI 工具的执行器。
 * 实现此接口即可接入新的 CLI coding agent。
 */
export interface CliExecutor {
  /** 工具标识，对应 manifest.cliConfig.tool，如 'claude-code' / 'codex' */
  name: string;
  /**
   * 执行任务。
   * @param task     交给 CLI 的任务描述（已含人设前缀）
   * @param model    模型（来自 manifest.model.model，可选）
   * @param signal   取消信号
   * @returns        CLI 的 stdout 文本
   */
  execute(task: string, model?: string, signal?: AbortSignal): Promise<string>;
}

// ─── 内置执行器：claude code ────────────────────────────────────

export const claudeCodeExecutor: CliExecutor = {
  name: 'claude-code',
  async execute(task, model, signal) {
    const args = ['-p'];
    if (model) args.push('--model', model);
    // 禁用文件/执行类工具：CLI 角色只做纯文本生成（整编/锐评/研判），
    // 避免它读取当前项目文件、把任务误解为编码工作。
    // 注意：disallowedTools 接受空格分隔的单个字符串，不是多个参数
    args.push('--disallowedTools', 'Read Write Edit Bash Glob Grep');
    // task 走 stdin：避免长文本/特殊字符干扰 CLI 参数解析
    return runCliWithStdin('claude', args, task, signal);
  },
};

// ─── 内置执行器：codex ──────────────────────────────────────────

export const codexExecutor: CliExecutor = {
  name: 'codex',
  async execute(task, model, signal) {
    const args = ['exec'];
    if (model) args.push('-m', model);
    args.push(task);
    return runCli('codex', args, signal);
  },
};

// ─── 进程执行辅助 ───────────────────────────────────────────────

/**
 * 运行一个 CLI 进程，回收 stdout。
 * 标准错误输出到控制台（调试用），不混入 stdout。
 */
function runCli(command: string, args: string[], signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'inherit'],
      shell: process.platform === 'win32', // Windows 下需 shell 解析命令
    });

    let stdout = '';
    child.stdout?.setEncoding('utf-8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
    });

    child.on('error', (err) => reject(new Error(`启动 ${command} 失败: ${err.message}`)));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${command} 退出码 ${code}`));
      } else {
        resolve(stdout.trim());
      }
    });

    // 支持取消
    if (signal) {
      if (signal.aborted) child.kill('SIGTERM');
      else signal.addEventListener('abort', () => child.kill('SIGTERM'), { once: true });
    }
  });
}

/**
 * 运行 CLI 进程，通过 stdin 传入 task（避免长文本/特殊字符干扰参数解析）。
 */
function runCliWithStdin(command: string, args: string[], input: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'inherit'],
      shell: process.platform === 'win32',
    });

    let stdout = '';
    child.stdout?.setEncoding('utf-8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
    });

    child.on('error', (err) => reject(new Error(`启动 ${command} 失败: ${err.message}`)));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${command} 退出码 ${code}`));
      } else {
        resolve(stdout.trim());
      }
    });

    if (signal) {
      if (signal.aborted) child.kill('SIGTERM');
      else signal.addEventListener('abort', () => child.kill('SIGTERM'), { once: true });
    }

    // 写入 stdin 并关闭
    child.stdin?.end(input, 'utf-8');
  });
}

// ─── 执行器注册表 ───────────────────────────────────────────────

const _executors = new Map<string, CliExecutor>();

/** 注册一个 CLI 执行器。 */
export function registerCliExecutor(executor: CliExecutor): void {
  _executors.set(executor.name, executor);
}

/** 获取执行器。 */
export function getCliExecutor(name: string): CliExecutor | undefined {
  return _executors.get(name);
}

/** 注册内置执行器（claude-code + codex）。应用启动时调用。 */
export function registerBuiltinCliExecutors(): void {
  registerCliExecutor(claudeCodeExecutor);
  registerCliExecutor(codexExecutor);
}

// ─── 公共 API ───────────────────────────────────────────────────

/**
 * 运行一个 CLI 角色并返回其文本输出。
 *
 * @param role   角色定义（backend 必须为 'cli'，cliConfig.tool 决定用哪个执行器）
 * @param task   交给角色的任务描述
 * @param signal 取消信号
 * @returns      CLI 的最终输出文本
 */
export async function runCliAgent(role: RoleManifest, task: string, signal?: AbortSignal): Promise<string> {
  const toolName = role.cliConfig?.tool;
  if (!toolName) {
    throw new Error(`角色 ${role.roleCode} 是 CLI 后端但未配置 cliConfig.tool`);
  }

  const executor = getCliExecutor(toolName);
  if (!executor) {
    throw new Error(
      `CLI 执行器 "${toolName}" 未注册。已注册: ${[..._executors.keys()].join(', ')}` +
        `。新执行器请用 registerCliExecutor() 注册。`,
    );
  }

  // 人设作为系统指令前缀，让 CLI 也知道自己的角色身份
  const persona = loadPersona(role.roleCode, role);
  // 明确约束：只依据提供的素材完成任务，不要读取项目文件、不要做编码工作
  const fullTask =
    `${persona}\n\n---\n\n## 任务\n${task}\n\n---\n\n` +
    `## 重要约束\n你是观天驿的一个角色，不是编码助手。\n` +
    `请严格依据上面提供的素材完成任务，不要读取当前目录的任何文件，不要分析项目结构。\n` +
    `直接输出你的工作成果文本。`;

  return executor.execute(fullTask, role.model.model, signal);
}
