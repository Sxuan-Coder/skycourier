/**
 * 自定义 Anthropic 兼容 Provider
 *
 * 接入第三方 Anthropic 协议兼容端点（如 ai.sxuan.top）。
 * 复用 PI 的 anthropicMessagesApi，仅替换 baseUrl、auth 与 model 列表。
 *
 * 配置通过环境变量：
 *   SKYCOURIER_API_KEY  —— 必填，端点 API key
 *   SKYCOURIER_BASE_URL —— 端点根 URL（不含 /v1/messages，SDK 会补），默认见下
 *   SKYCOURIER_MODEL    —— 默认模型 id，默认 deepseek-v4-flash
 *
 * 原理（已核对 PI 源码）：
 *   - models.ts:482  auth.baseUrl → 写入 model.baseUrl
 *   - anthropic-messages.ts:871  stream 实现读 model.baseUrl 作为 SDK baseURL
 *   - @anthropic-ai/sdk 会自动在 baseURL 后追加 /v1/messages
 */

import { createProvider, type Provider } from '@earendil-works/pi-ai';
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy';
import type { Model } from '@earendil-works/pi-ai';

/** 默认端点根 URL（SDK 会自动追加 /v1/messages）。 */
const DEFAULT_BASE_URL = 'https://ai.sxuan.top';
/** 默认模型。 */
const DEFAULT_MODEL = 'deepseek-v4-flash';

/** 读取配置，带默认值。 */
function readConfig() {
  const apiKey = process.env.SKYCOURIER_API_KEY;
  const baseUrl = process.env.SKYCOURIER_BASE_URL ?? DEFAULT_BASE_URL;
  const modelId = process.env.SKYCOURIER_MODEL ?? DEFAULT_MODEL;
  return { apiKey, baseUrl, modelId };
}

/**
 * 构造自定义模型定义。
 * 使用 anthropic-messages api，参数参考 claude-haiku-4-5 的真实结构。
 */
function buildModel(modelId: string, baseUrl: string): Model<'anthropic-messages'> {
  return {
    id: modelId,
    name: modelId,
    api: 'anthropic-messages',
    provider: 'skycourier' as Model<'anthropic-messages'>['provider'],
    baseUrl,
    reasoning: false,
    input: ['text', 'image'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 64000,
    compat: { supportsStrictTools: true },
  };
}

/**
 * 创建自定义 Anthropic 兼容 provider。
 *
 * @throws 未设置 SKYCOURIER_API_KEY 时抛错
 */
export function createSkycourierProvider(): Provider<'anthropic-messages'> {
  const { apiKey, baseUrl, modelId } = readConfig();
  if (!apiKey) {
    throw new Error(
      '缺少 SKYCOURIER_API_KEY 环境变量。请在 .env 或环境变量中设置端点 API key。',
    );
  }

  return createProvider({
    id: 'skycourier',
    name: 'SkyCourier Endpoint',
    baseUrl,
    auth: {
      // 固定 key 认证：直接返回环境变量里的 key
      apiKey: {
        name: 'SkyCourier API key',
        login: async () => ({ type: 'api_key', key: apiKey }),
        resolve: async () => ({ auth: { apiKey }, source: 'SKYCOURIER_API_KEY' }),
      },
    },
    models: [buildModel(modelId, baseUrl)],
    api: anthropicMessagesApi(),
  });
}

/** provider id，manifest 里 model.provider 用这个值。 */
export const PROVIDER_ID = 'skycourier';

/** 当前配置的默认 model id。 */
export function getDefaultModelId(): string {
  return readConfig().modelId;
}
