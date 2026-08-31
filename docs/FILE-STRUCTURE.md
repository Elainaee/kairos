# Kairos 工作区文件结构

> 盘点时间：2026-08-27。下列内容基于 Git 已跟踪的 151 个文件与当前工作区可见源码；依赖、构建产物和运行时数据按 `.gitignore` 排除。

```text
Kairos/
├── app/                         # 遗留前端与静态资源
│   ├── assets/                  # 图标、字体、日历背景、桌宠图片、Tailwind 样式
│   ├── features/                # assistant、calendar、habits、reminders、settings
│   ├── i18n/                    # 中英文语言包与国际化核心
│   ├── pages/                   # 日程、日历、习惯、音乐、AI、桌宠页面
│   ├── shell/                   # 导航壳与音乐播放器
│   └── shared/styles/           # 共用主题和布局
├── renderer/                    # Vue 3 + Vite 渲染端
│   ├── src/
│   │   ├── components/          # 应用壳、设置、提醒、Toast、对话框
│   │   ├── music/               # 音乐来源适配
│   │   ├── router/              # Vue Router 路由
│   │   ├── stores/              # Pinia 状态库
│   │   ├── views/               # Shell、日程、习惯、音乐等视图
│   │   └── styles/              # 全局与日程样式
│   ├── index.html
│   ├── tsconfig.json
│   └── vite.config.ts
├── electron/                    # Electron 主进程与本地服务
│   ├── data/
│   │   ├── app-state/           # 应用状态仓储
│   │   ├── settings/            # 设置仓储
│   │   ├── sqlite/              # SQLite 建库、迁移、审计
│   │   └── assistant-profile.js
│   ├── main/index.js            # 主进程入口和 IPC 编排
│   ├── preload/index.cjs        # contextBridge 白名单 API
│   ├── services/
│   │   ├── ai/                  # Agent、Provider、上下文、记忆与工具
│   │   ├── calendar/            # 日历背景服务
│   │   ├── documents/           # 附件与 PDF/DOCX 解析
│   │   ├── music/               # 本地曲库与网易云服务
│   │   └── web/                 # 网页搜索
│   ├── scripts/                 # 数据审计与发布辅助脚本
│   └── tests/                   # unit、integration、distribution 测试
├── scripts/                     # 开发、构建、签名、版本和 i18n 脚本
├── docs/                        # 文档
├── references/                  # 参考资料和遗留原型（不参与产品打包）
├── .github/                     # CI / GitHub 配置（若有）
├── .env.example                 # 环境变量示例，不含密钥
├── package.json                 # npm 脚本、依赖、electron-builder 配置
├── pnpm-lock.yaml               # 锁定依赖版本
├── pnpm-workspace.yaml          # pnpm 工作区配置
└── tailwind.config.cjs          # Tailwind 配置
```

## 边界说明

- `app/` 与 `renderer/` 并存：前者包含逐步迁移中的原生页面，后者是新的 Vue UI。
- 业务服务与持久化在 `electron/`；渲染进程通过 `electron/preload/index.cjs` 暴露的受限 API 访问。
- `node_modules/`、`dist/`、`release/`、`userData/`、`.env` 和本地 JSON/SQLite 数据均不应纳入版本控制。
- 当前工作区存在用户尚未提交的修改与删除项；本文件只说明结构，不将这些状态视为发布基线。
