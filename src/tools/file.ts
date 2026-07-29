/**
 * 文件工具：file_read / file_write
 *
 * 角色读写工作区文件（handoff 文件、产物）的基础能力。
 * 所有节点都要用：监天写 raw-items、伯乐读 raw 写 curated、卖报翁读 curated 写 brief…
 */

import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { registerTools } from './registry.js';

// schema 定义在前面，让泛型能正确推导 params 类型
const readFileSchema = Type.Object({
  path: Type.String({ description: '文件路径' }),
});
type ReadFileParams = Static<typeof readFileSchema>;

export const fileReadTool: AgentTool<typeof readFileSchema> = {
  name: 'file_read',
  label: '读文件',
  description: '读取一个文本文件的完整内容。path 为绝对路径或相对工作区的路径。',
  parameters: readFileSchema,
  execute: async (_toolCallId, params: ReadFileParams) => {
    const content = readFileSync(params.path, 'utf-8');
    return {
      content: [{ type: 'text', text: content }],
      details: { path: params.path, size: content.length },
    };
  },
};

const writeFileSchema = Type.Object({
  path: Type.String({ description: '文件路径' }),
  content: Type.String({ description: '要写入的文本内容' }),
});
type WriteFileParams = Static<typeof writeFileSchema>;

export const fileWriteTool: AgentTool<typeof writeFileSchema> = {
  name: 'file_write',
  label: '写文件',
  description: '将文本内容写入文件（覆盖）。目录不存在会自动创建。',
  parameters: writeFileSchema,
  execute: async (_toolCallId, params: WriteFileParams) => {
    mkdirSync(dirname(params.path), { recursive: true });
    writeFileSync(params.path, params.content, 'utf-8');
    return {
      content: [{ type: 'text', text: `已写入 ${params.path}（${params.content.length} 字符）` }],
      details: { path: params.path, size: params.content.length },
    };
  },
};

/** 注册文件工具到全局注册表。 */
export function registerFileTools(): void {
  registerTools([fileReadTool, fileWriteTool]);
}
