/**
 * 角色工具工厂
 *
 * 把每个角色包装成一个 AgentTool，供坊主挂载。
 * 这是 "agent-as-tool" 模式：工具内部按角色后端派发到 PI 或 CLI 执行。
 *
 * 坊主作为 PI Agent，通过 LLM tool-calling 自主决定调用哪个角色、传什么任务。
 *
 * 工具命名：call_<roleCode>，如 call_jian_tian。
 * 工具描述用角色职能，让坊主 LLM 知道何时该调用谁。
 */

import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { RoleManifest } from '../manifests/types.js';
import { loadManifest, listRoleCodes } from '../manifests/loader.js';
import { runPiAgent } from './pi-backend.js';
import { runCliAgent } from './cli-backend.js';

/** 角色任务工具的参数 schema（提取为常量以推导 params 类型）。 */
const roleTaskSchema = Type.Object({
  task: Type.String({ description: '交给角色的具体任务描述' }),
});
type RoleTaskParams = Static<typeof roleTaskSchema>;

/**
 * 创建单个角色对应的工具。
 *
 * @param roleCode 角色代号
 * @returns 可挂载到坊主 Agent 的 AgentTool
 */
export function createRoleTool(roleCode: string): AgentTool<typeof roleTaskSchema> {
  const role = loadManifest(roleCode);
  const toolName = `call_${roleCode.replace(/-/g, '_')}`;

  return {
    name: toolName,
    label: `调用${role.name}`,
    description: buildToolDescription(role),
    parameters: roleTaskSchema,
    execute: async (_toolCallId, params: RoleTaskParams, signal) => {
      const task = params.task;
      let output: string;
      try {
        output =
          role.backend === 'cli'
            ? await runCliAgent(role, task, signal ?? undefined)
            : await runPiAgent(role, task, { signal });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text',
              text: `【${role.name} 执行失败】${msg}`,
            },
          ],
          details: { roleCode, error: msg },
        };
      }

      return {
        content: [{ type: 'text', text: output || `【${role.name} 无输出】` }],
        details: { roleCode, outputLength: output.length },
      };
    },
  };
}

/**
 * 为所有已定义角色批量生成工具。
 * 通常在创建坊主时调用，把全部角色挂载给坊主。
 *
 * @param excludeCodes 要排除的角色代号（如 'fang-zhu' 坊主自身不应作为自己的工具）
 */
export function createAllRoleTools(excludeCodes: string[] = ['fang-zhu']): AgentTool[] {
  const exclude = new Set(excludeCodes);
  return listRoleCodes()
    .filter((code) => !exclude.has(code))
    .map((code) => createRoleTool(code));
}

/**
 * 构建工具描述。融合角色名、职能、后端，让坊主 LLM 准确判断调用时机。
 */
function buildToolDescription(role: RoleManifest): string {
  const backend = role.backend === 'cli' ? '（外部 CLI 执行，重型推理）' : '';
  return `${role.name}：${role.responsibility}${backend}`;
}
