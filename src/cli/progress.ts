/**
 * 终端进度输出：把 PI Agent 事件转成人类可读的实时提示
 *
 * 解决"后台在跑但用户看不到"的体验问题。
 * 订阅坊主 Agent 事件，在终端打印：
 *   - 工具调用开始：» 正在调用 监天 …
 *   - 工具调用结束：✓ 监天 完成（1234 字）
 *   - 流式文本：坊主回复逐字输出
 *
 * 注意：角色工具（call_xxx）内部的子 agent 事件不会冒泡到坊主，
 * 所以这里看到的是"坊主调用了哪个角色"，而非角色内部细节——
 * 这正是用户最需要的调度进度。
 */

import type { AgentEvent } from '@earendil-works/pi-agent-core';
import { StreamMarkdown } from './md-renderer.js';

/** 角色工具名 → 中文名映射（call_jian_tian → 监天）。 */
const ROLE_NAME_MAP: Record<string, string> = {
  call_jian_tian: '监天',
  call_bo_le: '伯乐',
  call_xuan_ping: '玄评',
  call_mai_bao_weng: '卖报翁',
  call_ce_shi: '策士',
  call_suan_fu: '算夫',
  call_shan_fu: '缮夫',
  call_shu_li: '书吏',
  call_yi_zu: '驿卒',
  call_cha_fu: '茶夫',
};

/** 工具名转可读名。角色工具转中文名，其他工具保留原名。 */
function toolDisplayName(toolName: string): string {
  return ROLE_NAME_MAP[toolName] ?? toolName;
}

/** 终端颜色（保持轻量，不引依赖）。 */
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

/**
 * 创建一个 PI 事件处理器，输出实时进度。
 *
 * 用法：
 *   const onEvent = createProgressHandler();
 *   agent.subscribe(onEvent);
 *
 * @param verbose 是否输出坊主流式文本（默认 true）
 */
export function createProgressHandler(verbose = true) {
  const toolOutputs = new Map<string, number>(); // toolCallId → 输出长度
  let streamingReply = false; // 是否正在流式输出回复
  const md = new StreamMarkdown(); // Markdown 渲染器（跨消息复用，每条消息后 reset）

  return (event: AgentEvent) => {
    switch (event.type) {
      // ── 工具调用：核心进度信号 ──
      case 'tool_execution_start': {
        const name = toolDisplayName(event.toolName);
        const task = typeof event.args?.task === 'string' ? truncate(event.args.task, 40) : '';
        process.stdout.write(`\n  ${CYAN}» 正在调用 ${name}${task ? `：${task}` : ''}…${RESET}`);
        break;
      }

      case 'tool_execution_end': {
        const name = toolDisplayName(event.toolName);
        const len = estimateOutputLength(event.result);
        toolOutputs.set(event.toolCallId, len);
        const errTag = event.isError ? `${YELLOW}（出错）${RESET}` : '';
        const sizeTag = len > 0 ? `（${len} 字）` : '';
        process.stdout.write(`\r  ${GREEN}✓ ${name} 完成${sizeTag}${errTag}${RESET}          \n`);
        break;
      }

      // ── 流式文本：逐字输出 + Markdown 实时渲染 ──
      case 'message_update': {
        if (!verbose) break;
        const ame = event.assistantMessageEvent;
        if (ame.type === 'text_delta') {
          if (!streamingReply) {
            streamingReply = true;
            process.stdout.write('\n');
          }
          // 行缓冲渲染：完整行才输出，表格行自动缓冲
          const rendered = md.push(ame.delta);
          if (rendered) process.stdout.write(rendered);
        }
        break;
      }

      case 'message_end': {
        // assistant 消息结束：冲刷渲染器残余 + 重置
        if (event.message.role === 'assistant') {
          const remaining = md.flush();
          if (remaining) process.stdout.write(remaining + '\n');
          md.reset();
          streamingReply = false;
        }
        break;
      }

      // 其他事件静默
      default:
        break;
    }
  };
}

/** 估算工具结果的输出文本长度。 */
function estimateOutputLength(result: unknown): number {
  if (!result || typeof result !== 'object') return 0;
  const r = result as { content?: Array<{ type: string; text?: string }> };
  if (!Array.isArray(r.content)) return 0;
  return r.content
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .reduce((sum, c) => sum + (c.text?.length ?? 0), 0);
}

/** 截断文本到指定长度。 */
function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}
