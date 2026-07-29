/**
 * REPL 斜杠命令系统
 *
 * 支持的命令：
 *   /agent [名称]   切换对话角色（中文/英文均可，Tab 自动补全）
 *   /tools          列出当前角色的工具
 *   /help           显示帮助
 *   /quit           退出
 *
 * 自动补全：
 *   输入 / 后按 Tab 补全命令名
 *   输入 /agent 后按 Tab 补全角色名（中英文）
 */

import { listRoleCodes, loadManifest } from '../manifests/loader.js';

// ── 命令定义 ──────────────────────────────────────────────────

/** 已注册的斜杠命令。 */
export const COMMANDS = [
  '/agent',
  '/tools',
  '/help',
  '/quit',
] as const;

/** 命令帮助文本。 */
const HELP_TEXT = [
  '可用命令：',
  '  /agent [名称]   切换对话角色（支持中文/英文，Tab 补全）',
  '  /tools          列出当前角色的工具',
  '  /help           显示此帮助',
  '  /quit           退出',
].join('\n');

// ── 角色名称映射 ──────────────────────────────────────────────

/** 单个角色的名称索引条目。 */
interface AgentEntry {
  roleCode: string;
  name: string;
  responsibility: string;
}

/** 懒加载的全部角色索引。 */
let _agentCache: AgentEntry[] | null = null;

/** 加载全部角色索引（缓存在模块级）。 */
function getAgentEntries(): AgentEntry[] {
  if (_agentCache) return _agentCache;
  _agentCache = listRoleCodes().map((code) => {
    const m = loadManifest(code);
    return {
      roleCode: m.roleCode,
      name: m.name,
      responsibility: m.responsibility,
    };
  });
  return _agentCache;
}

/** 重建缓存（切换角色后调用以刷新）。 */
export function refreshAgentCache(): void {
  _agentCache = null;
}

/**
 * 根据用户输入解析 roleCode。
 *
 * 支持的输入形式：
 * - 英文代号：fang-zhu → fang-zhu
 * - 中文名：坊主 → fang-zhu
 * - 模糊匹配：坊 → fang-zhu（仅一个匹配时直接返回）
 *
 * @returns roleCode，或 null 表示无匹配
 */
export function resolveAgentName(input: string): { roleCode: string; ambiguous?: string[] } | null {
  const entries = getAgentEntries();
  const lower = input.toLowerCase();

  // 精确匹配 roleCode
  const exactCode = entries.find((e) => e.roleCode === lower);
  if (exactCode) return { roleCode: exactCode.roleCode };

  // 精确匹配中文名
  const exactName = entries.find((e) => e.name === input);
  if (exactName) return { roleCode: exactName.roleCode };

  // 模糊匹配：roleCode 或中文名包含输入
  const fuzzy = entries.filter(
    (e) =>
      e.roleCode.includes(lower) ||
      e.name.includes(input) ||
      input.includes(e.name) ||
      lower.includes(e.roleCode),
  );

  if (fuzzy.length === 0) return null;
  if (fuzzy.length === 1) return { roleCode: fuzzy[0].roleCode };

  // 多个匹配，返回第一个并标记歧义
  return {
    roleCode: fuzzy[0].roleCode,
    ambiguous: fuzzy.map((e) => `${e.name}（${e.roleCode}）`),
  };
}

/** 格式化全部角色列表供展示。 */
export function formatAgentList(): string {
  const entries = getAgentEntries();
  const lines = entries.map(
    (e) => `  ${e.name}（${e.roleCode}）— ${e.responsibility}`,
  );
  return `可用角色：\n${lines.join('\n')}`;
}

// ── Tab 自动补全 ──────────────────────────────────────────────

/**
 * 创建 readline 自动补全器。
 *
 * 补全规则：
 * - / 开头未到空格 → 补全命令名
 * - /agent 后面 → 补全角色名（中文/英文）
 * - 其他 → 不补全
 */
export function createCompleter() {
  return (line: string): [string[], string] => {
    // /agent 后补全角色名
    if (line.startsWith('/agent ')) {
      const partial = line.slice('/agent '.length);
      const entries = getAgentEntries();

      const candidates: string[] = [];
      for (const e of entries) {
        if (e.roleCode.startsWith(partial.toLowerCase())) {
          candidates.push(`/agent ${e.roleCode}`);
        } else if (e.name.startsWith(partial)) {
          candidates.push(`/agent ${e.name}`);
        }
      }
      return [candidates, line];
    }

    // / 开头补全命令名
    if (line.startsWith('/') && !line.includes(' ')) {
      const hits = COMMANDS.filter((cmd) => cmd.startsWith(line));
      return [hits.length ? [...hits] : [...COMMANDS], line];
    }

    return [[], line];
  };
}

// ── 命令解析 ──────────────────────────────────────────────────

/** 命令处理结果。 */
export interface CommandResult {
  /** 是否是已识别的斜杠命令 */
  handled: boolean;
  /** 要切换到的角色 roleCode（仅 /agent 命令） */
  switchAgent?: string;
  /** 要显示给用户的消息 */
  message?: string;
  /** 是否退出 */
  exit?: boolean;
  /** 是否请求 /tools（需要 session 上下文，由 chat.ts 处理） */
  showTools?: boolean;
}

/**
 * 解析并处理斜杠命令。
 *
 * /tools 不在此处理（需要 session 上下文），
 * 而是返回 showTools=true 由 chat.ts 接管。
 */
export function handleSlashCommand(input: string): CommandResult {
  const trimmed = input.trim();

  // 非 / 开头，不是命令
  if (!trimmed.startsWith('/')) {
    return { handled: false };
  }

  // /quit
  if (trimmed === '/quit' || trimmed === '/q') {
    return { handled: true, exit: true };
  }

  // /help
  if (trimmed === '/help' || trimmed === '/h') {
    return { handled: true, message: HELP_TEXT };
  }

  // /tools
  if (trimmed === '/tools' || trimmed === '/t') {
    return { handled: true, showTools: true };
  }

  // /agent [name]
  if (trimmed === '/agent' || trimmed === '/a') {
    return { handled: true, message: formatAgentList() };
  }

  if (trimmed.startsWith('/agent ') || trimmed.startsWith('/a ')) {
    const nameInput = trimmed.replace(/^\/(?:agent|a)\s+/, '').trim();
    const resolved = resolveAgentName(nameInput);

    if (!resolved) {
      return { handled: true, message: `找不到角色「${nameInput}」，输入 /agent 查看全部可用角色` };
    }

    if (resolved.ambiguous) {
      return {
        handled: true,
        message: `匹配到多个角色，请更精确地指定：\n  ${resolved.ambiguous.join('\n  ')}`,
      };
    }

    return { handled: true, switchAgent: resolved.roleCode };
  }

  // 未知命令
  return { handled: true, message: `未知命令：${trimmed}\n输入 /help 查看可用命令` };
}