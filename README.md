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

## 文件结构

以下列出项目的主要目录与入口文件：

```text
Kairos/
├── .github/workflows/           # CI 与发行流水线
├── assets/readme/               # README 图片
│   └── diagram.jpg             # 架构与数据流图
├── app/                        # 原生 HTML 页面、功能模块与共享资源
│   ├── assets/                 # 背景、字体、图标、桌宠与生成样式
│   ├── features/               # assistant、calendar、habits、reminders、settings
│   ├── i18n/                   # 中英文词条与国际化运行时
│   ├── pages/                  # ai-chat、calendar、habits、music、pet、schedule
│   ├── shared/styles/          # 页面共享布局与兼容样式
│   ├── shell/                  # 导航与共享音乐播放器
│   └── themes/                 # 语义主题与主题运行时
├── renderer/                   # Vue 3 + Vite 渲染端
│   ├── src/
│   │   ├── assets/focus/       # 专注场景资源
│   │   ├── components/         # 应用外壳、设置、提醒与通用组件
│   │   ├── composables/        # 可复用组合逻辑
│   │   ├── data/               # 静态内容
│   │   ├── music/              # 原生播放器适配层
│   │   ├── router/             # 路由定义
│   │   ├── stores/             # 应用、专注、习惯与音乐等状态
│   │   ├── styles/             # 全局与专注样式
│   │   ├── views/              # 页面视图与原生页面宿主
│   │   ├── App.vue
│   │   └── main.ts
│   └── vite.config.ts
├── electron/
│   ├── main/index.js           # 生命周期、窗口、IPC 与服务编排
│   ├── preload/index.cjs       # contextBridge API
│   ├── data/                   # SQLite、应用状态与设置仓储
│   ├── services/               # AI、日历、文档、专注、音乐与网页服务
│   ├── scripts/                # 数据审计与发行验证
│   └── tests/                  # 单元、集成与发行测试
├── scripts/                    # 开发、构建、国际化、签名与资源准备
├── third_party/                # 第三方资源与许可证
├── .env.example                # 环境变量示例
├── package.json                # 依赖、命令与打包配置
├── pnpm-lock.yaml
└── tailwind.config.cjs
```

`docs/` 与 `references/` 仅在本地保存，不纳入 Git 仓库。`node_modules/`、`app/vue-preview/`、`release/` 等依赖及构建产物也不纳入源码版本。

## 架构与数据流

Vue Shell 承载导航、设置与全局组件，部分原生页面通过嵌入方式接入；共享播放器统一管理音频。渲染进程经 `contextBridge` 调用 Electron 主进程，由领域服务与仓储处理业务并写入 SQLite 或本地文件系统。

[![Kairos 架构与数据流：渲染进程、Electron 主进程、领域服务、安全边界与本地持久化](assets/readme/diagram.jpg)](assets/readme/diagram.jpg)

点击图片可查看原图。

## 设计参考

| 网站 | 参考内容 |
| --- | --- |
| [TweakCN](https://tweakcn.com/) | 主题、字体与界面结构 |
| [React Bits](https://reactbits.dev/) | 动效与交互模式 |
| [shadcn/ui](https://ui.shadcn.com/) | 组件结构、状态与无障碍模式 |
| [Google Stitch](https://stitch.withgoogle.com/) | 布局与原型参考 |
| [Morphicons](https://www.morphicons.com/) | SVG 图标动效、GitHub 品牌图标与外链图标 |

## 技术参考

| 项目 | 参考内容 |
| --- | --- |
| [Netease_url](https://github.com/Suxiaoqinx/Netease_url) | 网易云音乐链接参考实现 |
| [NeteaseCloudMusicApi](https://www.npmjs.com/package/NeteaseCloudMusicApi) | 网易云音乐 API 软件包 |

## 数据与隐私

应用运行时会在 Electron 的 `userData` 目录创建 `kairos.sqlite`。其中可能含有个人日程、习惯、AI 对话、设置及音乐状态；请勿提交、公开或随意共享该目录。`.env` 文件同样不应提交。

网易云功能仅面向用户已获授权账号的个人使用；不会绕过版权、会员、地区、验证、速率限制或不可播放限制。

