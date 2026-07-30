/**
 * 坊主编排入口
 *
 * 坊主是一个 PI Agent，挂载所有角色作为工具（agent-as-tool），
 * 以及三个编排工具（generate_workflow_dsl / modify_workflow_dsl / execute_workflow）。
 *
 * 用户与坊主对话，坊主既可以直接 tool-calling 调度角色完成情报工作，
 * 也可以通过编排工具生成、修改、执行完整的 Workflow DSL。
 *
 * 这是观天驿的核心交互模式：对话驱动 + DSL 编排双模并行。
 *
 * 详见 docs/architecture/架构设计文档.md。
 */

import { Agent, type AgentTool, type AgentEvent } from '@earendil-works/pi-agent-core';
import { loadManifest, loadPersona } from '../manifests/loader.js';
import { getPiModels } from '../runner/pi-backend.js';
import { createAllRoleTools } from '../runner/role-tools.js';
import { generateWorkflowDslTool, modifyWorkflowDslTool, executeWorkflowTool } from '../tools/orchestrator.js';
import { ensureInitialized } from '../bootstrap.js';

// ─── 坊主 Agent ─────────────────────────────────────────────────

/** 转交信号正则。 */
const TRANSFER_RE = /\[TRANSFER_TO:([a-z-]+)\]\s*(.*)/s;

/** 坊主会话句柄。持有 Agent 实例，支持多轮对话。 */
export interface FangZhuSession {
  agent: Agent;
  /**
   * 向坊主发送一条消息，返回坊主的回复。
   *
   * 返回值可能包含转交信号 `[TRANSFER_TO:xxx]`，
   * 调用方（如 chat.ts）应检测此信号并切换 session。
   */
  chat(message: string): Promise<string>;
}

export interface CreateFangZhuOptions {
  /** 额外工具（如直接给坊主挂 file_read/write） */
  extraTools?: AgentTool[];
  /**
   * 事件订阅器。传入后可接收坊主的实时事件（工具调用、流式文本等），
   * 用于终端进度展示。例如配合 cli/progress.ts 的 createProgressHandler。
   */
  onEvent?: (event: AgentEvent) => void;
}

/**
 * 创建一个坊主会话。
 *
 * 坊主挂载所有角色工具，用户通过 chat() 与之对话，
 * 坊主自主决定调用哪些角色。
 */
export async function createFangZhuSession(options?: CreateFangZhuOptions): Promise<FangZhuSession>;
/** @deprecated 用 createFangZhuSession({ extraTools }) 代替 */
export async function createFangZhuSession(extraTools?: AgentTool[]): Promise<FangZhuSession>;
export async function createFangZhuSession(
  optionsOrTools?: CreateFangZhuOptions | AgentTool[],
): Promise<FangZhuSession> {
  // 兼容旧签名（直接传 AgentTool[]）
  const options: CreateFangZhuOptions = Array.isArray(optionsOrTools)
    ? { extraTools: optionsOrTools }
    : (optionsOrTools ?? {});

  ensureInitialized();

  // 1. 加载坊主 manifest + 人设
  const role = loadManifest('fang-zhu');
  const systemPrompt = loadPersona('fang-zhu', role);

  // 2. 装配工具：所有角色工具 + 编排工具（DSL 生成/修改/执行） + 用户额外工具
  const roleTools = createAllRoleTools(['fang-zhu']);
  const orchestratorTools: AgentTool[] = [
    generateWorkflowDslTool,
    modifyWorkflowDslTool,
    executeWorkflowTool,
  ];
  const tools = [...roleTools, ...orchestratorTools, ...(options.extraTools ?? [])];

  // 3. 获取模型
  const models = getPiModels();
  const model = models.getModel(role.model.provider, role.model.model);
  if (!model) {
    throw new Error(`坊主模型未注册: ${role.model.provider}/${role.model.model}`);
  }

  // 4. 实例化坊主 Agent
  const agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      tools,
      thinkingLevel: role.thinkingLevel ?? 'medium',
    },
    streamFn: models.streamSimple.bind(models),
  });

  // 5. 注册事件订阅器（用于进度展示）
  if (options.onEvent) {
    agent.subscribe(options.onEvent);
  }

  return {
    agent,
    async chat(message: string): Promise<string> {
      await agent.prompt(message);
      // 优先检测转交信号（在 tool 结果里），有则返回信号
      const transferSignal = extractTransferSignal(agent);
      if (transferSignal) return transferSignal;
      return extractLastAssistantText(agent);
    },
  };
}

/**
 * 从 agent 消息历史中提取转交信号。
 * 扫描所有消息的文本内容，查找 `[TRANSFER_TO:xxx]` 模式。
 */
function extractTransferSignal(agent: Agent): string | null {
  const messages = agent.state.messages;
  for (let i = messages.length - 1; i >= 0; i--) {
    const content = (messages[i] as { content?: Array<{ type: string; text?: string }> }).content;
    if (!Array.isArray(content)) continue;
    const text = content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text)
      .join('');
    if (TRANSFER_RE.test(text)) return text;
  }
  return null;
}

/**
 * 从 agent state 末尾取最后一条 assistant 消息文本。
 * （与 pi-backend 的 extractOutput 同逻辑，此处独立保留以解耦）
 */
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

// ─── 单轮便捷调用 ───────────────────────────────────────────────

/**
 * 单轮对话便捷函数：创建会话 → 发一条消息 → 返回回复。
 * 内部仍走完整的 tool-calling 流程（坊主可自主调用多角色）。
 *
 * 适合无状态的一次性调用。多轮对话请用 createFangZhuSession()。
 */
export async function chatWithFangZhu(message: string): Promise<string> {
  const session = await createFangZhuSession();
  return session.chat(message);
}
