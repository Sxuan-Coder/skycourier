/**
 * 编排工具：DSL 生成 / 修改 / 执行
 *
 * 三层降级保障：
 *   1. 远程 LLM（DeepSeek / OpenRouter API）—— 首选
 *   2. 本地 PI Agent（本地模型）—— 首次降级
 *   3. 关键词模板匹配 —— 永不失败的兜底
 *
 * 挂载到坊主 Agent 后，坊主可通过自然语言完成工作流的生成、修改和执行。
 */

import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerTools } from './registry.js';

// ─── 路径 ─────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKSPACE_DIR = resolve(PROJECT_ROOT, 'workspace');
const HANOFF_DIR = resolve(WORKSPACE_DIR, 'handoff');

// ─── DSL 类型（与 orchestrator/types.ts 同步） ────────────────────

interface SkyCourierWorkflowDsl {
  schemaVersion: '1.0';
  name: string;
  description: string;
  entryNodeId: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  execution: WorkflowExecutionConfig;
}

interface WorkflowNode {
  id: string;
  type: 'start' | 'agent' | 'condition' | 'end';
  label: string;
  roleCode?: string;
  backend?: 'pi' | 'cli';
  kind?: 'worker' | 'router' | 'aggregator' | 'judge' | 'orchestrator' | 'evaluator' | 'optimizer';
  condition?: { noSignals?: string[] };
  config?: Record<string, unknown>;
}

interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
  branch?: 'yes' | 'no';
}

interface WorkflowExecutionConfig {
  mode: 'dag' | 'state-machine';
  maxConcurrency: number;
  timeoutSec: number;
  maxIterations?: number;
}

// ─── 预定义模板 ───────────────────────────────────────────────────

interface WorkflowTemplate {
  name: string;
  keywords: string[];
  description: string;
  nodes: { id: string; role: string; label: string; kind?: string }[];
}

const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    name: '每日情报日报',
    keywords: ['日报', '简报', '今日', 'daily', '每天', '每日', '情报'],
    description: '标准情报日报流水线：采集 → 筛选 → 整编 → 归档 → 推送',
    nodes: [
      { id: 'collect', role: 'jian-tian', label: '采集资讯' },
      { id: 'filter', role: 'bo-le', label: '筛选甄别' },
      { id: 'write', role: 'mai-bao-weng', label: '整编日报' },
      { id: 'archive', role: 'shu-li', label: '归档知识库' },
      { id: 'push', role: 'yi-zu', label: '推送分发' },
    ],
  },
  {
    name: '专题研究',
    keywords: ['研究', '分析', '深度', '报告', '调研', '专题', '研报'],
    description: '深度研究流水线：采集 → 筛选 → 深度分析 → 整编报告',
    nodes: [
      { id: 'collect', role: 'jian-tian', label: '采集专题素材' },
      { id: 'filter', role: 'bo-le', label: '筛选相关素材' },
      { id: 'analyze', role: 'ce-shi', label: '深度分析研判' },
      { id: 'write', role: 'mai-bao-weng', label: '整编研究报告' },
    ],
  },
  {
    name: '带锐评的日报',
    keywords: ['锐评', '点评', '毒舌', '评论', '观点', '评价'],
    description: '采集 → 筛选 → 锐评 + 整编并行 → 归档 → 推送',
    nodes: [
      { id: 'collect', role: 'jian-tian', label: '采集资讯' },
      { id: 'filter', role: 'bo-le', label: '筛选甄别' },
      { id: 'review', role: 'xuan-ping', label: '锐评热点', kind: 'worker' },
      { id: 'write', role: 'mai-bao-weng', label: '整编日报', kind: 'worker' },
      { id: 'polish', role: 'shan-fu', label: '润色排版' },
      { id: 'archive', role: 'shu-li', label: '归档知识库' },
      { id: 'push', role: 'yi-zu', label: '推送分发' },
    ],
  },
  {
    name: '统计分析',
    keywords: ['统计', '量化', '数据', '报表', '占比', '排行', '热度'],
    description: '采集 → 筛选 → 统计分析 → 整编',
    nodes: [
      { id: 'collect', role: 'jian-tian', label: '采集数据' },
      { id: 'filter', role: 'bo-le', label: '筛选有效数据' },
      { id: 'stats', role: 'suan-fu', label: '统计分析' },
      { id: 'write', role: 'mai-bao-weng', label: '整编报表' },
    ],
  },
  {
    name: '简单问答',
    keywords: ['问答', '查询', '检索', '搜索', '问'],
    description: '简单问答：直接检索后回答，无需多节点',
    nodes: [
      { id: 'search', role: 'cha-fu', label: '检索查询' },
    ],
  },
];

/** 默认模板（无关键词匹配时使用）。 */
const DEFAULT_TEMPLATE = WORKFLOW_TEMPLATES[0]; // 每日情报日报

// ─── 工具 1：generate_workflow_dsl ────────────────────────────────

const generateDslSchema = Type.Object({
  task: Type.String({ description: '用户的任务描述，如"生成一份 AI 安全专题日报加锐评"' }),
});

type GenerateDslParams = Static<typeof generateDslSchema>;

/**
 * 三层降级 DSL 生成器。
 */
async function generateDslWithFallback(task: string): Promise<SkyCourierWorkflowDsl> {
  // 第 1 层：远程 LLM（首选）
  try {
    console.log('[orchestrator] 🥇 尝试远程 LLM 生成 DSL…');
    const dsl = await remoteLLMGenerate(task);
    if (dsl && isValidDsl(dsl)) {
      console.log('[orchestrator] ✅ 远程 LLM 生成成功');
      return dsl;
    }
    throw new Error('远程 LLM 返回无效 DSL');
  } catch (err1) {
    console.warn(`[orchestrator] 🥇 远程 LLM 失败: ${err1 instanceof Error ? err1.message : String(err1)}`);
  }

  // 第 2 层：本地 PI Agent（本地 fallback，无需联网）
  // 注意：当前 PI 依赖外部 LLM provider，严格来说仍是远程调用。
  // 待未来 PI 支持本地模型后将真正变成"本地 fallback"。
  try {
    console.log('[orchestrator] 🥈 尝试 PI Agent 生成 DSL…');
    const dsl = await piAgentGenerate(task);
    if (dsl && isValidDsl(dsl)) {
      console.log('[orchestrator] ✅ PI Agent 生成成功');
      return dsl;
    }
    throw new Error('PI Agent 返回无效 DSL');
  } catch (err2) {
    console.warn(`[orchestrator] 🥈 PI Agent 失败: ${err2 instanceof Error ? err2.message : String(err2)}`);
  }

  // 第 3 层：关键词模板匹配（永不失败）
  console.log('[orchestrator] 🥉 使用关键词模板匹配…');
  return fallbackTemplateGenerate(task);
}

/**
 * 第 1 层：远程 LLM 生成 DSL。
 * 调用 OpenRouter API（统一的 LLM 网关）。
 */
async function remoteLLMGenerate(task: string): Promise<SkyCourierWorkflowDsl | null> {
  const apiKey = process.env['OPENROUTER_API_KEY'] ?? process.env['SKYCOURIER_API_KEY'];
  if (!apiKey) throw new Error('缺少 API Key（需设置 OPENROUTER_API_KEY 或 SKYCOURIER_API_KEY）');

  const systemPrompt = readPromptTemplate();

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://github.com/skywatch-courier',
    },
    body: JSON.stringify({
      model: 'deepseek/deepseek-chat', // DeepSeek V4
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: task },
      ],
      temperature: 0.3,    // 低温度，保证结构稳定性
      max_tokens: 4000,
    }),
    signal: AbortSignal.timeout(30_000), // 30 秒超时
  });

  if (!response.ok) {
    throw new Error(`API 返回 ${response.status}: ${await response.text().catch(() => '')}`);
  }

  const data = await response.json() as { choices: { message: { content: string } }[] };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error('API 返回空内容');

  return parseDslJson(raw);
}

/**
 * 第 2 层：本地 PI Agent 生成 DSL。
 * 复用现有的 pi-backend 能力。
 */
async function piAgentGenerate(task: string): Promise<SkyCourierWorkflowDsl | null> {
  // 动态导入避免循环依赖
  const { runPiAgent } = await import('../runner/pi-backend.js');
  const { loadManifest } = await import('../manifests/loader.js');

  const systemPrompt = readPromptTemplate();

  // 用"算夫"角色——推理强度低，只做结构化的 JSON 输出
  const role = loadManifest('suan-fu');
  const output = await runPiAgent(role, `${systemPrompt}\n\n用户任务：${task}\n\n只返回 JSON，不要多余的文字。`);

  return parseDslJson(output);
}

/**
 * 第 3 层：关键词模板匹配（永不失败）。
 */
function fallbackTemplateGenerate(task: string): SkyCourierWorkflowDsl {
  const lowerTask = task.toLowerCase();

  // 按关键词匹配模板
  const matched = WORKFLOW_TEMPLATES.find((t) =>
    t.keywords.some((kw) => lowerTask.includes(kw)),
  ) ?? DEFAULT_TEMPLATE;

  console.log(`[orchestrator] 🥉 匹配模板: ${matched.name}`);

  return buildLinearDsl(matched, task);
}

/**
 * 根据模板构建线性链 DSL。
 */
function buildLinearDsl(
  template: WorkflowTemplate,
  task: string,
): SkyCourierWorkflowDsl {
  const agentNodes = template.nodes.map((n) => ({
    id: n.id,
    type: 'agent' as const,
    label: n.label,
    roleCode: n.role,
    backend: getBackendForRole(n.role),
    kind: (n.kind ?? 'worker') as 'worker',
    config: { task },
  }));

  // 构建边
  const edges = agentNodes.slice(0, -1).map((_, i) => ({
    id: `e${i + 1}`,
    from: agentNodes[i].id,
    to: agentNodes[i + 1].id,
  }));

  const allNodes: WorkflowNode[] = [
    { id: 'start', type: 'start', label: '开始' },
    ...agentNodes,
    { id: 'end', type: 'end', label: '完成' },
  ];

  const allEdges: WorkflowEdge[] = [
    { id: 'e0', from: 'start', to: agentNodes[0].id },
    ...edges,
    { id: `e${agentNodes.length + 1}`, from: agentNodes[agentNodes.length - 1].id, to: 'end' },
  ];

  return {
    schemaVersion: '1.0',
    name: template.name,
    description: `${template.description}：${task}`,
    entryNodeId: 'start',
    nodes: allNodes,
    edges: allEdges,
    execution: {
      mode: 'dag',
      maxConcurrency: 1,
      timeoutSec: 600,
    },
  };
}

// ─── 辅助函数 ─────────────────────────────────────────────────────

/** 从 JSON 字符串解析 DSL，兼容 Markdown 代码块包裹。 */
function parseDslJson(raw: string): SkyCourierWorkflowDsl | null {
  try {
    // 尝试直接解析
    return JSON.parse(raw) as SkyCourierWorkflowDsl;
  } catch {
    // 尝试提取 ```json ... ``` 代码块
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]) as SkyCourierWorkflowDsl;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** 验证 DSL 的必填字段。 */
function isValidDsl(dsl: unknown): dsl is SkyCourierWorkflowDsl {
  if (!dsl || typeof dsl !== 'object') return false;
  const d = dsl as Record<string, unknown>;
  return (
    typeof d.schemaVersion === 'string' &&
    Array.isArray(d.nodes) &&
    Array.isArray(d.edges) &&
    typeof d.entryNodeId === 'string'
  );
}

/** 读取 DSL 生成提示词模板。 */
function readPromptTemplate(): string {
  const promptPath = resolve(PROJECT_ROOT, 'src', 'prompts', 'dsl-generation.md');
  return readFileSync(promptPath, 'utf-8');
}

/** 根据角色代号返回后端类型。 */
function getBackendForRole(roleCode: string): 'pi' | 'cli' {
  const cliRoles = new Set(['xuan-ping', 'mai-bao-weng', 'ce-shi']);
  return cliRoles.has(roleCode) ? 'cli' : 'pi';
}

/** 写入文件并确保目录存在。 */
function safeWriteFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf-8');
}

/** 读取工作流 DSL 文件。 */
function readWorkflowFile(path: string): SkyCourierWorkflowDsl | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf-8');
  try {
    return JSON.parse(raw) as SkyCourierWorkflowDsl;
  } catch {
    return null;
  }
}

// ─── 导出工具 ─────────────────────────────────────────────────────

export const generateWorkflowDslTool: AgentTool<typeof generateDslSchema> = {
  name: 'generate_workflow_dsl',
  label: '生成工作流',
  description: `根据用户自然语言描述，生成观天驿 Workflow DSL JSON。
三级保障：优先调用远程 LLM → PI Agent 本地 fallback → 模板匹配兜底，始终返回有效结果。
生成的 DSL 会保存到 workspace/generated-workflow.json，可用于 execute_workflow 执行。`,
  parameters: generateDslSchema,
  execute: async (_toolCallId, params: GenerateDslParams) => {
    const dsl = await generateDslWithFallback(params.task);

    // 保存到 workspace
    const outputPath = resolve(WORKSPACE_DIR, 'generated-workflow.json');
    safeWriteFile(outputPath, JSON.stringify(dsl, null, 2));

    const nodeSummary = dsl.nodes
      .filter((n) => n.type === 'agent')
      .map((n) => `  ${n.label}（${n.roleCode}，${n.backend}）`)
      .join('\n');

    const text =
      `已生成工作流「${dsl.name}」\n` +
      `描述：${dsl.description}\n` +
      `节点（${dsl.nodes.filter((n) => n.type === 'agent').length} 个）：\n${nodeSummary}\n` +
      `模式：${dsl.execution.mode} | 最大并行：${dsl.execution.maxConcurrency}\n\n` +
      `DSL 已保存到 ${outputPath}\n` +
      `你可以让我修改它（modify_workflow_dsl）或执行它（execute_workflow）。`;

    return {
      content: [{ type: 'text', text }],
      details: { dsl, outputPath },
    };
  },
};

// ─── 工具 2：modify_workflow_dsl ───────────────────────────────────

const modifyDslSchema = Type.Object({
  instruction: Type.String({
    description:
      '修改指令，如"在卖报翁后面加一个缮夫做润色"、"删掉书吏和驿卒"、"改成并行结构"',
  }),
  dslPath: Type.Optional(
    Type.String({
      description:
        'DSL 文件路径，默认 workspace/generated-workflow.json。也可传其他路径。',
    }),
  ),
});

type ModifyDslParams = Static<typeof modifyDslSchema>;

export const modifyWorkflowDslTool: AgentTool<typeof modifyDslSchema> = {
  name: 'modify_workflow_dsl',
  label: '修改工作流',
  description: '修改已生成的工作流 DSL。支持增删节点、调整顺序、加并行结构。',
  parameters: modifyDslSchema,
  execute: async (_toolCallId, params: ModifyDslParams) => {
    const dslPath = params.dslPath ?? resolve(WORKSPACE_DIR, 'generated-workflow.json');

    const currentDsl = readWorkflowFile(dslPath);
    if (!currentDsl) {
      return {
        content: [
          {
            type: 'text',
            text: `找不到 DSL 文件：${dslPath}。请先用 generate_workflow_dsl 生成一个工作流。`,
          },
        ],
        details: { error: 'DSL_FILE_NOT_FOUND' },
      };
    }

    // 用远程 LLM 修改 DSL
    const systemPrompt =
      `你是一个工作流编排专家。修改下面的 Workflow DSL JSON 以满足用户的修改指令。\n` +
      `只返回修改后的完整 JSON，不要多余文字。不要用 Markdown 代码块包裹。\n\n` +
      `角色清单：\n` +
      `- jian-tian (监天/pi): 采集\n` +
      `- bo-le (伯乐/pi): 筛选\n` +
      `- xuan-ping (玄评/cli): 锐评\n` +
      `- mai-bao-weng (卖报翁/cli): 整编日报\n` +
      `- ce-shi (策士/cli): 深度研判\n` +
      `- suan-fu (算夫/pi): 统计\n` +
      `- shan-fu (缮夫/pi): 润色\n` +
      `- shu-li (书吏/pi): 归档\n` +
      `- yi-zu (驿卒/pi): 推送\n` +
      `- cha-fu (茶夫/pi): 问答\n\n` +
      `当前 DSL：\n${JSON.stringify(currentDsl, null, 2)}`;

    let modifiedDsl: SkyCourierWorkflowDsl | null = null;

    // 尝试远程 LLM 修改
    const apiKey = process.env['OPENROUTER_API_KEY'] ?? process.env['SKYCOURIER_API_KEY'];
    if (apiKey) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'deepseek/deepseek-chat',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: params.instruction },
            ],
            temperature: 0.3,
            max_tokens: 4000,
          }),
          signal: AbortSignal.timeout(30_000),
        });

        if (response.ok) {
          const data = await response.json() as { choices: { message: { content: string } }[] };
          const raw = data.choices?.[0]?.message?.content;
          if (raw) modifiedDsl = parseDslJson(raw);
        }
      } catch {
        // 远程失败，降级
      }
    }

    // 远程失败时做简单规则修改（降级处理）
    if (!modifiedDsl || !isValidDsl(modifiedDsl)) {
      modifiedDsl = simpleModifyDsl(currentDsl, params.instruction);
    }

    // 保存修改后的 DSL
    safeWriteFile(dslPath, JSON.stringify(modifiedDsl, null, 2));

    const agentCount = modifiedDsl.nodes.filter((n) => n.type === 'agent').length;
    const text =
      `已修改工作流「${modifiedDsl.name}」\n` +
      `节点（${agentCount} 个）：\n` +
      modifiedDsl.nodes
        .filter((n) => n.type === 'agent')
        .map((n) => `  ${n.id}: ${n.label}（${n.roleCode}）`)
        .join('\n') +
      `\n\nDSL 已保存到 ${dslPath}`;

    return {
      content: [{ type: 'text', text }],
      details: { dsl: modifiedDsl, outputPath: dslPath },
    };
  },
};

/**
 * 降级处理：用简单规则修改 DSL。
 * 支持 "加X"、"删X"、"改成X" 等关键词指令。
 */
function simpleModifyDsl(
  current: SkyCourierWorkflowDsl,
  instruction: string,
): SkyCourierWorkflowDsl {
  const lower = instruction.toLowerCase();
  const dsl = JSON.parse(JSON.stringify(current)) as SkyCourierWorkflowDsl; // deep clone

  // 处理 "删掉 X" / "删除 X"
  for (const roleName of ['书吏', '驿卒', '缮夫', '玄评', '策士', '算夫', '监天', '伯乐', '卖报翁', '茶夫']) {
    if (lower.includes(`删${roleName}`) || lower.includes(`删掉${roleName}`) || lower.includes(`删除${roleName}`)) {
      const roleMap: Record<string, string> = {
        '书吏': 'shu-li', '驿卒': 'yi-zu', '缮夫': 'shan-fu',
        '玄评': 'xuan-ping', '策士': 'ce-shi', '算夫': 'suan-fu',
        '监天': 'jian-tian', '伯乐': 'bo-le', '卖报翁': 'mai-bao-weng', '茶夫': 'cha-fu',
      };
      const roleCode = roleMap[roleName];
      if (roleCode) {
        const nodeIdsToRemove = new Set(
          dsl.nodes.filter((n) => n.roleCode === roleCode).map((n) => n.id),
        );
        dsl.nodes = dsl.nodes.filter((n) => !nodeIdsToRemove.has(n.id));
        dsl.edges = dsl.edges.filter((e) => !nodeIdsToRemove.has(e.from) && !nodeIdsToRemove.has(e.to));
        // 重连断开的边
        reconnectEdges(dsl);
      }
    }
  }

  // 处理 "加 X" / "插入 X"
  const addPatterns = [
    { keyword: '锐评', role: 'xuan-ping', label: '锐评', backend: 'cli' as const },
    { keyword: '润色', role: 'shan-fu', label: '润色排版', backend: 'pi' as const },
    { keyword: '统计', role: 'suan-fu', label: '统计分析', backend: 'pi' as const },
    { keyword: '归档', role: 'shu-li', label: '归档', backend: 'pi' as const },
    { keyword: '推送', role: 'yi-zu', label: '推送', backend: 'pi' as const },
  ];
  for (const pattern of addPatterns) {
    if (lower.includes(`加${pattern.keyword}`) || lower.includes(`添加${pattern.keyword}`)) {
      // 检查是否已存在
      const alreadyExists = dsl.nodes.some((n) => n.roleCode === pattern.role);
      if (!alreadyExists) {
        const newNodeId = pattern.role.replace(/-/g, '_');
        const newNode: WorkflowNode = {
          id: newNodeId,
          type: 'agent',
          label: pattern.label,
          roleCode: pattern.role,
          backend: pattern.backend,
          kind: 'worker',
        };
        // 在最后 agent 节点之前插入
        const lastAgentIdx = dsl.nodes.findLastIndex((n) => n.type === 'agent');
        if (lastAgentIdx >= 0) {
          dsl.nodes.splice(lastAgentIdx + 1, 0, newNode);
        } else {
          dsl.nodes.splice(dsl.nodes.length - 1, 0, newNode);
        }
        // 重建边
        rebuildEdges(dsl);
      }
    }
  }

  return dsl;
}

/** 重新连接被删除节点后断开的边。 */
function reconnectEdges(dsl: SkyCourierWorkflowDsl): void {
  const validNodeIds = new Set(dsl.nodes.map((n) => n.id));
  // 过滤掉指向不存在节点的边
  dsl.edges = dsl.edges.filter((e) => validNodeIds.has(e.from) && validNodeIds.has(e.to));
}

/** 按节点顺序重建边。 */
function rebuildEdges(dsl: SkyCourierWorkflowDsl): void {
  const agentIds = dsl.nodes.filter((n) => n.type === 'agent').map((n) => n.id);
  dsl.edges = [
    { id: 'e0', from: 'start', to: agentIds[0] },
    ...agentIds.slice(0, -1).map((id, i) => ({ id: `e${i + 1}`, from: id, to: agentIds[i + 1] })),
    { id: `e${agentIds.length}`, from: agentIds[agentIds.length - 1], to: 'end' },
  ];
}

// ─── 工具 3：execute_workflow ─────────────────────────────────────

/**
 * 执行存储在 workspace/generated-workflow.json 的 DSL。
 *
 * 执行策略：
 *   遍历 agent 节点，依次调用 role-tools 执行。
 *   每个节点的输出写入 handoff 目录，供下游读取。
 */
const executeWorkflowSchema = Type.Object({
  dslPath: Type.Optional(
    Type.String({
      description: 'DSL 文件路径，默认 workspace/generated-workflow.json',
    }),
  ),
  confirmBeforeEach: Type.Optional(
    Type.Boolean({
      description: '是否每个节点执行前确认，默认 false 自动执行',
    }),
  ),
});

type ExecuteWorkflowParams = Static<typeof executeWorkflowSchema>;

export const executeWorkflowTool: AgentTool<typeof executeWorkflowSchema> = {
  name: 'execute_workflow',
  label: '执行工作流',
  description: '执行已生成的工作流 DSL。依次调用每个角色完成任务，产出写入 handoff 目录。',
  parameters: executeWorkflowSchema,
  execute: async (_toolCallId, params: ExecuteWorkflowParams) => {
    const dslPath = params.dslPath ?? resolve(WORKSPACE_DIR, 'generated-workflow.json');
    const dsl = readWorkflowFile(dslPath);
    if (!dsl) {
      return {
        content: [{ type: 'text', text: `找不到 DSL 文件：${dslPath}。请先用 generate_workflow_dsl 生成一个工作流。` }],
        details: { error: 'DSL_FILE_NOT_FOUND' },
      };
    }

    // 确保 handoff 目录存在
    mkdirSync(HANOFF_DIR, { recursive: true });

    // 收集执行结果
    const results: { nodeId: string; label: string; output: string }[] = [];
    const errors: { nodeId: string; label: string; error: string }[] = [];

    // 按拓扑顺序依次执行 agent 节点（简单线性）
    const agentNodes = dsl.nodes.filter((n) => n.type === 'agent');
    const edgeMap = new Map(dsl.edges.map((e) => [e.from, e.to]));

    // 拓扑排序（从 start 出发）
    const sorted: WorkflowNode[] = [];
    const visited = new Set<string>();
    let current = 'start';
    while (current && !visited.has(current)) {
      visited.add(current);
      if (current !== 'start' && current !== 'end') {
        const node = agentNodes.find((n) => n.id === current);
        if (node) sorted.push(node);
      }
      const next = edgeMap.get(current);
      if (!next || visited.has(next)) break;
      current = next;
    }

    if (sorted.length === 0) {
      return {
        content: [{ type: 'text', text: '工作流中无有效的 agent 节点。' }],
        details: { dsl },
      };
    }

    // 执行每个节点
    for (const node of sorted) {
      console.log(`[executor] 执行节点: ${node.label}（${node.roleCode}）`);

      try {
        let output = '';

        if (node.backend === 'cli') {
          const { runCliAgent } = await import('../runner/cli-backend.js');
          const { loadManifest } = await import('../manifests/loader.js');
          const role = loadManifest(node.roleCode!);
          // 构建任务描述：带上前置上下文
          const context = results.length > 0
            ? `上游产出：\n${results[results.length - 1].output.slice(0, 2000)}\n\n---\n\n`
            : '';
          output = await runCliAgent(role, `${context}请完成你的任务：${node.label}。结果写入 handoff 目录。`);
        } else {
          const { runPiAgent } = await import('../runner/pi-backend.js');
          const { loadManifest } = await import('../manifests/loader.js');
          const role = loadManifest(node.roleCode!);
          const context = results.length > 0
            ? `上游产出：\n${results[results.length - 1].output.slice(0, 2000)}\n\n---\n\n`
            : '';
          output = await runPiAgent(role, `${context}请完成你的任务：${node.label}。结果写入 handoff 目录。`);
        }

        results.push({ nodeId: node.id, label: node.label, output });

        // 写入 handoff 文件
        const handoffFile = resolve(HANOFF_DIR, `${node.id}-output.md`);
        safeWriteFile(handoffFile, output);

        console.log(`[executor] ✅ ${node.label} 完成（${output.length} 字符）`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ nodeId: node.id, label: node.label, error: msg });
        console.error(`[executor] ❌ ${node.label} 失败: ${msg}`);
        // 继续执行下一个节点（不中断全流程）
      }
    }

    // 构建执行报告
    const summary = results.map((r) => `  ✅ ${r.label}（${r.output.length} 字符）`).join('\n');
    const errorSummary = errors.map((r) => `  ❌ ${r.label}: ${r.error}`).join('\n');

    const text =
      `工作流「${dsl.name}」执行完成\n\n` +
      `成功（${results.length}）：\n${summary}\n` +
      (errors.length > 0 ? `\n失败（${errors.length}）：\n${errorSummary}\n` : '') +
      `\n产出文件在 ${HANOFF_DIR}/`;

    return {
      content: [{ type: 'text', text }],
      details: { results, errors, handoffDir: HANOFF_DIR },
    };
  },
};

// ─── 工具 4：transfer_to_agent ─────────────────────────────────────

const transferToAgentSchema = Type.Object({
  targetRoleCode: Type.String({
    description: '目标角色代号：fang-zhu / xiao-er / jian-tian / bo-le / xuan-ping / mai-bao-weng / ce-shi / suan-fu / shan-fu / shu-li / yi-zu / cha-fu',
  }),
  reason: Type.String({ description: '转交原因，如"用户需要生成日报，需要坊主调度"。会被传递给目标角色作为上下文。' }),
  userRequest: Type.Optional(Type.String({ description: '用户的原始请求（如果清楚）。转交后目标角色会收到此上下文。' })),
});

type TransferToAgentParams = Static<typeof transferToAgentSchema>;

export const transferToAgentTool: AgentTool<typeof transferToAgentSchema> = {
  name: 'transfer_to_agent',
  label: '转交其他角色',
  description: '将当前会话转交给另一个角色。当你发现当前任务需要其他角色的能力时调用此工具。调用后，用户会继续与目标角色对话。',
  parameters: transferToAgentSchema,
  execute: async (_toolCallId, params: TransferToAgentParams) => {
    const context = params.userRequest
      ? `用户原始请求：${params.userRequest}\n转交原因：${params.reason}`
      : params.reason;

    return {
      content: [{
        type: 'text',
        text: `[TRANSFER_TO:${params.targetRoleCode}] ${context}`,
      }],
      details: {
        targetRoleCode: params.targetRoleCode,
        reason: params.reason,
        userRequest: params.userRequest,
      },
    };
  },
};

// ─── 注册 ─────────────────────────────────────────────────────────

export function registerOrchestratorTools(): void {
  registerTools([
    generateWorkflowDslTool,
    modifyWorkflowDslTool,
    executeWorkflowTool,
    transferToAgentTool,
  ]);
  console.log('[orchestrator] 编排工具已注册: generate_workflow_dsl, modify_workflow_dsl, execute_workflow, transfer_to_agent');
}
