/**
 * 通用 PI 后端
 *
 * 观天驿的核心执行单元：读角色 manifest → 创建并运行一个 PI Agent → 返回输出。
 *
 * 任何调用方（坊主角色工具、CLI、定时任务）都通过 runPiAgent() 复用本后端。
 * PI SDK 姿势已逐字核对 @earendil-works/pi-agent-core 0.82.1 源码。
 *
 * 详见 docs/architecture/架构设计文档.md 第二章。
 */

import { Agent, type AgentTool } from '@earendil-works/pi-agent-core';
import { createModels, type Models } from '@earendil-works/pi-ai';
import type { RoleManifest } from '../manifests/types.js';
import { loadPersona } from '../manifests/loader.js';
import { getTools } from '../tools/registry.js';
import { createSkycourierProvider } from './custom-provider.js';
import { ensureInitialized } from '../bootstrap.js';

// ─── 模型注册（懒加载单例）──────────────────────────────────────

let _models: Models | null = null;

/**
 * 获取已注册 provider 的 Models 实例（单例）。
 *
 * 注册自定义 SkyCourier provider（Anthropic 协议兼容端点）。
 * 所有角色 manifest 的 model.provider 应填 'skycourier'。
 */
function getModels(): Models {
  if (_models) return _models;
  const models = createModels();
  models.setProvider(createSkycourierProvider());
  _models = models;
  return models;
}

// ─── 从 agent state 回收最终输出 ────────────────────────────────

/**
 * 从 agent.state.messages 末尾取最后一条 assistant 消息的文本。
 *
 * PI 的 prompt() 返回 void，输出需从 state 自行回收。
 * 末尾消息应为 assistant（含 tool calling 完成后的最终回复）。
 */
function extractOutput(messages: Agent['state']['messages']): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;
    // assistant content 是 (TextContent | ImageContent)[]，拼接所有文本块
    const text = msg.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map((c) => c.text)
      .join('');
    if (text.trim()) return text;
  }
  return '';
}

// ─── 公共 API ───────────────────────────────────────────────────

export interface RunPiAgentOptions {
  /** 透传给角色的工具（覆盖 manifest.tools 的解析，用于坊主注入共享工具） */
  tools?: AgentTool[];
  /** AbortSignal */
  signal?: AbortSignal;
}

/**
 * 运行一个 PI 角色并返回其文本输出。
 *
 * @param role    角色定义（来自 manifest）
 * @param task    交给角色的任务描述
 * @param options 可选：自定义工具、取消信号
 * @returns       角色最终输出的文本
 *
 * @example
 * const role = loadManifest('jian-tian');
 * const out = await runPiAgent(role, '采集今日 AI 信源');
 */
export async function runPiAgent(
  role: RoleManifest,
  task: string,
  options?: RunPiAgentOptions,
): Promise<string> {
  // 0. 确保全局工具注册表就绪（幂等）
  ensureInitialized();

  // 1. 获取模型
  const models = getModels();
  const model = models.getModel(role.model.provider, role.model.model);
  if (!model) {
    throw new Error(
      `模型未注册: provider=${role.model.provider}, model=${role.model.model}。` +
        `请在 pi-backend 的 getModels() 中注册对应 provider。`,
    );
  }

  // 2. 加载人设作为 systemPrompt
  const systemPrompt = loadPersona(role.roleCode, role);

  // 3. 装配工具：优先用 options.tools，否则按 manifest.tools[] 从注册表查
  const tools = options?.tools ?? resolveManifestTools(role);

  // 4. 实例化 Agent
  const agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      tools,
      thinkingLevel: role.thinkingLevel ?? 'off',
    },
    streamFn: models.streamSimple.bind(models),
  });

  // 5. 执行（prompt 返回 void）
  await agent.prompt(task, undefined);

  // 6. 回收输出
  return extractOutput(agent.state.messages);
}

/**
 * 按 manifest.tools[] 名字从工具注册表解析工具实例。
 * 找不到的工具名跳过并警告（不阻断）。
 */
function resolveManifestTools(role: RoleManifest): AgentTool[] {
  const registry = getTools();
  const resolved: AgentTool[] = [];
  for (const toolName of role.tools) {
    const tool = registry.get(toolName);
    if (tool) {
      resolved.push(tool);
    } else {
      console.warn(`[pi-backend] 角色 ${role.roleCode} 的工具 "${toolName}" 未注册，已跳过`);
    }
  }
  return resolved;
}

/** 暴露 getModels 供坊主入口复用同一个 Models 实例。 */
export { getModels as getPiModels };
