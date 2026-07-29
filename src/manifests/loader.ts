/**
 * 角色 manifest 加载器
 *
 * 从磁盘读取 manifests/roles/<roleCode>/manifest.json 与 persona.md，
 * 供 pi-backend / cli-backend / role-tools 复用。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RoleManifest } from './types.js';

/** 项目根目录（src/manifests/loader.ts 向上两层到项目根）。 */
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** manifest 根目录。 */
const MANIFEST_ROOT = resolve(PROJECT_ROOT, 'manifests', 'roles');

/**
 * 加载角色 manifest.json。
 * @param roleCode 角色代号，如 'jian-tian'
 */
export function loadManifest(roleCode: string): RoleManifest {
  const manifestPath = resolve(MANIFEST_ROOT, roleCode, 'manifest.json');
  const raw = readFileSync(manifestPath, 'utf-8');
  const manifest = JSON.parse(raw) as RoleManifest;

  if (manifest.roleCode !== roleCode) {
    throw new Error(`manifest roleCode 不匹配: 文件=${manifest.roleCode}, 期望=${roleCode}`);
  }

  return manifest;
}

/**
 * 加载角色人设（systemPrompt 来源）。
 * 默认读 persona.md，可由 manifest.personaFile 指定。
 */
export function loadPersona(roleCode: string, manifest?: RoleManifest): string {
  const m = manifest ?? loadManifest(roleCode);
  const personaFile = m.personaFile ?? 'persona.md';
  const personaPath = resolve(MANIFEST_ROOT, roleCode, personaFile);
  return readFileSync(personaPath, 'utf-8');
}

/** 列出所有已定义的角色代号（扫描 manifest 目录）。 */
export function listRoleCodes(): string[] {
  const entries = readdirSync(MANIFEST_ROOT);
  return entries.filter((e) => {
    const stat = statSync(resolve(MANIFEST_ROOT, e));
    return stat.isDirectory();
  });
}

export { MANIFEST_ROOT, PROJECT_ROOT };
