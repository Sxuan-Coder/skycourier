/**
 * 工具注册表
 *
 * 全局 toolName → AgentTool 映射，供 pi-backend 按角色 manifest.tools[] 装配。
 * 工具按模块分组注册：file / web / lark / rag。
 *
 * 用法：
 *   import { registerTools, getTools } from './registry.js';
 *   registerFileTools();           // 注册文件工具
 *   const tool = getTools().get('file_read');
 */

import type { AgentTool } from '@earendil-works/pi-agent-core';

const _registry = new Map<string, AgentTool>();

/** 注册单个工具。 */
export function registerTool(tool: AgentTool): void {
  _registry.set(tool.name, tool);
}

/** 批量注册。 */
export function registerTools(tools: AgentTool[]): void {
  for (const t of tools) registerTool(t);
}

/** 获取工具实例，不存在返回 undefined。 */
export function getTool(name: string): AgentTool | undefined {
  return _registry.get(name);
}

/** 获取整个注册表（用于 pi-backend 遍历装配）。 */
export function getTools(): Map<string, AgentTool> {
  return _registry;
}

/** 注册是否包含某工具。 */
export function hasTool(name: string): boolean {
  return _registry.has(name);
}
