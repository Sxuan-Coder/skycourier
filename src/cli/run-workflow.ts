/**
 * CLI: 加载并执行一个 workflow.json
 *
 * 用法: npm run run:workflow -- workflows/daily-brief.workflow.json
 *
 * 当前为骨架，仅做 DSL 校验与角色 manifest 加载演示。
 * Executor 接入后，此处接通 runner 执行链路。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import type { SkyCourierWorkflowDsl } from '../orchestrator/types.js';

function loadWorkflow(path: string): SkyCourierWorkflowDsl {
  const raw = readFileSync(resolve(path), 'utf-8');
  const dsl = JSON.parse(raw) as SkyCourierWorkflowDsl;

  if (dsl.schemaVersion !== '1.0') {
    throw new Error(`不支持的 schemaVersion: ${dsl.schemaVersion}`);
  }

  // 基础校验：节点/边一致性
  const nodeIds = new Set(dsl.nodes.map((n) => n.id));
  for (const edge of dsl.edges) {
    if (!nodeIds.has(edge.from)) throw new Error(`边 ${edge.id} 的 from 节点不存在: ${edge.from}`);
    if (!nodeIds.has(edge.to)) throw new Error(`边 ${edge.id} 的 to 节点不存在: ${edge.to}`);
  }

  return dsl;
}

async function main(): Promise<void> {
  const workflowPath = process.argv[2];
  if (!workflowPath) {
    console.error('用法: tsx src/cli/run-workflow.ts <workflow.json>');
    process.exit(1);
  }

  const dsl = loadWorkflow(workflowPath);
  console.log(`已加载工作流: ${dsl.name}`);
  console.log(`  节点数: ${dsl.nodes.length}`);
  console.log(`  边数:   ${dsl.edges.length}`);
  console.log(`  入口:   ${dsl.entryNodeId}`);
  console.log('  ── 节点 ──');
  for (const node of dsl.nodes) {
    const backend = node.backend ? ` [${node.backend}]` : '';
    const role = node.roleCode ? ` → ${node.roleCode}` : '';
    console.log(`    ${node.id}: ${node.type}${backend}${role}  (${node.label})`);
  }

  console.log('\n[骨架] Executor 待实现，暂不执行。');
}

await main();
