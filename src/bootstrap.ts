/**
 * 应用引导：集中注册全局工具与 CLI 执行器（幂等）
 *
 * 任何执行路径（坊主、pi-backend 直接调用、定时任务）都应先调用 ensureInitialized()，
 * 保证工具注册表就绪。幂等，重复调用安全。
 */

import { registerFileTools } from './tools/file.js';
import { registerWebTools } from './tools/web.js';
import { registerBuiltinCliExecutors } from './runner/cli-backend.js';

let _initialized = false;

/** 幂等初始化全局注册表。 */
export function ensureInitialized(): void {
  if (_initialized) return;
  registerFileTools();
  registerWebTools();
  registerBuiltinCliExecutors();
  _initialized = true;
}
