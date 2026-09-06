# Kairos Desktop

Kairos 是一款面向个人学习与日常规划的 Windows 桌面应用，提供日程、习惯、提醒、音乐与 AI 助手能力。

## 技术栈

- Electron 36：桌面主进程、窗口与原生能力。
- Vue 3、Vite、Pinia：新的渲染层与状态管理。
- 原生 HTML/JavaScript：遗留功能页面，逐步由 Vue 接管。
- SQLite（`node:sqlite`）：运行时业务数据的主持久化库。
- LangChain / OpenAI：AI Agent、工具调用与记忆服务。

## 快速开始

先安装与 `package.json` 中 `packageManager` 对应的 pnpm 版本，再执行：

```powershell
pnpm install
pnpm dev
```

环境自检可运行 `pnpm doctor`。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 同步生成资源并启动 Vite + Electron 开发环境 |
| `pnpm check` | 版本、国际化、类型与测试检查 |
| `pnpm typecheck` | Vue/TypeScript 类型检查 |
| `pnpm build:renderer` | 构建渲染进程资源 |
| `pnpm dist:win` | 构建 Windows 安装包与便携版 |
| `pnpm audit:desktop-data` | 审计应用运行时数据 |

## 目录导览

- `app/`：html页面、功能模块、资源和样式。
- `renderer/`：Vue 渲染端源码。
- `electron/`：主进程、预加载脚本、服务层、数据层和测试。
- `scripts/`：开发、构建、签名与发布校验脚本。
- `docs/`：项目与运行环境文档。
- `references/`：参考资料与不参与打包的遗留素材。

详见 [文件结构](docs/FILE-STRUCTURE.md)、[SQLite 数据库结构](docs/KAIROS-SQLITE-SCHEMA.sql) 与 [数据流程](docs/KAIROS-DATA-FLOW.md)。

## 数据与隐私

应用运行时会在 Electron 的 `userData` 目录创建 `kairos.sqlite`。其中可能含有个人日程、习惯、AI 对话、设置及音乐状态；请勿提交、公开或随意共享该目录。`.env` 文件同样不应提交。

网易云功能仅面向用户已获授权账号的个人使用；不会绕过版权、会员、地区、验证、速率限制或不可播放限制。

## 相关文档

- [项目文件结构](docs/FILE-STRUCTURE.md)
- [SQLite 数据库结构](docs/KAIROS-SQLITE-SCHEMA.sql)
- [架构与数据流](docs/KAIROS-DATA-FLOW.md)
