# 观天驿 Skywatch Courier · SkyCourier

> **科创情报多 Agent 集群**
>
> 风声雨声读书声声声入耳 / 家事国事天下事事事关心
>
> Sounds of wind, rain and reading, all reach my ears;
> Affairs of family, nation and the world, all claim my care.

观天驿是一座情报驿站，麾下多个拟人化 Agent 角色各司其职，协作完成
**信源采集 → 甄别筛选 → 锐评整编 → 归档分发 → 问答检索** 的科创情报全链路工作。
安坐室内，尽览行业天下动静。

---

## ✨ 项目亮点

- **12 角色 · 两大体系**：观天体系（瞭望采集 / 内容生产）+ 驿站体系（分发归档 / 知识服务），外加坊主、巡卒公共运维。
- **对话驱动 + DSL 编排双模并行**：既可与坊主自然语言对话调度角色干活，也可生成 / 修改 / 执行完整 Workflow DSL。
- **角色转交（transfer_to_agent）**：Agent 间可无缝转交会话，CLI 自动切换角色并显示角色标识。
- **流式 Markdown 终端渲染器**：长文、表格、代码块在终端流畅渲染，阅读体验友好。
- **三层降级保障**：远程 LLM → 本地模型 → 关键词模板，DSL 生成永不失败。
- **人设 + 技能 + 工具 = 角色**：基于 PI 原生范式，角色定义在 `manifests/roles/`，配置即所得。

---

## 🗂️ Agent 集群总览

### 🔭 观天体系 —— 向外瞭望、搜集情报、甄别资讯、产出内容

| 角色 | 代号 | 职能 |
|------|------|------|
| 监天 Agent | `jian-tian` | 全网信源巡检，RSS / 网页 / GitHub / 邮件多渠道素材抓取，只收集不筛选 |
| 伯乐 Agent | `bo-le` | 资讯去重归一化、AI 相关性打分、噪声过滤，甄别信源质量 |
| 玄评 Agent | `xuan-ping` | 热点事件多角度锐评、利弊解读、多 persona 观点输出 |
| 卖报翁 Agent | `mai-bao-weng` | 汇总筛选资讯，整编生成每日科创热点简报、日报、结构化技术报告（**核心内容生产**） |
| 策士 Agent | `ce-shi` | 归纳行业趋势、深度复盘，产出周报、月报、专题深度研判 |
| 算夫 Agent | `suan-fu` | 热点热度统计、来源占比、热点排行、信源健康度量化报表 |

### 📮 驿站体系 —— 内部流转、归档、分发、知识服务

| 角色 | 代号 | 职能 |
|------|------|------|
| 缮夫 Agent | `shan-fu` | 文本润色、摘要优化、Markdown 排版、文档样式统一 |
| 书吏 Agent | `shu-li` | 飞书知识库标准化归档、目录维护、标签体系、历史检索 |
| 驿卒 Agent | `yi-zu` | 定时调度推送，将简报分发飞书群组、邮箱、对外 RSS、静态网页 |
| 茶夫 Agent | `cha-fu` | 依托历史简报搭建 RAG，提供问答、历史热点查询、资讯答疑 |
| 小二 Agent | `xiao-er` | 驿馆跑堂，日常对话接待、通用问答与工具调用（**CLI 默认角色**） |

### 🛡️ 公共运维（编排引擎职能）

| 角色 | 代号 | 职能 |
|------|------|------|
| 坊主 Agent | `fang-zhu` | 集群总管，统筹全链路调度、编排 DSL 生成与执行、异常监控 |
| 巡卒 Agent | `xun-zu` | 监控运行日志、任务失败告警、服务状态巡检、链路异常上报 |

> 完整世界观见 [`docs/worldwide/世界观、多Agent.md`](docs/worldwide/世界观、多Agent.md)，技术契约见 [`docs/architecture/架构设计文档.md`](docs/architecture/架构设计文档.md)。

---

## 🚀 快速开始

### 环境要求

- **Node.js ≥ 22.16.0**
- npm（随 Node 自带）

### 安装

```bash
git clone https://github.com/Sxuan-Coder/skycourier.git
cd skycourier
npm install
```

### 配置环境变量

复制 `.env.example` 为 `.env`（或在项目根目录新建 `.env`）：

```bash
# 观天驿 SkyCourier Anthropic 兼容端点配置
SKYCOURIER_API_KEY=你的_API_KEY
SKYCOURIER_BASE_URL=https://你的兼容端点
SKYCOURIER_MODEL=模型名
```

> `.env` 已在 `.gitignore` 中排除，切勿提交。

### 启动开发 / 运行

```bash
npm run dev          # 开发模式（watch）
npm start            # 直接运行
npm run typecheck    # TypeScript 类型检查
npm run build        # 编译构建
```

---

## 💬 使用方式

### 1. REPL 对话（推荐入门）

```bash
npm run chat                 # 默认跟小二聊（日常对话、通用搜索）
npm run chat -- xiao-er      # 显式指定小二
npm run chat -- fang-zhu     # 切换到坊主（调度各角色完成情报工作）
```

REPL 内斜杠命令：

| 命令 | 说明 |
|------|------|
| `/agent [名称]` | 切换对话角色（中文 / 英文均可，Tab 补全） |
| `/tools` | 列出当前角色的工具 |
| `/help` | 显示帮助 |
| `/quit` | 退出（`Ctrl+C` 亦可） |

**核心交互流**：用户输入消息 → 当前角色处理（可调用工具）→ 若调用 `transfer_to_agent`，CLI 自动切换会话 → 无缝衔接与目标角色对话。

### 2. Workflow DSL 编排

```bash
npm run run:workflow -- workflows/daily-brief.workflow.json   # 指定 workflow 文件
npm run run:daily                                             # 运行每日科创情报日报
```

每日简报主线（5 角色线性链）：

```
定时触发 → 监天(采集) → 伯乐(筛选) → 卖报翁(整编) → 书吏(归档) → 驿卒(推送)
```

**坊主自然语言驱动**：在 `npm run chat -- fang-zhu` 中直接描述任务，坊主通过三个编排工具
（`generate_workflow_dsl` / `modify_workflow_dsl` / `execute_workflow`）自动生成、修改并执行 DSL，
附带三层降级保障：远程 LLM → 本地 PI Agent → 关键词模板匹配（永不失败）。

---

## 📁 项目结构

```
skycourier/
├── src/
│   ├── index.ts               # 主入口
│   ├── bootstrap.ts           # 初始化
│   ├── orchestrator/          # 编排层（坊主 / 会话 / Workflow DSL 类型）
│   ├── runner/                # Agent Runner 抽象（PI 后端 / CLI 后端 / 角色工具）
│   ├── tools/                 # 工具层（web / file / search / orchestrator / registry）
│   ├── cli/                   # CLI 入口（chat / run-workflow / md-renderer / commands）
│   ├── prompts/               # DSL 生成提示词
│   └── manifests/             # 角色 manifest 加载与类型
├── manifests/roles/           # 各角色定义（manifest.json + persona.md）
├── workflows/                 # Workflow DSL（daily-brief 等）
├── skills/                    # 技能集（ai-news-radar / radar）
├── handoff/                   # Agent 间交接产物（JSON / Markdown）
├── docs/                      # 架构 / 世界观 / 技术参考文档
├── package.json
└── tsconfig.json
```

---

## 🧱 技术栈

| 层 | 选型 |
|----|------|
| 运行时 | Node.js ≥ 22.16 + TypeScript 5.9 |
| Agent 执行 | `@earendil-works/pi-agent-core`（有状态运行时、工具调用、流式输出） |
| 模型接入 | `@earendil-works/pi-ai`（30+ provider） |
| 编排范式 | 参考 ShrimpCrab：Workflow DSL / Executor / Agent Runner 三大抽象 |
| 工具库 | cheerio（网页解析）、typebox（Schema 校验）、dotenv（环境变量） |
| 启动器 | tsx（直接运行 TS，无需编译） |

---

## 🗺️ 现状与路线图

> **当前状态：MVP 骨架 + CLI 层已打通**

- ✅ REPL 对话（多角色、Tab 补全、角色转交）
- ✅ 坊主编排（agent-as-tool 调度 + 三编排工具 + 三层降级）
- ✅ 流式 Markdown 终端渲染
- ✅ Workflow DSL 校验与执行入口
- 🚧 Executor 调度引擎（DAG 并行执行）
- 🚧 飞书知识库归档 / 推送分发落地
- 🚧 茶夫 RAG 问答检索
- 🚧 巡卒监控告警

实现优先级详见 [`docs/architecture/架构设计文档.md`](docs/architecture/架构设计文档.md)。

---

## 📚 相关文档

| 文档 | 说明 |
|------|------|
| [`AGENTS.md`](AGENTS.md) | 项目理念、slogan、命名规范 |
| [`docs/worldwide/世界观、多Agent.md`](docs/worldwide/世界观、多Agent.md) | 12 角色业务架构（业务总纲） |
| [`docs/architecture/架构设计文档.md`](docs/architecture/架构设计文档.md) | 技术架构与实现契约 |
| [`docs/tech/multi-agent-orchestration-report.md`](docs/tech/multi-agent-orchestration-report.md) | ShrimpCrab 编排范式参考 |

---

## 📄 License

暂未指定开源协议，作者保留所有权利。
