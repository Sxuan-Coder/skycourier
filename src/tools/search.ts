/**
 * 通用网页搜索工具：web_search
 *
 * 支持 DuckDuckGo（HTML 端点，无需 API Key）和 Bing 两个引擎。
 * DuckDuckGo 反爬宽松，作为默认引擎；Bing 作为备选。
 *
 * 适用于监天角色对特定话题做补充检索、伯乐角色做信源验证。
 */

import { Type, type Static } from 'typebox';
import * as cheerio from 'cheerio';
import type { AgentTool } from '@earendil-works/pi-agent-core';

// ── 共享基础设施 ──────────────────────────────────────────────

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
];

/** 随机 UA，降低被识别为爬虫的概率。 */
function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/** 简易频率限制器：保证两次请求间至少间隔 minIntervalMs。 */
class RateLimiter {
  private lastRequest = 0;
  constructor(private readonly minIntervalMs: number) {}

  async wait(): Promise<void> {
    const elapsed = Date.now() - this.lastRequest;
    if (elapsed < this.minIntervalMs) {
      await new Promise((r) => setTimeout(r, this.minIntervalMs - elapsed));
    }
    this.lastRequest = Date.now();
  }
}

/** 搜索结果统一结构。 */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  /** 结果来源引擎。 */
  engine: 'duckduckgo' | 'bing';
}

// ── DuckDuckGo（HTML 端点，无需 API Key） ─────────────────────

const ddgLimiter = new RateLimiter(2000);

/**
 * DuckDuckGo HTML 搜索。
 *
 * 端点 https://html.duckduckgo.com/html/ 返回纯 HTML，
 * 结果链接经过 DDG 跳转包装（/l/?uddg=ENCODED_URL），需解码还原。
 */
async function searchDuckDuckGo(query: string, maxResults: number): Promise<SearchResult[]> {
  await ddgLimiter.wait();

  const url = new URL('https://html.duckduckgo.com/html/');
  url.searchParams.set('q', query);
  url.searchParams.set('kp', '-2'); // 关闭安全搜索

  const res = await fetch(url, {
    headers: {
      'User-Agent': randomUA(),
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
    },
    redirect: 'follow',
  });

  if (!res.ok) {
    throw new Error(`DuckDuckGo 返回 ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  for (const el of $('.result, .web-result').toArray()) {
    if (results.length >= maxResults) break;

    const $el = $(el);
    const $link = $el.find('.result__a').first();
    const title = $link.text().trim();
    const rawHref = $link.attr('href') || '';
    const snippet = $el.find('.result__snippet').text().trim();

    // DDG 链接格式: //duckduckgo.com/l/?uddg=ENCODED_URL&...  →  解码出真实 URL
    const url = extractDdgUrl(rawHref);
    if (!title || !url) continue;

    results.push({ title, url, snippet: snippet || title, engine: 'duckduckgo' });
  }

  return results;
}

/** 从 DuckDuckGo 跳转链接中提取真实 URL。 */
function extractDdgUrl(href: string): string {
  // 形如 //duckduckgo.com/l/?uddg=https%3A%2F%2F... 或 /l/?uddg=...
  try {
    const parsed = new URL(href.startsWith('//') ? `https:${href}` : href);
    const uddg = parsed.searchParams.get('uddg');
    return uddg ?? href;
  } catch {
    // 如果不是跳转链接，直接返回原值（已经是真实 URL 的情况）
    return href;
  }
}

// ── Bing 搜索 ────────────────────────────────────────────────

const bingLimiter = new RateLimiter(3000);

/**
 * Bing 网页搜索。
 *
 * 端点 https://www.bing.com/search 返回 HTML，
 * 结果在 li.b_algo 结构中，链接为直接 URL。
 */
async function searchBing(query: string, maxResults: number): Promise<SearchResult[]> {
  await bingLimiter.wait();

  const url = new URL('https://www.bing.com/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(maxResults));
  url.searchParams.set('setlang', 'en-US');

  const res = await fetch(url, {
    headers: {
      'User-Agent': randomUA(),
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
    },
    redirect: 'follow',
  });

  if (!res.ok) {
    throw new Error(`Bing 返回 ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  for (const el of $('li.b_algo').toArray()) {
    if (results.length >= maxResults) break;

    const $el = $(el);
    const $link = $el.find('h2 a').first();
    const title = $link.text().trim();
    const href = $link.attr('href') || '';
    // snippet 在 .b_caption p 或 p[class^=b_lineclamp]
    const snippet = $el.find('.b_caption p, p[class*="b_lineclamp"]').first().text().trim();

    if (!title || !href) continue;

    results.push({ title, url: href, snippet: snippet || title, engine: 'bing' });
  }

  return results;
}

// ── 聚合搜索 ─────────────────────────────────────────────────

/** 引擎 → 搜索函数映射，便于按名分派。 */
const ENGINES = {
  duckduckgo: searchDuckDuckGo,
  bing: searchBing,
} as const;

/** 将搜索结果列表格式化为 Agent 易读的文本。 */
function formatResults(results: SearchResult[]): string {
  if (results.length === 0) return '（无搜索结果）';
  return results
    .map((r, i) => {
      const lines = [`[${i + 1}] ${r.title}`];
      if (r.snippet && r.snippet !== r.title) lines.push(`    摘要：${r.snippet}`);
      lines.push(`    链接：${r.url}`);
      lines.push(`    引擎：${r.engine}`);
      return lines.join('\n');
    })
    .join('\n\n');
}

// ── 工具定义 ─────────────────────────────────────────────────

const webSearchSchema = Type.Object({
  query: Type.String({ description: '搜索关键词' }),
  maxResults: Type.Optional(
    Type.Integer({ minimum: 1, maximum: 30, description: '最大结果数，默认 10' }),
  ),
  engine: Type.Optional(
    Type.Union([Type.Literal('duckduckgo'), Type.Literal('bing')], {
      description: '搜索引擎：duckduckgo（默认）或 bing',
    }),
  ),
});
type WebSearchParams = Static<typeof webSearchSchema>;

export const webSearchTool: AgentTool<typeof webSearchSchema> = {
  name: 'web_search',
  label: '网页搜索',
  description:
    '通用网页搜索工具。支持 DuckDuckGo（默认）和 Bing 两个引擎，无需 API Key。返回标题、摘要、链接列表。适用于对特定话题做补充检索或信源验证。',
  parameters: webSearchSchema,
  execute: async (_toolCallId, params: WebSearchParams) => {
    const engine = params.engine ?? 'duckduckgo';
    const maxResults = params.maxResults ?? 10;

    const searchFn = ENGINES[engine];
    const results = await searchFn(params.query, maxResults);
    const text = formatResults(results);

    return {
      content: [
        {
          type: 'text',
          text: `搜索「${params.query}」(${engine})，返回 ${results.length} 条结果：\n\n${text}`,
        },
      ],
      details: {
        query: params.query,
        engine,
        count: results.length,
        results,
      },
    };
  },
};