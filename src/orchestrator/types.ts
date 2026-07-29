/**
 * 观天驿 Workflow DSL 类型契约
 *
 * 参考 ShrimpCrab workflow-dsl.service.ts 的 DSL 设计，适配观天驿角色体系。
 * 一份 Workflow DSL 描述"12 个角色中的哪几个、按什么顺序、用什么后端协作完成一次任务"。
 *
 * 详见 docs/architecture/架构设计文档.md 第四章。
 */

// ─── DSL 顶层结构 ───────────────────────────────────────────────

/**
 * 一份完整的工作流定义。
 */
export interface SkyCourierWorkflowDsl {
  schemaVersion: '1.0';
  /** 工作流名，如 "每日科创情报日报" */
  name: string;
  description: string;
  /** 入口节点 id */
  entryNodeId: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  execution: WorkflowExecutionConfig;
}

/**
 * 执行参数。
 */
export interface WorkflowExecutionConfig {
  /** dag=有向无环图; state-machine=支持循环/迭代 */
  mode: 'dag' | 'state-machine';
  /** 最大并发节点数 */
  maxConcurrency: number;
  /** 整体超时（秒） */
  timeoutSec: number;
  /** 最大迭代次数（仅 state-machine，防止无限循环） */
  maxIterations?: number;
}

// ─── 节点 ──────────────────────────────────────────────────────

/**
 * 节点类型。
 * - start: 入口，接收外部触发（定时/手动）
 * - agent: 执行一个角色
 * - condition: 条件分支
 * - end: 汇总节点
 */
export type WorkflowNodeType = 'start' | 'agent' | 'condition' | 'end';

/**
 * agent 节点的协作角色（参考 ShrimpCrab kind），描述本节点在协作中的定位。
 */
export type AgentRoleKind =
  | 'worker' // 普通工作节点
  | 'router' // 路由分发
  | 'aggregator' // 汇聚上游
  | 'judge' // 评审
  | 'orchestrator' // 协调节点
  | 'evaluator' // 评估
  | 'optimizer'; // 迭代优化

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  /** 节点显示名，如 "监天" */
  label: string;
  /**
   * 关联角色代号（agent 节点必填），对应 manifests/roles/<roleCode>/。
   * @see docs/architecture/架构设计文档.md 第五章映射表
   */
  roleCode?: string;
  /** 执行后端（agent 节点必填） */
  backend?: AgentBackend;
  /** 协作角色定位（agent 节点可选） */
  kind?: AgentRoleKind;
  /** 条件分支表达式（仅 condition 节点） */
  condition?: ConditionConfig;
  /** 节点参数，透传给角色/工具 */
  config?: Record<string, unknown>;
}

/** Agent 执行后端。PI=编程式 agent 运行时; CLI=外部 coding agent 进程。 */
export type AgentBackend = 'pi' | 'cli';

/**
 * 条件分支配置。参考 ShrimpCrab 的关键词匹配评估。
 */
export interface ConditionConfig {
  /** 命中则走 'yes' 边的关键词（不通过类信号） */
  noSignals?: string[];
  /** 匹配 'yes' 时走的分支标签 */
  yesBranch?: 'yes' | 'no';
}

// ─── 边 ────────────────────────────────────────────────────────

export interface WorkflowEdge {
  id: string;
  /** 源节点 id */
  from: string;
  /** 目标节点 id */
  to: string;
  /** 条件分支标签（仅从 condition 节点发出的边） */
  branch?: WorkflowEdgeBranch;
}

export type WorkflowEdgeBranch = 'yes' | 'no';

// ─── 运行时状态 ─────────────────────────────────────────────────

export type WorkflowNodeStatus =
  | 'pending' // 等待（入边未满足）
  | 'ready' // 就绪（可执行）
  | 'running' // 执行中
  | 'succeeded' // 成功
  | 'failed' // 失败（可重试）
  | 'skipped'; // 跳过（不可达或条件分支未命中）

export type WorkflowExecutionStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'timeout';

/**
 * 一次执行的运行时状态。
 */
export interface WorkflowExecution {
  id: string;
  workflowName: string;
  status: WorkflowExecutionStatus;
  /** 各节点当前状态 */
  nodeStates: Record<string, NodeRunState>;
  /** 已激活的边 id 集合 */
  activeEdges: Set<string>;
  /** 执行事件流 */
  events: WorkflowExecutionEvent[];
  /** 最终输出 */
  finalOutput?: string;
  /** 错误信息 */
  error?: string;
  startedAt: number;
  endedAt?: number;
}

export interface NodeRunState {
  nodeId: string;
  status: WorkflowNodeStatus;
  /** 节点输出文本 */
  output?: string;
  /** 节点产出文件清单（handoff / deliverable） */
  artifacts?: string[];
  /** 已运行次数（用于 state-machine 重试/迭代计数） */
  runCount: number;
  startedAt?: number;
  endedAt?: number;
  error?: string;
}

/**
 * 执行事件类型（参考 ShrimpCrab WorkflowExecutionEvent）。
 */
export type WorkflowExecutionEventType =
  | 'execution_started'
  | 'execution_completed'
  | 'execution_failed'
  | 'node_ready'
  | 'node_started'
  | 'node_completed'
  | 'node_failed'
  | 'node_skipped'
  | 'branch_selected'
  | 'deliverable_created';

export interface WorkflowExecutionEvent {
  type: WorkflowExecutionEventType;
  nodeId?: string;
  message?: string;
  timestamp: number;
}
