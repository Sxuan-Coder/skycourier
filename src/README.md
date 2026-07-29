# 观天驿源码

> 本目录承载编排引擎与 Agent Runner 的实现。当前为骨架阶段，类型契约先行，实现后续填充。
> 架构设计见 `docs/architecture/架构设计文档.md`。

## 目录结构

```
src/
├── orchestrator/          # 编排层（参考 ShrimpCrab）
│   ├── types.ts           # Workflow DSL 类型契约
│   ├── executor.ts        # DAG 调度引擎（待实现）
│   └── team-template.ts   # Team manifest 实例化（待实现）
├── runner/                # Agent Runner 统一抽象
│   ├── types.ts           # Runner 接口契约
│   ├── pi-backend.ts      # PI 后端实现（待实现）
│   └── cli-backend.ts     # CLI 后端实现（待实现）
├── tools/                 # 工具层
│   ├── web.ts             # web 抓取工具（待实现）
│   ├── lark.ts            # 飞书工具（待实现）
│   ├── rag.ts             # RAG 检索工具（待实现）
│   └── file.ts            # 文件/handoff 工具（待实现）
├── cli/                   # 命令行入口
│   └── run-workflow.ts    # 加载并执行一个 workflow.json（待实现）
└── index.ts               # 主入口
```

## 实现优先级（MVP）

1. `runner/types.ts` + `runner/pi-backend.ts` —— 先打通 PI 单后端
2. `runner/cli-backend.ts` —— 打通 CLI 后端，完成双后端地基验证
3. `orchestrator/types.ts` + `executor.ts` —— DAG 调度
4. `tools/` —— 按角色需求逐步补齐
