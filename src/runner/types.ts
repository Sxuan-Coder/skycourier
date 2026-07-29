/**
 * Agent Runner 统一抽象类型契约
 *
 * 参考 ShrimpCrab agent-runner.service.ts 的统一 Runner 思路，
 * 适配观天驿的 "PI 后端 + CLI 后端" 双后端模型。
 *
 * Runner 是编排层（Executor）和具体执行之间的唯一边界：
 *   Executor 不知道 PI/CLI 的存在，只知道 Runner.execute()。
 *
 * 详见 docs/architecture/架构设计文档.md 第三章。
 */

import type { RoleManifest } from '../manifests/types.js';

/**
 * Runner 统一接口。所有后端（PI / CLI）都实现此接口。
 *
 * Executor 对每个 agent 节点调用：
 *   const output = await runner.execute(roleManifest, input, context)
 */
export interface AgentRunner {
  /**
   * 执行一个角色节点。
   *
   * @param role  角色定义（含人设、工具、模型）
   * @param input 上游传递的输入（handoff 文件内容 + 上游输出文本）
   * @param ctx   运行上下文（工作区路径、执行 id 等）
   * @returns     节点输出（文本 + 产出文件清单）
   */
  execute(role: RoleManifest, input: NodeInput, ctx: RunContext): Promise<NodeOutput>;
}

/**
 * 节点输入。由 Executor 从上游已激活出边拼接而成。
 *
 * 参考 ShrimpCrab buildNodeInput() 的拼接格式：
 *   ## [上游节点 Label]
 *   [上游节点输出]
 *   ### Handoff files
 *   - [文件清单]
 */
export interface NodeInput {
  /** 拼接后的上游文本（所有上游节点输出 + 提示） */
  prompt: string;
  /** handoff 文件清单（绝对路径） */
  handoffFiles: string[];
}

/**
 * 节点输出。
 */
export interface NodeOutput {
  /** 节点输出文本 */
  text: string;
  /** 本节点产出文件清单（绝对路径） */
  artifacts: string[];
  /** 是否出错（true 时 Executor 决定是否重试） */
  isError?: boolean;
}

/**
 * 运行上下文。Executor 透传给 Runner。
 */
export interface RunContext {
  /** 执行 id */
  executionId: string;
  /** 节点 id */
  nodeId: string;
  /** 共享工作区根路径（handoff/ deliverables/ 都在此下） */
  workspacePath: string;
  /** AbortSignal，用于取消执行 */
  signal?: AbortSignal;
}

/**
 * Runner 注册表。按后端类型注册实现，Executor 按 node.backend 派发。
 *
 *   const runners: Record<AgentBackend, AgentRunner> = {
 *     pi:  new PiBackend(...),
 *     cli: new CliBackend(...),
 *   };
 */
export type RunnerRegistry = {
  pi: AgentRunner;
  cli: AgentRunner;
};
