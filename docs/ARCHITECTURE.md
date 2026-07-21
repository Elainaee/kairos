# Kairos 架构文档

> 生成日期: 2026-07-21
> 基于代码实际分析，非 AI 推测

---

## 1. 整体架构总览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        KAIROS DESKTOP v0.1.0                            │
│                    Windows Electron 36 Desktop App                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    RENDERER PROCESS (Sandboxed)                    │ │
│  │                                                                   │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │ │
│  │  │ 主窗口    │  │ 桌宠窗口  │  │ AI聊天窗 │  │  系统通知         │ │ │
│  │  │ calendar │  │  pet     │  │ ai-chat  │  │  Notification    │ │ │
│  │  │ 1440x900 │  │ 260x280  │  │ 520x680  │  │                  │ │ │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────────────────┘ │ │
│  │       │             │             │                              │ │
│  │       │    ┌────────┴────────┐    │                              │ │
│  │       │    │  SPA Shell      │    │                              │ │
│  │       │    │  (stitch-shell) │    │                              │ │
│  │       │    │  iframe 嵌入    │    │                              │ │
│  │       │    └────────────────┘    │                              │ │
│  │       │                          │                              │ │
│  │  ┌────┴──────────────────────────┴──────────────────────────┐  │ │
│  │  │              window.kairosDesktop (Preload API)          │  │ │
│  │  │  contextBridge.exposeInMainWorld() - 安全隔离桥          │  │ │
│  │  └──────────────────────────────────────────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                  │                                      │
│                          ipcRenderer.invoke()                           │
│                          ipcRenderer.on()                               │
│                                  │                                      │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                      PRELOAD BRIDGE                               │ │
│  │                   electron/preload/index.cjs                       │ │
│  │  contextIsolation: true | nodeIntegration: false | sandbox: true  │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                  │                                      │
│                          ipcMain.handle()                               │
│                                  │                                      │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                      MAIN PROCESS                                 │ │
│  │                  electron/main/index.js                           │ │
│  │                                                                   │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │ │
│  │  │ 窗口管理     │  │ IPC 路由    │  │  菜单 & 生命周期         │  │ │
│  │  │ mainWindow  │  │ 60+ handlers│  │  app.whenReady()        │  │ │
│  │  │ petWindow   │  │             │  │  single-instance-lock   │  │ │
│  │  │ aiChatWindow│  │             │  │  userData process lock  │  │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                  │                                      │
│         ┌────────────────────────┼────────────────────────┐            │
│         │                        │                        │            │
│  ┌──────┴──────┐    ┌───────────┴──────────┐   ┌────────┴────────┐  │
│  │ DATA LAYER  │    │   SERVICE LAYER       │   │  AI AGENT LAYER │  │
│  └─────────────┘    └──────────────────────┘   └─────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 数据层架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                                   │
│                                                                     │
│  持久化策略: JSON 文件 (主) + SQLite 镜像 (辅)                        │
│  存储位置: C:\Users\{user}\AppData\Roaming\Kairos\                  │
│                                                                     │
│  ┌──────────────────────────┐  ┌──────────────────────────────────┐│
│  │   app-state.json         │  │   kairos.sqlite (可选镜像)        ││
│  │   ─────────────────      │  │   ─────────────────────          ││
│  │   • schedules[]          │  │   • app_state_snapshots          ││
│  │   • checkins[]           │  │   • app_schedules (索引)          ││
│  │   • habits[]             │  │   • app_habits (索引)             ││
│  │   • notes[]              │  │   • app_checkins                 ││
│  │   • moods{}              │  │   • app_notes                    ││
│  │   • studyPlans[]         │  │   • json_store_snapshots         ││
│  │   • theme                │  │   • schema_migrations            ││
│  │                          │  │   • database_metadata            ││
│  │  AppStateStore           │  │   • data_exports (审计)           ││
│  │  ├─ read/write/mutate    │  │                                  ││
│  │  ├─ backup/restore       │  │  KairosAppDatabase               ││
│  │  ├─ import/export        │  │  ├─ saveAppStateSnapshot()       ││
│  │  └─ auditAppState()      │  │  ├─ readAppStateSnapshot()       ││
│  └──────────────────────────┘  │  ├─ saveJsonStoreSnapshot()      ││
│                                │  └─ readJsonStorePayload()       ││
│  ┌──────────────────────────┐  └──────────────────────────────────┘│
│  │   ai-data.json           │                                       │
│  │   ────────────           │  ┌──────────────────────────────────┐│
│  │   • conversations[]      │  │   其他 JSON 文件                  ││
│  │   • messages[]           │  │   ──────────────                 ││
│  │   • attachments[]        │  │   • ai-settings.json             ││
│  │   • proposals[]          │  │   • music-state.json             ││
│  │   • memories[]           │  │   • netease-api-state.json       ││
│  │   • usage[]              │  │   • pet-state.json               ││
│  │   • permissions{}        │  │   • window-state.json            ││
│  │                          │  │                                  ││
│  │  AiDataStore             │  │  SettingsRepository              ││
│  │  ├─ CRUD conversations   │  │  ├─ read/write/update            ││
│  │  ├─ CRUD messages        │  │  ├─ SQLite 故障恢复              ││
│  │  ├─ memories (记忆)      │  │  └─ safeStorage 加密             ││
│  │  ├─ usage tracking       │  │      (API Key 存储)              ││
│  │  └─ atomic write (mutex) │  │                                  ││
│  └──────────────────────────┘  └──────────────────────────────────┘│
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  AppStateRepository (适配器工厂)                              │  │
│  │  createAppAdapters() → Proxy { schedules, tasks, habits,     │  │
│  │    notes, studyPlans }.query/create/update/delete/delete_many│  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. AI Agent 架构 (核心)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AI AGENT ARCHITECTURE                           │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                     IPC HANDLER: ai:send                           │ │
│  │  main/index.js → 消息路由 + 附件预处理 + 状态持久化                   │ │
│  └───────────────────────────┬───────────────────────────────────────┘ │
│                              │                                          │
│                              ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                   runKairosAgent()                                │ │
│  │              electron/services/ai/langchain-agent.js              │ │
│  │                                                                   │ │
│  │  ┌─────────────────────────────────────────────────────────────┐ │ │
│  │  │              KAIROS_AGENT_PROMPT (System Prompt)            │ │ │
│  │  │  • 角色: 温和、诚实的个人陪伴与效率助手                         │ │ │
│  │  │  • 时区: Asia/Shanghai                                       │ │ │
│  │  │  • 风格: companion / concise / learning                      │ │ │
│  │  │  • 规则: 提案制 (propose → user confirm → commit)             │ │ │
│  │  └─────────────────────────────────────────────────────────────┘ │ │
│  │                                                                   │ │
│  │  ┌─────────────────────────────────────────────────────────────┐ │ │
│  │  │                    TOOLS (LangChain)                        │ │ │
│  │  │                                                             │ │ │
│  │  │  记忆类:                                                    │ │ │
│  │  │  ├─ search_memories    → AiDataStore.listMemories()        │ │ │
│  │  │  ├─ remember_memory    → AiDataStore.remember()            │ │ │
│  │  │  └─ forget_memory      → AiDataStore.forgetMemory()        │ │ │
│  │  │                                                             │ │ │
│  │  │  查询类:                                                    │ │ │
│  │  │  ├─ query_kairos_data  → ToolRuntime.query()               │ │ │
│  │  │  │   domains: schedules, tasks, habits, notes              │ │ │
│  │  │  └─ web_search         → Firecrawl API                     │ │ │
│  │  │                                                             │ │ │
│  │  │  提案类 (仅创建待确认提案，不直接写数据):                      │ │ │
│  │  │  ├─ propose_schedule   → 日程提案                           │ │ │
│  │  │  ├─ propose_task       → 任务/截止提案                       │ │ │
│  │  │  ├─ propose_update_schedule → 日程修改提案                   │ │ │
│  │  │  └─ propose_delete_schedules → 日程删除提案                  │ │ │
│  │  │                                                             │ │ │
│  │  │  辅助类:                                                    │ │ │
│  │  │  └─ set_conversation_title → 自动命名会话                    │ │ │
│  │  └─────────────────────────────────────────────────────────────┘ │ │
│  │                                                                   │ │
│  │  ┌─────────────────────────────────────────────────────────────┐ │ │
│  │  │              LangChain Agent Pipeline                       │ │ │
│  │  │                                                             │ │ │
│  │  │  createAgent({ model: ChatOpenAI, tools, systemPrompt })    │ │ │
│  │  │       │                                                     │ │ │
│  │  │       ▼                                                     │ │ │
│  │  │  agent.invoke({ messages })                                 │ │ │
│  │  │       │                                                     │ │ │
│  │  │       ▼                                                     │ │ │
│  │  │  返回 { text: string, proposals: Proposal[] }               │ │ │
│  │  └─────────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    SUPPORTING SERVICES                            │ │
│  │                                                                   │ │
│  │  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │ │
│  │  │ ToolRuntime     │  │ ContextManager   │  │ providers.js    │  │ │
│  │  │                 │  │                  │  │                 │  │ │
│  │  │ • 权限控制       │  │ • Token 估算     │  │ OpenAI (GPT)    │  │ │
│  │  │   none/read/    │  │ • 上下文压缩      │  │ Doubao (豆包)    │  │ │
│  │  │   write         │  │   summarize      │  │ Anthropic       │  │ │
│  │  │                 │  │ • 新建延续会话    │  │ Gemini          │  │ │
│  │  │ • 领域查询       │  │                  │  │                 │  │ │
│  │  │ • 提案存储       │  │ DEFAULT_LIMITS:  │  │ streamProvider  │  │ │
│  │  │ • 提案决策       │  │ 128K tokens      │  │ Request()       │  │ │
│  │  │   approve/      │  │                  │  │ testProvider()  │  │ │
│  │  │   reject        │  │ 触发阈值: 85%    │  │                 │  │ │
│  │  └─────────────────┘  └──────────────────┘  └─────────────────┘  │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Agent 数据流

```
用户输入消息
     │
     ▼
┌──────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│ ai:send IPC  │───▶│ 附件预处理         │───▶│ runKairosAgent()    │
│ (Renderer)   │    │ (Document Parser) │    │ (langchain-agent)   │
└──────────────┘    └──────────────────┘    └──────────┬──────────┘
                                                       │
                              ┌────────────────────────┼────────────────────────┐
                              │                        │                        │
                              ▼                        ▼                        ▼
                      ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
                      │ Provider     │        │ Tool Calling │        │ Stream       │
                      │ ChatOpenAI   │◀──────▶│ (LangChain)  │───────▶│ Events       │
                      │ / ArkRuntime │        │              │        │ broadcast    │
                      └──────────────┘        └──────┬───────┘        └──────────────┘
                                                     │
                              ┌──────────────────────┼──────────────────────┐
                              │                      │                      │
                              ▼                      ▼                      ▼
                      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
                      │ Web Search   │      │ Local Query  │      │ Proposals    │
                      │ (Firecrawl)  │      │ (AppState)   │      │ (待确认)      │
                      └──────────────┘      └──────────────┘      └──────┬───────┘
                                                                         │
                                                                         ▼
                                                              ┌──────────────────┐
                                                              │ 用户确认/拒绝     │
                                                              │ (UI Renderer)    │
                                                              └──────┬───────────┘
                                                                     │
                                                                     ▼
                                                              ┌──────────────────┐
                                                              │ AppStateAdapter  │
                                                              │ 写入本地数据       │
                                                              └──────────────────┘
```

---

## 4. 服务层架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                       SERVICE LAYER                                 │
│                   electron/services/                                │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  services/ai/              AI 核心服务                        │  │
│  │  ├─ langchain-agent.js     LangChain Agent 运行时             │  │
│  │  ├─ providers.js           AI 模型提供商适配 (OpenAI/豆包/...)  │  │
│  │  ├─ tool-runtime.js        工具权限 & 提案生命周期管理          │  │
│  │  ├─ data-store.js          AI 会话/消息/记忆/用量 持久化       │  │
│  │  └─ context-manager.js     上下文窗口 Token 管理               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  services/music/           音乐服务                           │  │
│  │  ├─ music-library.js       本地音乐库 (mp3/flac/wav/m4a/aac) │  │
│  │  │                         元数据解析 + 封面提取               │  │
│  │  │                         播放队列 + 歌单管理                │  │
│  │  └─ netease-api-service.js 网易云音乐 API 封装                │  │
│  │                            搜索/歌单/喜欢/历史/登录           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  services/documents/       文档服务                           │  │
│  │  ├─ attachments.js         附件上传/存储/解析生命周期          │  │
│  │  └─ document-parser.js     PDF (pdfjs-dist) + DOCX (mammoth)  │  │
│  │                            + ZIP (jszip) 解析                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  services/web/             网络服务                           │  │
│  │  └─ web-search.js          Firecrawl v2 API                  │  │
│  │                            搜索 + Markdown 正文抓取           │  │
│  │                            重试 & 限流 & 错误处理              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  services/calendar/        日历服务                           │  │
│  │  └─ calendar-backgrounds.js 日历背景图管理                    │  │
│  │                            内置 + 用户自定义导入               │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. 渲染进程架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     RENDERER PROCESS ARCHITECTURE                       │
│                           app/                                          │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                     THREE WINDOWS                                │ │
│  │                                                                   │ │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐ │ │
│  │  │ MAIN WINDOW      │  │ PET WINDOW       │  │ AI CHAT WINDOW  │ │ │
│  │  │ 900x650 (min)    │  │ 195x230/260x280  │  │ 360x480 (min)   │ │ │
│  │  │ frame: ✓         │  │ frame: ✗         │  │ frame: ✗        │ │ │
│  │  │ transparent: ✗   │  │ transparent: ✓   │  │ transparent: ✓  │ │ │
│  │  │ resizable: ✓     │  │ resizable: ✗     │  │ alwaysOnTop: ✓  │ │ │
│  │  │ taskbar: ✓       │  │ alwaysOnTop: ✓   │  │ skipTaskbar: ✓  │ │ │
│  │  └──────┬───────────┘  └────────┬─────────┘  └────────┬────────┘ │ │
│  │         │                       │                     │           │ │
│  │         ▼                       ▼                     ▼           │ │
│  │  calendar/index.html    pet/index.html       ai-chat/index.html   │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                     SPA SHELL (stitch-shell.js)                   │ │
│  │                                                                   │ │
│  │  主窗口 = 日历 (始终挂载) + iframe 嵌入子页面                        │ │
│  │                                                                   │ │
│  │  ┌──────────────────────────────────────────────────────┐        │ │
│  │  │  kairos-topbar (顶部导航栏, 64px)                     │        │ │
│  │  │  ┌──────┐ ┌────────────────────────────┐ ┌────────┐ │        │ │
│  │  │  │ Brand│ │ gooey-nav (流体导航)        │ │Actions │ │        │ │
│  │  │  │ Kairos│ │ Calendar|Habits|Schedule   │ │+创建   │ │        │ │
│  │  │  │      │ │ |Notes|Music               │ │提醒|设置│ │        │ │
│  │  │  └──────┘ └────────────────────────────┘ └────────┘ │        │ │
│  │  └──────────────────────────────────────────────────────┘        │ │
│  │                                                                   │ │
│  │  ┌──────────────────────────────────────────┐                    │ │
│  │  │         主内容区 (flex-1)                  │                    │ │
│  │  │                                          │                    │ │
│  │  │  ┌──────────────┐  ┌──────────────────┐  │                    │ │
│  │  │  │ 日历 (固定)   │  │ iframe 子页面     │  │                    │ │
│  │  │  │ calendar     │  │ habits/schedule  │  │                    │ │
│  │  │  │              │  │ /notes/music     │  │                    │ │
│  │  │  │ - 月历网格    │  │                  │  │                    │ │
│  │  │  │ - 背景图     │  │ 嵌入模式加载      │  │                    │ │
│  │  │  │ - 日期标记    │  │ postMessage 通信 │  │                    │ │
│  │  │  └──────────────┘  └──────────────────┘  │                    │ │
│  │  └──────────────────────────────────────────┘                    │ │
│  │                                                                   │ │
│  │  ┌──────────────────────────────────────────────────────┐        │ │
│  │  │  kairos-player (底部播放器, 80px, 玻璃质感)           │        │ │
│  │  │  封面 | 歌曲信息 | 进度条 | 控制按钮 | 音量           │        │ │
│  │  └──────────────────────────────────────────────────────┘        │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                     FEATURE MODULES                               │ │
│  │                                                                   │ │
│  │  features/                                                        │ │
│  │  ├─ calendar/                                                     │ │
│  │  │   ├─ calendar-core.cjs      日期计算 & 日历数据模型             │ │
│  │  │   ├─ schedule-feature.js    日程 CRUD UI 交互                  │ │
│  │  │   ├─ schedule-feature.css   日程样式                           │ │
│  │  │   └─ date-range-picker.css  日期范围选择器                     │ │
│  │  ├─ habits/                                                      │ │
│  │  │   ├─ habit-core.cjs         习惯数据模型 & 连续天数计算         │ │
│  │  │   ├─ habits-feature.js      习惯 UI 交互                       │ │
│  │  │   └─ habits-feature.css     习惯样式                           │ │
│  │  ├─ notes/                                                       │ │
│  │  │   ├─ note-core.cjs          笔记数据模型                       │ │
│  │  │   └─ notes-feature.js       笔记 UI 交互                       │ │
│  │  ├─ reminders/                                                   │ │
│  │  │   ├─ reminder-core.cjs      提醒规则引擎                       │ │
│  │  │   ├─ reminder-feature.js    提醒弹窗 UI                        │ │
│  │  │   └─ reminder-feature.css   提醒样式                           │ │
│  │  ├─ settings/                                                    │ │
│  │  │   ├─ settings-feature.js    设置面板 (双栏弹层)                  │ │
│  │  │   └─ settings-feature.css   设置样式                           │ │
│  │  └─ assistant/                                                   │ │
│  │      ├─ ai-chat.js             AI 聊天 UI                         │ │
│  │      └─ ai-chat.css            AI 聊天样式                        │ │
│  │                                                                   │ │
│  │  shell/                                                           │ │
│  │  ├─ navigation/stitch-shell.js   SPA 壳 & 导航逻辑                │ │
│  │  └─ player/music-player.js       音乐播放器 UI                    │ │
│  │                                                                   │ │
│  │  shared/styles/                                                   │ │
│  │  ├─ tweakcn-theme.css            主题变量 (浅色/暗色)              │ │
│  │  └─ stitch-layout.css            主布局样式                       │ │
│  │                                                                   │ │
│  │  assets/                                                          │ │
│  │  ├─ styles/tailwind.css          Tailwind 生成输出                │ │
│  │  ├─ fonts/                       字体文件                        │ │
│  │  ├─ pets/desk-pet.png            桌宠图片                        │ │
│  │  ├─ calendar-backgrounds/       日历背景图                        │ │
│  │  └─ icons/                       应用图标                        │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. IPC 通信矩阵

```
┌──────────────────────────────────────────────────────────────────────┐
│              PRELOAD API (window.kairosDesktop)                       │
│                                                                       │
│  kairosDesktop                                                        │
│  ├─ isDesktop: true                                                   │
│  │                                                                    │
│  ├─ AI 模块                                                           │
│  │   ├─ listProviders()           → ai:list-providers                │
│  │   ├─ getProviderSettings()     → ai:get-settings                  │
│  │   ├─ saveProviderSettings()   → ai:save-settings                 │
│  │   ├─ sendMessage()            → ai:send                          │
│  │   ├─ stopMessage()            → ai:stop                          │
│  │   ├─ conversations            → ai:conversations:*               │
│  │   ├─ memories                 → ai:memories:*                    │
│  │   ├─ attachments              → ai:attachments:*                 │
│  │   ├─ context                  → ai:context:*                     │
│  │   ├─ permissions              → ai:permissions:*                 │
│  │   ├─ tools                    → ai:tools:*                       │
│  │   └─ onStreamEvent()          ← ai:stream (push)                 │
│  │                                                                    │
│  ├─ App State 模块                                                   │
│  │   └─ appState                 → app:*                            │
│  │       ├─ get/save/initialize                                      │
│  │       ├─ audit/listBackups/readBackup/restoreBackup               │
│  │       ├─ exportCurrent/importJson                                 │
│  │       └─ onChanged()          ← app:state-changed (push)         │
│  │                                                                    │
│  ├─ Music 模块                                                       │
│  │   └─ music                    → music:*                          │
│  │       ├─ getState/chooseFiles/chooseFolder                        │
│  │       ├─ addFiles/syncFolders                                     │
│  │       ├─ updatePlayback/updateTrack/removeTrack/clear             │
│  │       └─ playlists CRUD                                           │
│  │                                                                    │
│  ├─ NetEase 模块                                                     │
│  │   └─ netease                  → netease:*                        │
│  │       ├─ getStatus/login/logout                                   │
│  │       ├─ search/playlists/liked/history                           │
│  │       └─ 登录流程 (QR/手机/验证码)                                  │
│  │                                                                    │
│  ├─ Pet 模块                                                         │
│  │   └─ pet                      → pet:*                            │
│  │       ├─ hide/show/click/resize/move                              │
│  │       ├─ onVisibilityChanged  ← pet:visibility (push)            │
│  │       ├─ onAction             ← pet:action (push)                │
│  │       └─ onBlur               ← pet:blur (push)                  │
│  │                                                                    │
│  ├─ Calendar Backgrounds 模块                                        │
│  │   └─ calendarBackgrounds      → calendar-background:*            │
│  │                                                                    │
│  ├─ Shell 导航                                                       │
│  │   ├─ onShellCommand()         ← shell:command (push)             │
│  │   └─ reminders.notify()       → reminder:notify                  │
│  └───────────────────────────────────────────────────────────────────┘
```

---

## 7. AI 提案生命周期

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     PROPOSAL LIFECYCLE                                  │
│                                                                         │
│   AI 生成提案 (Agent)                                                    │
│        │                                                                │
│        ▼                                                                │
│   ┌─────────────┐                                                       │
│   │  pending    │  ← 待用户确认                                          │
│   │  (proposal) │     AI 调用 propose_schedule / propose_task 等 tool   │
│   └──────┬──────┘     结果存入 AiDataStore.proposals[]                   │
│          │                                                               │
│          │  用户操作 (UI)                                                 │
│          │                                                               │
│     ┌────┴────┐                                                         │
│     │         │                                                         │
│     ▼         ▼                                                         │
│  ┌──────┐  ┌──────────┐                                                │
│  │ 批准  │  │  拒绝     │                                                │
│  │approved│  │ rejected │                                               │
│  └──┬───┘  └──────────┘                                                │
│     │                                                                    │
│     │  ToolRuntime.decide(id, {approved:true})                          │
│     │  → 调用 AppStateAdapter[domain][operation](payload)                │
│     │                                                                    │
│     ▼                                                                    │
│  ┌──────────┐                                                           │
│  │ committed │  ← 数据已写入 app-state.json + SQLite 镜像                 │
│  │ result   │    AppStateRepository.create/update/delete/delete_many    │
│  └──────────┘                                                           │
│                                                                         │
│  提案项:                                                                 │
│  • domain: "schedules" | "tasks"                                        │
│  • operation: "create" | "update" | "delete" | "delete_many"            │
│  • confidence: "low" | "medium" | "high"                                │
│  • inferred_fields: string[]  (AI 推测的字段, 提请用户检查)               │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 8. 技术栈总览

```
┌──────────────────────────────────────────────────────────────────────┐
│                      TECHNOLOGY STACK                               │
│                                                                      │
│  ┌────────────────────┐  ┌────────────────────────────────────────┐ │
│  │ Desktop Runtime    │  │ AI & Agent                             │ │
│  │ ─────────────────  │  │ ─────────────                          │ │
│  │ Electron 36        │  │ LangChain 1.5 (createAgent + tool)     │ │
│  │ Main + Preload     │  │ @langchain/openai (ChatOpenAI)         │ │
│  │ + Renderer         │  │ OpenAI SDK 4.x (direct streaming)      │ │
│  │ contextIsolation   │  │ @volcengine/ark-runtime (豆包)          │ │
│  │ sandbox: true      │  │ Zod 4.x (tool schema validation)       │ │
│  └────────────────────┘  └────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────┐  ┌────────────────────────────────────────┐ │
│  │ Data & Storage     │  │ Documents & Media                      │ │
│  │ ─────────────────  │  │ ──────────────                         │ │
│  │ JSON (primary)     │  │ pdfjs-dist 6.x (PDF 解析)              │ │
│  │ node:sqlite (mirror)│  │ mammoth 1.x (DOCX 解析)               │ │
│  │ safeStorage (加密)  │  │ jszip 3.x (ZIP 解析)                  │ │
│  │ Atomic file write  │  │ 本地元数据解析 (ID3 etc.)               │ │
│  │ Backup & Restore   │  │ NeteaseCloudMusicApi 4.x               │ │
│  └────────────────────┘  └────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────┐  ┌────────────────────────────────────────┐ │
│  │ Frontend           │  │ Network & Search                       │ │
│  │ ────────────────   │  │ ──────────────                         │ │
│  │ Native HTML/CSS/JS │  │ Firecrawl v2 API (web search + scrape) │ │
│  │ Tailwind CSS 3.4   │  │ dotenv (环境变量管理)                    │ │
│  │ Material Symbols   │  │ fetch API (原生)                       │ │
│  │ Outfit font        │  └────────────────────────────────────────┘ │
│  │ SPA shell (iframe) │                                             │
│  └────────────────────┘  ┌────────────────────────────────────────┐ │
│                          │ Build & Release                        │ │
│  ┌────────────────────┐  │ ──────────────                         │ │
│  │ Testing            │  │ pnpm (包管理)                           │ │
│  │ ────────           │  │ electron-builder 26.x                  │ │
│  │ node:test (built-in)│  │ Tailwind CLI (CSS 构建)                │ │
│  │ unit + integration │  │ NSIS + Portable (Windows)              │ │
│  │ + distribution     │  │ asar 打包                              │ │
│  │ smoke tests        │  └────────────────────────────────────────┘ │
│  └────────────────────┘                                             │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 9. 文件依赖关系图

```
package.json
├─ electron/main/index.js  ────────────────── 主入口 (main process)
│   ├─ electron/services/ai/providers.js ──── AI 提供商适配
│   ├─ electron/services/ai/data-store.js ── AI 数据持久化
│   ├─ electron/services/ai/tool-runtime.js ─ 工具权限 & 提案
│   ├─ electron/services/ai/context-manager.js  上下文管理
│   ├─ electron/services/ai/langchain-agent.js ─ LangChain Agent
│   │   ├─ @langchain/core (createAgent, tool)
│   │   ├─ @langchain/openai (ChatOpenAI)
│   │   └─ zod (schema validation)
│   ├─ electron/services/documents/attachments.js  附件服务
│   │   └─ electron/services/documents/document-parser.js  文档解析
│   │       ├─ pdfjs-dist
│   │       ├─ mammoth
│   │       └─ jszip
│   ├─ electron/services/music/music-library.js ── 本地音乐库
│   ├─ electron/services/music/netease-api-service.js  网易云API
│   ├─ electron/services/web/web-search.js ──── Firecrawl 搜索
│   ├─ electron/services/calendar/calendar-backgrounds.js  日历背景
│   ├─ electron/data/app-state/index.js ────── 应用状态存储
│   │   ├─ AppStateStore (JSON 读写)
│   │   ├─ AppStateRepository (CRUD 适配器)
│   │   ├─ createAppAdapters (适配器工厂)
│   │   └─ auditAppState (数据审计)
│   ├─ electron/data/sqlite/index.js ──────── SQLite 镜像
│   │   └─ node:sqlite (DatabaseSync)
│   └─ electron/data/settings/index.js ────── 设置存储
│       └─ SettingsRepository
│
├─ electron/preload/index.cjs ──────────────── 安全桥接层
│   └─ contextBridge.exposeInMainWorld("kairosDesktop", ...)
│
├─ app/ ──────────────────────────────────── 渲染进程
│   ├─ pages/
│   │   ├─ calendar/index.html ─── 主窗口入口
│   │   ├─ habits/index.html ──── iframe 嵌入
│   │   ├─ schedule/index.html ── iframe 嵌入
│   │   ├─ notes/index.html ───── iframe 嵌入
│   │   ├─ music/index.html ───── iframe 嵌入
│   │   ├─ ai-chat/index.html ─── 独立 AI 窗口
│   │   └─ pet/index.html ─────── 桌宠窗口
│   ├─ features/
│   │   ├─ calendar/  (calendar-core, schedule-feature)
│   │   ├─ habits/    (habit-core, habits-feature)
│   │   ├─ notes/     (note-core, notes-feature)
│   │   ├─ reminders/ (reminder-core, reminder-feature)
│   │   ├─ settings/  (settings-feature)
│   │   └─ assistant/ (ai-chat)
│   ├─ shell/
│   │   ├─ navigation/stitch-shell.js ─── SPA 壳 & 导航
│   │   └─ player/music-player.js ─────── 音乐播放器
│   ├─ shared/styles/ ────────────── 主题 & 布局
│   └─ assets/ ───────────────────── 静态资源
│
├─ scripts/
│   ├─ kairos-dev.cjs ──── 本地开发启动器
│   └─ kairos-doctor.cjs ── 环境诊断
│
├─ docs/ ──────────────────────────── 项目文档
│   ├─ PRD.md ──────────── 产品需求文档
│   ├─ DESIGN.md ───────── 设计规范
│   ├─ FILE-STRUCTURE.md ── 文件结构
│   ├─ SQLITE-SCHEMA.md ─── 数据库 Schema
│   ├─ ARCHITECTURE.md ──── 本文档
│   └─ ...
│
├─ references/ ─────────────────────── 历史参考 (不打包)
└─ release/ ────────────────────────── 构建产物
```

---

## 10. 关键设计决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 桌面框架 | Electron (非 Tauri) | 团队 Web 技术栈熟悉度, 网易云 API 集成 |
| 数据存储 | JSON 主 + SQLite 镜像 | JSON 简单可审计, SQLite 提供查询能力和故障恢复 |
| AI 框架 | LangChain `createAgent` | 工具调用 (tool calling) 标准化, 多提供商切换 |
| 前端方案 | 原生 HTML/CSS/JS (非 React) | 轻量, 无构建步骤, 直接加载 |
| 样式方案 | Tailwind CSS + 自定义主题 | 设计系统统一, 暗色模式支持 |
| AI 数据流 | 提案制 (提案→确认→写入) | 安全: AI 不能直接修改用户数据 |
| 多窗口 | 3 个 BrowserWindow | 主窗口/Schedule + 透明桌宠 + 独立 AI 聊天 |
| SPA 导航 | iframe 嵌入 + postMessage | 页面隔离, 状态不互相污染 |
| 安全模型 | contextIsolation + sandbox | Electron 安全最佳实践 |
| API Key 存储 | safeStorage 加密 / session-only | 不落盘明文 Key |

---

## 11. 数据流总结

```
                    ┌──────────────┐
                    │   用户操作    │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ 日历/习惯 │ │ AI 聊天  │ │  音乐    │
        │ 笔记/提醒 │ │          │ │          │
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             │            │            │
             ▼            ▼            ▼
        ┌────────────────────────────────────┐
        │     window.kairosDesktop (Preload) │
        └────────────────┬───────────────────┘
                         │
                         ▼
        ┌────────────────────────────────────┐
        │        Main Process (IPC)         │
        └────────────────┬───────────────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │AppState  │  │AI Agent  │  │Music     │
    │Store     │  │LangChain │  │Library   │
    └────┬─────┘  └────┬─────┘  └────┬─────┘
         │             │             │
         ▼             ▼             ▼
    ┌────────────────────────────────────────┐
    │         JSON Files + SQLite            │
    │    C:\Users\...\AppData\Roaming\Kairos\│
    └────────────────────────────────────────┘
```
