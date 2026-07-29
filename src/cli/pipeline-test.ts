/**
 * 完整日报链路测试：监天→伯乐→卖报翁
 *
 * 用法: npx tsx src/cli/pipeline-test.ts
 *
 * 分步手动调度三个角色，带进度日志，验证整条情报链路。
 * 不经过坊主，直接串联，便于诊断每一步。
 */

import 'dotenv/config';
import { loadManifest } from '../manifests/loader.js';
import { runPiAgent } from '../runner/pi-backend.js';
import { runCliAgent } from '../runner/cli-backend.js';

async function main() {
  console.log('═══ 完整日报链路测试 ═══\n');

  // ── 第1步：监天采集 ──
  console.log('[1/3] 监天采集今日 AI 资讯…');
  const jianTian = loadManifest('jian-tian');
  const rawItems = await runPiAgent(
    jianTian,
    '调用 aihot_fetch 采集今日精选 AI 资讯（24h，selected 模式，limit 15）。把采集到的资讯列表原样整理输出，每条含标题、来源、摘要。',
  );
  console.log(`✓ 监天完成，采集到 ${rawItems.length} 字素材\n`);

  // ── 第2步：伯乐筛选 ──
  console.log('[2/3] 伯乐筛选高价值资讯…');
  const boLe = loadManifest('bo-le');
  const curated = await runPiAgent(
    boLe,
    `以下是监天采集的原始资讯，请去重、按科创价值打分筛选，保留最有价值的 8-10 条，输出筛选结果：\n\n${rawItems}`,
  );
  console.log(`✓ 伯乐完成，筛选后 ${curated.length} 字\n`);

  // ── 第3步：卖报翁整编 ──
  console.log('[3/3] 卖报翁整编日报（CLI 后端）…');
  const maiBaoWeng = loadManifest('mai-bao-weng');
  const brief = await runCliAgent(
    maiBaoWeng,
    `以下是伯乐筛选后的资讯，请按《观天驿·AI科技日报》格式整编成今日日报：\n\n${curated}`,
  );
  console.log(`✓ 卖报翁完成，日报 ${brief.length} 字\n`);

  // ── 输出结果 ──
  console.log('═══════════════════════════════════════');
  console.log('《观天驿·AI科技日报》');
  console.log('═══════════════════════════════════════\n');
  console.log(brief);
  console.log('\n═══ 链路测试完成 ✅ ═══');
}

main().catch((err) => {
  console.error(`\n❌ 链路失败: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
