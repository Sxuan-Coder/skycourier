/**
 * 角色定义（Role Manifest）类型契约
 *
 * 每个角色在 manifests/roles/<roleCode>/ 下定义一份 manifest，
 * 描述"这个角色是谁、会用什么工具、配什么模型"。
 *
 * 运行时由 Agent Runner 读取，实例化为一个 PI Agent 或 CLI 调用。
 */

/**
 * 角色完整定义。
 *
 * 对应磁盘结构：
 *   manifests/roles/<roleCode>/
 *   ├── manifest.json    ← 本类型
 *   ├── persona.md       ← 人设（systemPrompt 来源）
 *   └── skills/          ← SKILL.md 技能集（PI harness 原生加载）
 */
export interface RoleManifest {
  /** 角色代号，与目录名一致，如 'jian-tian' */
  roleCode: string;
  /** 角色中文名，如 "监天" */
  name: string;
  /** 体系归属 */
  faction: AgentFaction;
  /** 一句话职能描述 */
  responsibility: string;
  /** 执行后端 */
  backend: AgentBackend;
  /** LLM provider + 模型（PI 后端使用） */
  model: ModelRef;
  /** 挂载工具清单（工具名，对应 src/tools/ 导出） */
  tools: string[];
  /** 技能目录（相对 manifest 的路径，PI harness 加载 SKILL.md） */
  skills?: string[];
  /** 思考强度（PI Agent 配置） */
  thinkingLevel?: ThinkingLevel;
  /** 节点超时（秒） */
  timeoutSec?: number;
  /** 人设文件（相对 manifest 的路径，默认 persona.md） */
  personaFile?: string;
  /** CLI 后端配置（backend='cli' 时必填） */
  cliConfig?: CliBackendConfig;
}

/** 体系归属。 */
export type AgentFaction = 'guantian' | 'yizhan' | 'ops';

/** 执行后端（与 WorkflowNode.backend 同义，manifest 层冗余声明便于单角色独立运行）。 */
export type AgentBackend = 'pi' | 'cli';

/**
 * 模型引用。provider/model 对应 pi-ai 的 provider 体系。
 */
export interface ModelRef {
  /** pi-ai provider，如 'anthropic' / 'openai' / 'deepseek' / 'openrouter' */
  provider: string;
  /** 模型 id，如 'claude-sonnet-4-6' / 'gpt-4o' */
  model: string;
}

/** PI 思考强度档位。 */
export type ThinkingLevel =
  | 'off'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max';

/** CLI 后端的额外配置（backend='cli' 时使用）。 */
export interface CliBackendConfig {
  /** CLI 工具：claude-code / codex / opencode / hermes */
  tool: 'claude-code' | 'codex' | 'opencode' | 'hermes';
  /** 额外 CLI 参数 */
  extraArgs?: string[];
  /** 一次性调用模式标志，如 claude-code 的 -p */
  printFlag?: string;
}
