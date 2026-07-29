/**
 * 通用 Agent 会话工厂
 *
 * 与坊主不同：坊主动态装配角色工具（agent-as-tool），
 * 而通用会话直接从 manifest.tools[] 按名查 registry 装配。
 *
 * 适用于小二等「自己干活」的角色——不需要委派，直接调工具。
 */

import { Agent, type AgentEvent, type AgentTool } from '@earendil-works/pi-agent-core';
import { loadManifest, loadPersona } from '../manifests/loader.js';
import { getTools } from '../tools/registry.js';
import { getPiModels } from '../runner/pi-backend.js';
import { ensureInitialized } from '../bootstrap.js';

/** 会话句柄：持有 Agent 实例，支持多轮对话。 */
export interface AgentSession {
  agent: Agent;
  chat(message: string): Promise<string>;
}

export interface CreateSessionOptions {
  onEvent?: (event: AgentEvent) => void;
}

/**
 * 创建一个通用 Agent 会话。
 *
 * 按 roleCode 加载 manifest + persona，
 * 从全局 registry 解析 manifest.tools[] 装配工具，
 * 返回支持多轮对话的会话句柄。
 *
 * @param roleCode 角色代号，如 'xiao-er'
 */
export async function createAgentSession(
  roleCode: string,
  options?: CreateSessionOptions,
): Promise<AgentSession> {
  ensureInitialized();

  const role = loadManifest(roleCode);
  const systemPrompt = loadPersona(roleCode, role);

  // 从 registry 按 manifest.tools[] 名字解析工具实例
  const registry = getTools();
  const tools: AgentTool[] = [];
  for (const name of role.tools) {
    const tool = registry.get(name);
    if (tool) {
      tools.push(tool);
    } else {
      console.warn(`[session] 角色 ${roleCode} 的工具 "${name}" 未注册，已跳过`);
    }
  }

  const models = getPiModels();
  const model = models.getModel(role.model.provider, role.model.model);
  if (!model) {
    throw new Error(`模型未注册: ${role.model.provider}/${role.model.model}`);
  }

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      tools,
      thinkingLevel: role.thinkingLevel ?? 'medium',
    },
    streamFn: models.streamSimple.bind(models),
  });

  if (options?.onEvent) {
    agent.subscribe(options.onEvent);
  }

  return {
    agent,
    async chat(message: string): Promise<string> {
      await agent.prompt(message);
      return extractLastAssistantText(agent);
    },
  };
}

/** 从 agent state 末尾取最后一条 assistant 消息文本。 */
function extractLastAssistantText(agent: Agent): string {
  const messages = agent.state.messages;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;
    const text = msg.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map((c) => c.text)
      .join('');
    if (text.trim()) return text;
  }
  return '';
}