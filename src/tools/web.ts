/**
 * Web 工具模块入口
 *
 * 包含两类工具：
 * - web_search（search.ts）：DuckDuckGo / Bing 通用网页搜索
 * - aihot_fetch（本文件）：AIHot 聚合 AI 科创资讯采集
 *
 * registerWebTools() 统一注册全部 web 类工具。
 */

import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { registerTools } from './registry.js';
import { webSearchTool } from './search.js';

const AIHOT_BASE = 'https://aihot.virxact.com';

/** AIHot items 接口的请求参数。 */
const aihotFetchSchema = Type.Object({
  mode: Type.Optional(
    Type.Union([Type.Literal('selected'), Type.Literal('all')], {
      description: "selected=精选(默认), all=公开池",
    }),
  ),
  window: Type.Optional(
    Type.Union([Type.Literal('24h'), Type.Literal('7d')], {
      description: '时间窗口，默认 24h',
    }),
  ),
  category: Type.Optional(
    Type.Union(
      [
        Type.Literal('ai-models'),
        Type.Literal('ai-products'),
        Type.Literal('industry'),
        Type.Literal('paper'),
        Type.Literal('tip'),
      ],
      { description: '分类过滤，不传则全部' },
    ),
  ),
  limit: Type.Optional(
    Type.Integer({ minimum: 1, maximum: 100, description: '条数，默认 30' }),
  ),
  keyword: Type.Optional(Type.String({ description: '关键词过滤（可选）' })),
  maxPages: Type.Optional(
    Type.Integer({ minimum: 1, maximum: 5, description: '最大翻页数，默认 1（约30条）' }),
  ),
});
type AihotFetchParams = Static<typeof aihotFetchSchema>;

/** AIHot 单条资讯（仅取需要的字段）。 */
interface AihotItem {
  id: string;
  title: string;
  originalTitle?: string;
  summary?: string;
  source: { name: string };
  links: { original?: string; aihot?: string };
  publishedAt?: string;
  category?: string;
  score?: number;
}

/** AIHot items 响应。 */
interface AihotItemsResponse {
  items: AihotItem[];
  page: { count: number; hasMore: boolean; nextCursor?: string };
}

/**
 * 调用 AIHot items 接口，支持游标翻页。
 * 返回原始 JSON（供工具格式化）。
 */
async function fetchAihotItems(params: AihotFetchParams): Promise<AihotItem[]> {
  const mode = params.mode ?? 'selected';
  const window_ = params.window ?? '24h';
  const limit = params.limit ?? 30;
  const maxPages = params.maxPages ?? 1;

  const all: AihotItem[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${AIHOT_BASE}/api/v1/items`);
    url.searchParams.set('mode', mode);
    url.searchParams.set('window', window_);
    url.searchParams.set('limit', String(limit));
    if (params.category) url.searchParams.set('category', params.category);
    if (params.keyword) url.searchParams.set('q', params.keyword);
    if (cursor) url.searchParams.set('cursor', cursor);

    const res = await fetch(url, {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`AIHot API 返回 ${res.status}: ${await res.text().catch(() => '')}`);
    }

    const data = (await res.json()) as AihotItemsResponse;
    all.push(...data.items);

    if (!data.page.hasMore || !data.page.nextCursor) break;
    cursor = data.page.nextCursor;
  }

  return all;
}

/** 将资讯列表格式化为监天易读的文本。 */
function formatItems(items: AihotItem[]): string {
  if (items.length === 0) return '（无资讯）';
  const lines = items.map((item, i) => {
    const parts = [`[${i + 1}] ${item.title}`];
    if (item.summary) parts.push(`    摘要：${item.summary}`);
    parts.push(`    来源：${item.source.name}`);
    if (item.links.original) parts.push(`    原文：${item.links.original}`);
    if (item.publishedAt) parts.push(`    时间：${item.publishedAt}`);
    if (item.category) parts.push(`    分类：${item.category}`);
    if (typeof item.score === 'number') parts.push(`    评分：${item.score}`);
    return parts.join('\n');
  });
  return lines.join('\n\n');
}

export const aihotFetchTool: AgentTool<typeof aihotFetchSchema> = {
  name: 'aihot_fetch',
  label: 'AI资讯采集',
  description:
    '从 AIHot 聚合 API 采集 AI 科创资讯（无需认证）。返回结构化资讯列表，含标题、摘要、来源、原文链接、分类、评分。支持按分类(ai-models/ai-products/industry/paper/tip)、时间窗口(24h/7d)、关键词过滤。',
  parameters: aihotFetchSchema,
  execute: async (_toolCallId, params: AihotFetchParams) => {
    const items = await fetchAihotItems(params);
    const text = formatItems(items);
    return {
      content: [
        {
          type: 'text',
          text: `已采集 ${items.length} 条 AI 资讯（AIHot ${params.mode ?? 'selected'}/${params.window ?? '24h'}）：\n\n${text}`,
        },
      ],
      details: { count: items.length, mode: params.mode, window: params.window },
    };
  },
};

/** 注册全部 web 工具到全局注册表。 */
export function registerWebTools(): void {
  registerTools([webSearchTool, aihotFetchTool]);
}
