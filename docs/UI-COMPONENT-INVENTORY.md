# Kairos UI Component Inventory

状态：`authoritative inventory`  
用途：在创建组件或重写页面前，先定位可复用实现和所有权边界。

## 1. 技术与所有权概览

Kairos 是 Electron + Vue 3 + Vite 应用，但仍保留部分静态 HTML/CSS/JavaScript 页面。Vue 负责应用外壳、主要路由和逐步迁移后的组件；legacy 页面继续拥有尚未迁移的 DOM、控制器和部分复杂交互。

不要因为同一功能同时出现 Vue 文件和 legacy 文件，就创建第三份实现。先确认当前路由实际使用哪一份。

| 层级 | 权威位置 | 责任 |
|---|---|---|
| Electron 主进程 | `electron/main/` | 窗口、系统、IPC、桌面行为 |
| Vue renderer | `renderer/src/` | AppShell、路由、全局组件、迁移后页面 |
| Legacy runtime | `app/pages/`, `app/features/`, `app/shell/` | 嵌入页面、原始控制器和共享播放器 |
| 主题 | `app/themes/claude-plus.css` | 语义 token 与跨页面主题覆盖 |
| 共享兼容样式 | `app/shared/styles/` | legacy/Tailwind/嵌入页面适配 |
| 参考资料 | `references/` | 设计和实现参考，不参与打包运行 |

## 2. 全局应用结构

| 模式/组件 | 当前实现 | 所有权与复用要求 |
|---|---|---|
| Vue 入口 | `renderer/src/main.ts`, `renderer/src/App.vue` | 保留 Pinia、router 和单一挂载点 |
| 路由 | `renderer/src/router/index.ts` | 新页面接入前检查当前 legacy/Vue 路由边界 |
| 应用外壳 | `renderer/src/components/AppShell.vue` | 必须复用；不得创建另一套顶栏或全局壳 |
| 顶栏与窗口控制 | `AppShell.vue`, `app/shell/navigation/stitch-shell.css` | 复用 64 px 顶栏、drag/no-drag 和系统窗口行为 |
| 全局 renderer 样式入口 | `renderer/src/styles.css` | 已导入共享主题、导航、设置、提醒、习惯、播放器和日程样式 |
| 主题注册 | `app/themes/theme-core.js` | 负责命名主题选择与加载，不要在页面内重建主题切换 |
| Claude + 主题 | `app/themes/claude-plus.css` | 颜色和语义表面权威来源 |

## 3. 页面清单

| 页面 | 当前路由实现 | 相关代码 | 修改原则 |
|---|---|---|---|
| Calendar | `EmbeddedLegacyView.vue` 嵌入 legacy | `app/pages/calendar/index.html`, `app/features/calendar/*` | 保持 iframe/event bridge、全屏与共享 player 布局 |
| Schedule | 当前 router 使用 `EmbeddedLegacyView.vue` | `app/pages/schedule/index.html`, `app/features/calendar/schedule-feature.*`, `date-range-picker.css` | `renderer/src/views/ScheduleView.vue` 是候选/迁移实现，不要误当当前路由 |
| Habits | `renderer/src/views/HabitsView.vue` | `renderer/src/stores/habits.ts`, `app/features/habits/*` | Vue 拥有页面；复用 editor、heatmap、drag 和 store |
| Music | `renderer/src/views/MusicView.vue` | `NativeMusicCandidate.vue`, `app/pages/music/*`, `app/shell/player/*`, `renderer/src/music/legacy-source.ts` | 共享 legacy player 是唯一音频所有者，不创建第二播放器 |
| AI Chat | legacy 页面/Calendar 集成 | `app/pages/ai-chat/index.html`, `app/features/assistant/ai-chat.*` | 保留 composer、消息事件和附件/工具结果契约 |
| Pet | Electron 独立透明窗口 | `app/pages/pet/index.html`, `app/assets/pets/desk-pet.png` | 保持透明、click-through、气泡和菜单主题适配 |

`renderer/src/views/ShellView.vue`、`ScheduleView.vue`、`NativeMusicCandidate.vue` 等文件可能代表预览、迁移候选或逐步替换中的实现。动手前必须以 router 和实际挂载链为准。

## 4. 全局可复用 Vue 组件

| 组件 | 文件 | 责任 | 禁止重复创建 |
|---|---|---|---|
| AppShell | `renderer/src/components/AppShell.vue` | 顶栏、导航、窗口控件、全局 overlays、播放器路由协调、宠物恢复 | app shell、title bar、route nav |
| SettingsDialog | `renderer/src/components/SettingsDialog.vue` | 设置对话框和原设置模块桥接 | settings modal/system |
| ReminderPanel | `renderer/src/components/ReminderPanel.vue` | 提醒列表与动作 | reminder drawer/panel |
| ReminderRuntime | `renderer/src/components/ReminderRuntime.vue` | 提醒运行时副作用 | 第二提醒定时器 |
| ToastHost | `renderer/src/components/ToastHost.vue` | 全局 Toast 栈、状态和动作 | 新 toast library/host |
| CloseChoiceDialog | `renderer/src/components/CloseChoiceDialog.vue` | 关闭、托盘和退出选择 | 第二退出确认弹窗 |
| LegacyScheduleDialogHost | `renderer/src/components/LegacyScheduleDialogHost.vue` | 在 Vue shell 中承载 legacy 日程编辑器 | 重写相同 legacy dialog bridge |

## 5. 状态与事件复用

| 状态/契约 | 文件 | 复用要求 |
|---|---|---|
| 应用状态 | `renderer/src/stores/app-state.ts` | 外观和设置同步继续走既有 store/bridge |
| Habits | `renderer/src/stores/habits.ts` | 习惯增删改、完成与排序复用此 store |
| Reminders | `renderer/src/stores/reminders.ts` | 面板和 runtime 共享同一状态 |
| Toasts | `renderer/src/stores/toasts.ts` | 用户反馈统一通过此 host/store |
| Music runtime mirror | `renderer/src/stores/music-runtime.ts` | Vue 只镜像 legacy 音频状态，不成为第二音频 owner |
| i18n | `renderer/src/i18n.ts`, `app/i18n/` | 所有用户可见文字更新中英文目录 |
| Music events | `kairos:music-state-changed`, `kairos:music-command` | 保留现有命令与快照契约 |
| Settings events | `kairos:settings-changed` | 主题和应用状态通过既有事件同步 |

## 6. 样式与 token 入口

| 文件 | 角色 | 使用方式 |
|---|---|---|
| `app/themes/claude-plus.css` | 命名主题与语义 token | 新颜色/表面角色只能在确认设计缺口后加入这里 |
| `app/shared/styles/tweakcn-theme.css` | TweakCN/legacy 兼容与组件覆盖 | 不把这里的历史硬编码当作新增组件模板 |
| `app/shared/styles/stitch-layout.css` | Calendar 等导入布局适配 | 修改前确认 embedded 页面影响 |
| `app/shell/navigation/stitch-shell.css` | 顶栏、导航、窗口控件 | 保持 Electron drag 规则 |
| `renderer/src/styles.css` | Vue renderer 集成样式 | 全局 Vue 层修正和共享组件样式入口 |
| `renderer/src/styles/schedule.css` | Vue Schedule 候选样式 | 注意当前 router 仍指向 legacy Schedule |
| `app/features/*/*.css` | 功能域样式 | 优先局部修改，使用语义 token 收敛 |
| `tailwind.config.cjs` | legacy 静态页面 Tailwind 设计值 | content 仅覆盖 `app/`，不要假定 Vue 模板使用 Tailwind |

## 7. 领域组件与模式

### Calendar / Schedule

- `kairos-calendar-glass`：日历主表面和壁纸上的可读性层。
- `calendar-grid`, `day-cell`：日期网格；selected 与 hover 必须区别。
- `schedule-dialog`, `schedule-native-dialog`：日程编辑器的 legacy/Vue 形态。
- `schedule-range-*`：日期区间选择器，优先复用而非引入第三方 picker。
- `schedule-workspace`, `schedule-tabs`, `schedule-filter-*`：数据表与筛选模式。

### Habits

- `real-habit-card`：习惯行/卡片。
- `habit-check-button`：完成状态；checked 可以实心，hover 不新增底板。
- `habit-drag-handle`, `habit-more`：已经接近目标的透明 icon button 模式。
- `habit-momentum`, `habit-ring`：总体进度和 streak。
- `habit-heatmaps`, `heat-cell`：连续完成记录。
- `habit-editor`：新增/编辑 dialog。
- `habit-icon-picker`, `habit-emoji-grid`：内容 emoji 选择，不作为系统 icon 模式。

### Music

- `#musicPlayer`：共享底部播放器，唯一音频控制器 UI。
- `music-transport-controls`：播放控制。
- `elastic-progress`, `elastic-volume`：进度与音量互动。
- `music-playlist-panel`, `music-queue-*`：播放列表和队列。
- `music-track-main`, `music-track-remove`, `music-like-button`：曲目操作。

### AI Chat

- `#aiPanel`, `#aiMessages`：聊天表面与消息区。
- `composer`, `.send`：输入与发送。
- `ai-message-*`：发送、接收、状态与元数据。
- `ai-attachment-*`, `ai-schedule-*`：附件和工具结果。

### Settings / transient UI

- `kairos-settings-dialog`, `kairos-settings-panel`：设置结构。
- `kairos-combobox-*`：自定义 combobox。
- `kairos-alert-*`：确认/警告 dialog pattern。
- `kairos-reminder-*`：提醒面板、列表与动作。
- `vue-toast-*`：Toast host 和单条通知。
- `vue-close-choice-*`：关闭应用选择。

## 8. 按钮 hover 迁移登记

目标规范：所有按钮 hover 不新增背景、阴影、光晕或浮起面，只改变文字、图标、线条、描边或内部图案。实心按钮可微调已有填充，但不增加第二层反馈。

以下位置包含需要在相关任务中渐进检查的旧样式：

| 区域 | 现状线索 | 迁移方向 |
|---|---|---|
| 顶栏图标按钮 | `stitch-shell.css` 中 `.kairos-icon-button:hover` | 背景保持透明，图标改 `--primary` |
| 窗口控件 | `stitch-shell.css` 中窗口按钮 hover 背景 | 保持透明，glyph 使用前景/危险色 |
| Schedule 统计卡 | `renderer/src/styles/schedule.css` 中 `.schedule-card:hover` | 取消新增阴影，使用边框和内部图标/文字变色 |
| Schedule 更多/筛选/分页 | schedule CSS 的按钮 hover | 背景不变，图标或描边变主色 |
| Habits 主按钮 | `habits-feature.css` 中 `.habit-primary:hover` | 移除 hover 阴影和上浮，保留现有填充微调 |
| Habits check/close/emoji | `habits-feature.css` 多处 hover 背景 | 用描边、图案或文字颜色；selected 可保留背景 |
| 全局通用按钮覆盖 | `tweakcn-theme.css` 中通用 `button:hover` | 避免给普通按钮统一填充 accent 背景 |
| Settings/alert 动作 | `claude-plus.css`, `tweakcn-theme.css` | 改文字、图标、描边；主按钮只微调已有填充 |
| Player 控件 | `music-player.css` | 图标/线条变色，去掉控制按钮 hover 底板和阴影 |
| Pet restore | `renderer/src/styles.css` 中 `.vue-pet-restore:hover` | 背景和阴影不变，宠物图标/描边变色 |
| Toast/Reminder 动作 | renderer/shared feature styles | 背景不变，文字/描边变色 |

此表是审查入口，不是授权执行一次性全局重写。只在触及相应区域时安全迁移，并验证 selected、active、disabled、focus-visible。

## 9. 创建新组件前的决策树

1. 当前页面是否已有相同操作或视觉模式？有则复用。
2. 全局组件是否已经承担该职责？有则扩展，不能另建系统。
3. legacy 页面是否仍是行为 owner？是则通过现有 bridge/event 连接。
4. 现有语义 token 是否足够？足够则禁止新增局部设计值。
5. `references/README.md` 中哪一类素材能补充结构或动效？只取所需部分。
6. 仍存在缺口时，先说明缺口，再增加最小组件或 token。

## 10. 验证建议

- Vue/TypeScript：`pnpm typecheck`
- 完整静态与单元/集成检查：`pnpm check`
- renderer 构建：`pnpm renderer:build`
- 视觉验证：运行 `pnpm dev`，检查目标宽度和状态
- 每个按钮至少检查：rest、hover、focus-visible、active/selected、disabled
- Electron 专属区域额外检查：drag/no-drag、最小化/最大化/关闭、透明窗口、底部 player 对齐
