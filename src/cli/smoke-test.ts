/**
 * 冒烟测试：验证骨架完整性（不依赖 LLM API key）
 *
 * 验证项：
 *   1. PI 包 import 链通
 *   2. manifest 加载（坊主 + 各角色）
 *   3. 工具注册表
 *   4. CLI 执行器注册
 *   5. 角色工具工厂（把角色包装成 tool）
 *
 * 用法: npx tsx src/cli/smoke-test.ts
 */

import 'dotenv/config';
import { createFangZhuSession } from '../orchestrator/fang-zhu.js';
import { ensureInitialized } from '../bootstrap.js';
import { loadManifest, loadPersona, listRoleCodes } from '../manifests/loader.js';
import { getTools } from '../tools/registry.js';
import { getCliExecutor } from '../runner/cli-backend.js';
import { createAllRoleTools } from '../runner/role-tools.js';

console.log('═══ 观天驿骨架冒烟测试 ═══\n');

// 1. 角色 manifest 加载
console.log('[1] 角色 manifest 加载');
const codes = listRoleCodes();
console.log(`    已定义角色: ${codes.join(', ')}`);
for (const code of codes) {
  const m = loadManifest(code);
  const persona = loadPersona(code, m);
  console.log(`    ✓ ${m.name}(${code}) backend=${m.backend} model=${m.model.provider}/${m.model.model} persona=${persona.length}字`);
}

// 2. 工具注册
console.log('\n[2] 工具注册');
ensureInitialized();
const tools = getTools();
console.log(`    已注册工具: ${[...tools.keys()].join(', ')}`);

// 3. CLI 执行器注册
console.log('\n[3] CLI 执行器');
for (const name of ['claude-code', 'codex']) {
  const exec = getCliExecutor(name);
  console.log(`    ${exec ? '✓' : '✗'} ${name}`);
}

// 4. 角色工具工厂
console.log('\n[4] 角色工具（agent-as-tool）');
const roleTools = createAllRoleTools(['fang-zhu']);
console.log(`    坊主挂载了 ${roleTools.length} 个角色工具:`);
for (const t of roleTools) {
  console.log(`    ✓ ${t.name} — ${t.label}`);
}

// 5. 坊主会话创建（到 getModel，不调 LLM）
console.log('\n[5] 坊主会话创建');
try {
  const session = await createFangZhuSession();
  const toolCount = session.agent.state.tools.length;
  console.log(`    ✓ 坊主 Agent 已就绪，挂载 ${toolCount} 个工具`);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.log(`    ✗ ${msg}`);
  console.log('    （若为模型未注册/API key 问题，属预期，骨架本身 OK）');
}

console.log('\n═══ 冒烟测试完成 ═══');
