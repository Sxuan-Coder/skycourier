/**
 * 流式 Markdown 终端渲染器
 *
 * 逐行处理 text delta，输出带 ANSI 颜色的格式化文本。
 * 支持的格式：
 *   - 标题（## → 粗体青色）
 *   - 加粗（**text** → ANSI bold）
 *   - 行内代码（`code` → 绿色）
 *   - 链接（[text](url) → 下划线 text + 暗色 url）
 *   - 表格（对齐列宽 + 表头分隔线）
 *   - 代码块（``` 缩进暗色）
 *
 * 用法：
 *   const md = new StreamMarkdown();
 *   process.stdout.write(md.push(delta));   // 喂增量
 *   process.stdout.write(md.flush());        // 消息结束时冲刷残余
 *   md.reset();                              // 下一条消息前重置
 */

// ── ANSI 颜色常量 ─────────────────────────────────────────────

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const BOLD_OFF = '\x1b[22m';
const DIM = '\x1b[2m';
const UNDERLINE = '\x1b[4m';
const UNDERLINE_OFF = '\x1b[24m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';

// ── 工具函数 ──────────────────────────────────────────────────

/** 去除 Markdown 标记，返回纯文本（用于计算可见宽度）。 */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

/** 计算字符串的可见宽度（排除 ANSI 码和 Markdown 标记）。 */
function visibleWidth(text: string): number {
  return stripMarkdown(text).length;
}

/** 将文本按可见宽度右填充空格。 */
function padVisible(text: string, width: number): string {
  const vw = visibleWidth(text);
  return vw >= width ? text : text + ' '.repeat(width - vw);
}

// ── 渲染器 ────────────────────────────────────────────────────

/**
 * 流式 Markdown 渲染器。
 *
 * 内部按行缓冲：push() 积累 delta，遇到换行就处理并返回渲染结果。
 * 表格行特殊处理：缓冲到表格结束后整体渲染。
 */
export class StreamMarkdown {
  /** 未处理的文本片段（还没有遇到换行）。 */
  private buffer = '';
  /** 是否在代码块内。 */
  private inCodeBlock = false;
  /** 表格行缓冲（null=不在表格中）。 */
  private tableLines: string[] | null = null;

  /**
   * 喂入一个 text delta，返回可输出的渲染文本。
   * 返回空字符串表示内容被缓冲（如表格中间行）。
   */
  push(delta: string): string {
    this.buffer += delta;
    const output: string[] = [];

    while (true) {
      const nlIdx = this.buffer.indexOf('\n');
      if (nlIdx === -1) break;

      const line = this.buffer.slice(0, nlIdx);
      this.buffer = this.buffer.slice(nlIdx + 1);

      const rendered = this.processLine(line);
      if (rendered) output.push(rendered);
    }

    return output.join('\n') + (output.length > 0 ? '\n' : '');
  }

  /** 冲刷缓冲区中残余内容（消息结束时调用）。 */
  flush(): string {
    const parts: string[] = [];

    // 先冲刷表格
    if (this.tableLines) {
      parts.push(this.renderTable(this.tableLines));
      this.tableLines = null;
    }

    // 再冲刷残余文本
    if (this.buffer) {
      parts.push(this.processLine(this.buffer));
      this.buffer = '';
    }

    return parts.filter(Boolean).join('\n');
  }

  /** 重置状态（每条消息之间调用）。 */
  reset(): void {
    this.buffer = '';
    this.inCodeBlock = false;
    this.tableLines = null;
  }

  // ── 行级处理 ────────────────────────────────────────────────

  /** 处理一行文本，返回渲染后的字符串（可能为空）。 */
  private processLine(line: string): string {
    // 代码块围栏
    if (line.trim().startsWith('```')) {
      this.inCodeBlock = !this.inCodeBlock;
      return `${DIM}${line}${RESET}`;
    }

    // 代码块内容 — 缩进 + 暗色
    if (this.inCodeBlock) {
      return `${DIM}  ${line}${RESET}`;
    }

    // 表格行检测
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      // 进入或继续表格
      if (this.tableLines === null) this.tableLines = [];
      this.tableLines.push(line);
      return ''; // 缓冲，等表格结束再渲染
    }

    // 表格刚结束 — 先渲染表格，再处理当前行
    let tableOutput = '';
    if (this.tableLines !== null) {
      tableOutput = this.renderTable(this.tableLines) + '\n';
      this.tableLines = null;
    }

    // 标题
    const headerMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headerMatch) {
      return tableOutput + `${BOLD}${CYAN}${headerMatch[2]}${RESET}`;
    }

    // 列表项标记加色
    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)/);
    if (listMatch) {
      return tableOutput + `${listMatch[1]}${CYAN}${listMatch[2]}${RESET} ${this.renderInline(listMatch[3])}`;
    }

    // 引用块
    if (line.startsWith('>')) {
      return tableOutput + `${DIM}│ ${RESET}${this.renderInline(line.slice(1).trim())}`;
    }

    // 普通行 — 行内格式化
    return tableOutput + this.renderInline(line);
  }

  // ── 表格渲染 ────────────────────────────────────────────────

  /** 将多行 Markdown 表格渲染为对齐的终端表格。 */
  private renderTable(lines: string[]): string {
    // 解析每行的单元格
    const rows = lines.map((line) =>
      line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim()),
    );

    // 检测并跳过分隔行（|---|---|）
    let headerRow: string[];
    let dataRows: string[][];
    const sepIdx = rows.findIndex((r) => r.every((c) => /^[-:]+$/.test(c)));

    if (sepIdx === 1) {
      // 标准格式：表头 | 分隔 | 数据...
      headerRow = rows[0];
      dataRows = rows.slice(2);
    } else {
      // 无分隔行：第一行当表头
      headerRow = rows[0];
      dataRows = rows.slice(1);
    }

    if (headerRow.length === 0) return '';

    // 计算每列最大可见宽度
    const allRows = [headerRow, ...dataRows];
    const colCount = Math.max(...allRows.map((r) => r.length));
    const widths: number[] = [];
    for (let i = 0; i < colCount; i++) {
      const colCells = allRows.map((r) => r[i] || '');
      widths.push(Math.max(...colCells.map((c) => visibleWidth(c))));
    }

    // 渲染表头
    const output: string[] = [];
    const headerCells = headerRow.map((cell, i) =>
      `${BOLD}${padVisible(this.renderInlinePlain(cell), widths[i])}${RESET}`,
    );
    output.push('  ' + headerCells.join('  '));

    // 分隔线
    const sep = widths.map((w) => '─'.repeat(w)).join('  ');
    output.push('  ' + `${DIM}${sep}${RESET}`);

    // 渲染数据行
    for (const row of dataRows) {
      const cells = row.map((cell, i) =>
        padVisible(this.renderInlinePlain(cell || ''), widths[i]),
      );
      output.push('  ' + cells.join('  '));
    }

    return output.join('\n');
  }

  // ── 行内格式化 ──────────────────────────────────────────────

  /** 渲染行内 Markdown（加粗、代码、链接）。 */
  private renderInline(text: string): string {
    let r = text;

    // 链接 [text](url) → 下划线 text + 暗色 url
    r = r.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_m, label: string, url: string) =>
        `${UNDERLINE}${label}${UNDERLINE_OFF}${DIM} (${url})${RESET}`,
    );

    // 行内代码 `code` → 绿色
    r = r.replace(/`([^`]+)`/g, (_m, code: string) => `${GREEN}${code}${RESET}`);

    // 加粗 **text** → ANSI bold
    r = r.replace(/\*\*(.+?)\*\*/g, (_m, content: string) => `${BOLD}${content}${BOLD_OFF}`);

    return r;
  }

  /**
   * 行内格式化（表格单元格用）。
   * 与 renderInline 类似，但不返回 ANSI 宽度干扰的格式。
   */
  private renderInlinePlain(text: string): string {
    let r = text;

    // 链接 → 只保留 text
    r = r.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // 行内代码
    r = r.replace(/`([^`]+)`/g, (_m, code: string) => `${GREEN}${code}${RESET}`);

    // 加粗
    r = r.replace(/\*\*(.+?)\*\*/g, (_m, content: string) => `${BOLD}${content}${BOLD_OFF}`);

    return r;
  }
}