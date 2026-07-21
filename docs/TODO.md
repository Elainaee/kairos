# Kairos 后续开发 TODO

> 更新日期：2026-07-15
>
> 当前基准：主视图已经按用户确认的「原版第二种」参考图完成当前验收。后续 TODO 不再追主视图像素级还原，只追功能、稳定性、数据层、联调和发布。

## 状态说明

- `[ ]` 待完成
- `[x]` 已完成
- `[~]` 已部分完成，或仍需要真实环境/人工验收
- `P0` 上线前必须完成
- `P1` 核心增强
- `P2` 后续版本

## 当前工程状态

- [x] 已建立 Electron 桌面应用工程，入口为 `package.json`
- [x] 已建立 Git 仓库，并通过 `.gitignore` 排除依赖、密钥、运行时数据和外部参考源码
- [x] 已配置启动脚本：`start-kairos.cmd`、`start-kairos.ps1`，并统一委托到 `scripts/kairos-dev.cjs`
- [x] 已有主界面：`app/index.html`
- [x] 已有独立页面：`app/schedule.html`、`app/habits.html`、`app/music.html`
- [x] 已有独立 AI 窗口：`app/ai-chat-window.html`
- [x] 已有 SPA 壳与页面嵌入逻辑：`app/stitch-shell.js`
- [x] 已有日程/任务交互与共享状态：`app/schedule-feature.js`
- [x] 已有习惯打卡独立功能：`app/habits-feature.js`
- [x] 已有本地音乐库与共享底部播放器：`electron/music-library.js`、`app/music-player.js`
- [x] 已接入网易云音乐服务：`electron/netease-api-service.js`
- [x] 已有 AI 聊天、会话、附件、上下文、工具权限与外部搜索基础
- [x] 已有 LangChain Agent 雏形：`electron/agent/`
- [x] 已有测试脚本覆盖 Electron 服务、静态资源契约、网易云、电竟搜索、AI intent、agent、提醒核心、习惯核心等基础流程
- [x] 主界面已经完成当前视觉验收
- [~] 当前仍是 HTML/CSS/JS 原型结构，尚未拆成正式组件体系
- [~] 当前持久化仍以本地 JSON store 为主；已加入 app-state schema v2、迁移前备份、导入/恢复前自动备份、备份列表/读取/恢复 API、当前状态导出、JSON 导入、设置页/CLI 迁移审计、桌面 userData 目录审计与迁移落盘，并已接入 `kairos.sqlite` 作为 app-state 快照、核心索引表、辅助 JSON store 摘要镜像，以及 app-state / music-state / ai-data / ai-settings / netease-api-state JSON 丢失或损坏时的恢复来源
- [x] 当前电脑已能找到系统 Node.js/npm：`D:\nodejs\node.exe`、`D:\nodejs\npm.ps1`；已新增 `scripts/kairos-doctor.cjs` 用于诊断 Node/npm/pnpm/Electron 路径，并让启动脚本在 PATH 缺失时优先尝试该本机 Node
- [~] 当前工作区仍有未提交改动；下一次正式交付前需要重新跑 `pnpm check`、`pnpm dist:win`、`pnpm release:manifest`、`pnpm verify:dist`，必要时再跑 `pnpm verify:installer`

## P0 桌面应用工程

- [x] 建立 Electron 桌面应用工程
- [x] 建立 preload API：AI、pet、app state、music、netease、工具权限等
- [x] 建立 AI 数据 store、应用状态 store、附件服务、上下文管理、音乐库和工具运行时；AI 会话/消息/记忆可在 `ai-data.json` 丢失或损坏时从 SQLite 镜像恢复，AI provider 设置可在 `ai-settings.json` 丢失或损坏时从 SQLite 镜像恢复
- [x] 建立 `npm start` / `pnpm dev` 入口和 Windows 启动脚本
- [x] 建立 `npm run check` / `pnpm check`，包含语法检查和 Node 测试
- [x] 保存主窗口尺寸与位置，重启后恢复并防止恢复到屏幕外
- [x] 建立单实例运行保护，重复启动时聚焦已有主窗口
- [x] 拦截外部链接并交给系统浏览器打开
- [x] 建立原生应用菜单与受限快捷键路由：Alt+1 至 Alt+5 切换核心页面，Ctrl+, 打开设置，Ctrl+Shift+A 打开 AI 对话，并可从菜单显示/隐藏 桌宠
- [x] 支持 macOS activate 事件恢复或重建主窗口
- [x] 配置 Electron Builder、Windows NSIS 安装包和 portable 产物脚本
- [x] 打包配置已排除 `.env*`、测试、参考资料和设计源文件
- [x] 保存主题和用户偏好到桌面 `app-state.json`，并保留 localStorage 作为旧数据 fallback
- [x] Windows 解包版、NSIS 安装包和 portable 产物已生成到 `release/`
- [x] 安装并配置系统 Node.js/npm，避免只依赖 Codex 内置运行时；当前 Node/npm 已存在于 `D:\nodejs\`，启动脚本会在 PATH 缺失时尝试该路径
- [x] 增加一键开发启动脚本/说明，优先使用本机 Node，启动缺依赖时给出 `pnpm install` / `npm install` / `doctor` 提示
- [ ] 评估是否继续 Electron 原生 HTML 架构，或迁移到 React + TypeScript
- [ ] 若迁移 React，拆分主视图、日程、习惯、音乐、AI、桌宠 和 shell 组件
- [ ] 建立正式主题、字体、颜色、间距、图标和图片资源系统
- [x] 接入 SQLite 并建立数据库迁移机制；`kairos.sqlite` 是运行时唯一主库，v3 已将学习计划合并为日程并删除旧镜像表。
- [~] 建立任务、日程、习惯、打卡、笔记、设置、音乐、网易云账号缓存的正式数据模型；当前 app-state JSON 已有 schema v2、设置页迁移审计摘要、`pnpm audit:app-state`、`pnpm audit:desktop-data`、SQLite app-state 镜像，以及 AI/音乐/网易云/设置 store 摘要索引和恢复 fallback，完整 repository 模型仍待设计
- [~] 将数据访问封装为独立 repository/service 层；当前 `AppStateRepository` 已承接日程/任务/笔记等 app-state collection CRUD，`SettingsRepository` 已承接 AI/联网设置和网易云登录状态的原子排队写入与 SQLite 恢复，音乐和 AI 会话 store 仍待继续统一

## P0 日程与任务

- [x] 支持创建、编辑、删除日程与任务
- [x] 字段包含标题、类型、日期、开始/结束时间、提醒、优先级、备注和状态
- [x] 状态包含待办、进行中、已完成、已过期
- [x] 只有用户明确勾选后才计为完成
- [x] 完成项与未完成项在颜色、文字和状态标识上清晰区分
- [x] 删除前提供确认或可撤销提示
- [x] 日程同步显示在月历日期和右侧当天时间轴
- [x] 支持按日期、类型、状态和优先级筛选
- [x] 支持跨天任务与无具体时间的全天任务
- [x] 日程列表已支持关键字搜索、类型筛选、状态卡片筛选和可见项批量完成/重开
- [x] 新增或编辑有具体时间的日程时，会对同日未完成日程做时间重叠检测，并在保存前要求确认
- [x] 补充日程拖拽改期、时间调整或更自然的编辑入口；月历日程 chip 支持拖到日期格改期、保留多日跨度并提供 Undo；右侧当天时间轴支持按钮微调和通过拖拽手柄按 15 分钟调整时间并提供 Undo，时间边界规则已收敛到 `calendar-core` 并有单测覆盖
- [~] 补充批量操作、搜索和更稳定的冲突提示；当前已有列表搜索、类型/状态筛选、可见项批量完成/重开、编辑时冲突预览和保存前时间冲突确认，仍需交互验收
- [ ] 将当前 JSON 状态迁移到正式数据库模型
- [x] 抽出月历生成与日期覆盖逻辑到 `app/calendar-core.cjs`，补充跨月、跨年、闰日、周起始、跨天日程和周期日程覆盖测试

## P0 习惯与每日打卡

- [x] 「习惯打卡」已独立于普通任务，不再使用任务列表替代
- [x] 默认示例包含阅读、锻炼、背单词、早睡
- [x] 支持添加、编辑、删除习惯
- [x] 支持拖动排序习惯
- [x] 每个习惯按自然日独立保存完成记录
- [x] 显示连续打卡、本周完成情况和历史记录/热力格
- [x] 已抽出 `app/habit-core.cjs`
- [x] 已覆盖跨月、跨年、闰日、今日/昨日连续、漏打断档、补签开关和 84 天热力窗口测试
- [x] 设置页已提供补签规则配置，默认关闭补签；新建习惯会读取全局默认值，已有习惯保留自己的补签开关
- [~] 主界面习惯本已接入习惯数据，仍需最终交互验收
- [~] 时区切换仍需人工验收
- [x] 支持补签规则配置，默认关闭补签
- [ ] 将习惯数据迁移到正式数据库模型

## P0 音乐播放器：本地音乐

- [x] 底部迷你播放器支持封面、歌曲名、歌手、进度、时间、播放/暂停、上一首、下一首、音量、喜欢、播放模式和队列入口
- [x] 已建立本地音乐库服务，支持本地 JSON 状态保存，并可在 `music-state.json` 丢失或损坏时从 SQLite 镜像恢复曲库、队列和播放进度
- [x] 支持导入单个/多个本地音乐文件
- [x] 支持导入文件夹并扫描音频文件
- [x] 支持 MP3、FLAC、WAV、M4A、MP4、AAC 等常见扩展
- [x] 支持读取 ID3 / FLAC 元数据，并提取封面缓存
- [x] 支持没有封面时显示占位图
- [x] 支持播放队列、播放/暂停、上一首、下一首、进度跳转、音量、播放模式和最近位置
- [x] 支持播放列表/文件夹导入、隐藏/移除、历史、喜欢、本地播放次数等基础状态
- [x] 支持队列面板拖动排序
- [x] 文件被移动/删除时已支持可见降级、Missing 标记和清理 API
- [~] 仍需完整手测导入和 Windows 权限不足真实场景；不支持格式、空音频文件拒绝、非空损坏标签回退、超大内嵌封面跳过、导入失败原因可读提示、重启恢复、路径失效可见降级、`music-state.json` 丢失/损坏恢复已有自动化覆盖，其中路径失效与恢复已进入打包产物 `pnpm verify:dist` smoke
- [ ] 用真实音乐文件手测：多文件导入、文件夹扫描、封面读取、队列恢复、删除源文件后的 Missing 降级，以及 Windows 权限不足/被占用文件场景
- [~] 补充本地音乐数据模型迁移到 SQLite 的方案；当前已具备 SQLite payload 镜像与恢复 fallback，正式 repository 读写仍待继续

## P0 音乐播放器：网易云音乐

- [x] 已安装并接入 `NeteaseCloudMusicApi`
- [x] 已建立网易云服务：登录状态、二维码登录、手机验证码登录、退出登录
- [x] 支持网易云搜索歌曲
- [x] 支持网易云搜索首页：每日推荐歌曲和热门歌单
- [x] 支持读取用户创建歌单、收藏歌单，并按分页拉取完整列表
- [x] 支持读取歌单歌曲，并按分页拉取完整歌曲列表
- [x] 支持读取喜欢的音乐
- [x] 支持读取播放历史
- [x] 支持播放网易云歌曲并刷新播放 URL
- [x] 支持喜欢/取消喜欢网易云歌曲
- [x] 支持收藏/取消收藏网易云歌单
- [x] 本地音乐和网易云音乐已统一进入共享播放器队列
- [x] 网易云播放状态、本地队列和来源切换已有防串流处理
- [x] 网易云登录 cookie 可在 `netease-api-state.json` 丢失或损坏时从 SQLite 镜像恢复
- [x] 网易云播放 URL 获取失败、接口异常、会员/购买限制、版权限制、无可播 URL 和试听限制会返回可读降级信息，并能透传到底部播放器刷新 URL 失败提示
- [x] 设置页已提供网易云登录状态、退出/清理会话、清理本地网易云播放缓存、刷新账号数据和音质偏好入口；音质偏好会写入 app-state settings，并在播放/刷新 URL 时传给网易云 `level`
- [~] 网易云功能需要真实账号实测登录、歌单、喜欢、历史、播放 URL 过期、不可播放歌曲和接口失败
- [x] 已明确网易云第一版合规范围：仅个人授权账号、个人学习场景、不做音乐内容再分发或商业化播放；详见 [Netease Music first-version scope](./NETEASE-COMPLIANCE.md)，设置页和登录入口也会显示个人使用范围提示
- [~] 为网易云登录失败、验证码失败、接口限流、歌曲无版权/不可播放提供清晰 UI 提示，并补充服务层/前端契约测试；播放失败与登录/验证码失败已有可读返回和自动化覆盖，真实接口限流与账号流程仍需实测
- [~] 评估是否需要缓存封面/歌词，以及缓存清理策略；当前已支持在 Settings > Music 清理本地网易云播放队列/播放快照缓存，歌词/封面深缓存仍待设计
- [x] 设计网易云账号设置页：登录状态、退出登录、音质偏好、刷新账号数据、清理会话、清理本地播放缓存
- [x] 补充网易云真实接口的可重复验收清单：详见 [Windows 发布验收清单](./WINDOWS-RELEASE-CHECKLIST.md) 的网易云真实账号验收

## P1 AI 与 Agent 集成

- [x] 已有 OpenAI 与豆包 provider 基础接入
- [x] 已有 API Key 保存、会话模式、provider 测试、流式回复、停止生成
- [x] 已有会话列表、会话创建、会话读取、会话更新、会话删除
- [x] 已有附件保存、解析、图片发送、文档文本提取和临时附件清理
- [x] 已有上下文长度评估、摘要和新会话延续基础
- [x] 已有工具权限、提案、确认写入日程/任务/习惯/笔记/学习计划的基础运行时
- [x] 已有从图片/附件提取日程结构的基础接口
- [x] 已有独立 AI 聊天窗口，桌宠 点击可打开
- [x] 已有 AI intent 识别，可区分附件提取、URL 提取、赛事搜索澄清等场景
- [x] 已有 LangChain Agent 雏形和工具封装
- [x] 已有外部公开来源搜索权限控制
- [~] Anthropic 与 Google Gemini provider 仍是 `not_implemented`
- [~] AI 工具调用事件协议仍需最终联调
- [~] AI 不可用时，日历、任务、习惯、提醒和音乐仍可独立运行；已有服务层和静态契约测试，仍需界面端到端验收
- [ ] 约定 AI 面板打开/关闭、发送消息和接收回复的接口类型
- [x] 已建立 桌宠 状态、动作和气泡文本的安全 IPC 事件协议（主进程白名单校验）
- [ ] 合并/整理 AI 分支后解决组件、样式、状态管理和数据模型冲突
- [ ] 对 AI 入口、流式回复、错误状态、取消响应、上下文摘要和工具确认进行端到端联调
- [ ] 继续追踪 `docs/AI-INTERFACE-GAPS.md` 中列出的接口缺口

## P1 提醒系统

- [x] 建立本地提醒调度服务，应用重启后仍能恢复提醒
- [x] 截止日期任务默认提前一天提醒
- [x] 比赛或活动默认提前 30 分钟提醒
- [x] 提醒支持完成、稍后提醒和打开详情
- [x] 提醒可通过 桌宠 气泡展示，但不依赖 AI 服务可用性
- [x] 桌面环境支持可在 Settings > Reminders 开关的 Windows 原生通知（默认开启）；Windows AppUserModelID 与安装包 `app.kairos.desktop` 已统一，点击通知会聚焦 Kairos、打开日程页并定位到对应日程，关闭或系统不支持时自动保留页面内提醒和 桌宠 提醒
- [x] 处理睡眠唤醒、系统时间变化和错过提醒的补发逻辑
- [x] 提醒时间计算已抽成 `app/reminder-core.cjs`
- [x] 已覆盖默认提前规则、重启后到期触发、错过提醒、稍后提醒、已完成/已关闭不触发
- [x] 设置页已提供提醒默认规则配置入口：Deadline、Event、Match 默认提前时间和 Snooze 时长；新建日程与提醒弹窗会读取该设置
- [ ] 将提醒 UI 与最终主视图样式统一
- [x] 增加提醒规则的用户可配置入口
- [ ] 联调赛事日程、AI 提取日程与提醒默认规则

## P1 桌宠 桌面陪伴

- [x] Electron 已有独立 pet window 创建、隐藏、显示、移动、点击打开 AI 的 IPC
- [x] 已保存 pet 可见性状态
- [x] 已支持 pet mouse passthrough、拖动节流和右下角 restore 按钮
- [x] 主界面 桌宠 已作为 AI 入口方向接入
- [~] 桌宠已恢复为原版角色图，运行时资源位于 `app/assets/pets/desk-pet.png`；现有浮动、开心和右键菜单交互继续保留
- [~] 已实现眨眼、呼吸、困倦、开心和安静待机的轻量动画；当前原图是完整插画，真正的手臂挥手等逐帧动作需未来提供分层或动作素材
- [ ] 动画保持轻柔，避免频繁跳动或打断用户
- [ ] 支持主窗口右上角入口与独立悬浮角色两种状态的统一状态管理
- [~] 已根据提醒、AI 对话入口、日程完成和习惯打卡切换动作与气泡；为避免音乐播放频繁打扰，时间与音乐状态暂不触发气泡反馈
- [x] Settings > Appearance 已提供 Reduce motion 开关；状态会持久化，并同步到主视图及嵌入的日程、习惯、笔记和音乐页面

## P1 笔记与心情

- [x] 应用状态模型中已有 `moods`、`notes` 字段预留，并已加入 `app/note-core.cjs` 作为按日期笔记与心情标签的共享核心
- [x] 支持按日期记录学习笔记、日记和心情；已新增 Notes 独立页面和 SPA 导航入口，支持按日期保存笔记与今日心情
- [x] 支持心情标签、文本、图片附件和关联任务；Notes 页面已支持心情、文本、标签、关联日程 ID、附件文件选择、附件移除和图片本地预览
- [x] 在月历上显示当天已有记录的轻量标记；主日历日期格会读取 `notes` 和 `moods` 并显示小型 note/mood marker
- [x] 提供按日期与关键词搜索；Notes 页面已提供关键词和日期过滤
- [x] 支持编辑、删除和本地持久化；Notes 页面已支持编辑/删除，并通过共享 `kairos-mvp-state` 与 desktop app-state 保存

## P1 图片识别与确认

- [x] 已有附件上传、图片准备和 AI 日程提取基础接口
- [~] 图片内容识别能力依赖 AI provider 可用性
- [ ] 支持拖入、粘贴或选择课程表、通知和活动截图
- [ ] 将识别结果显示为可编辑的结构化预览
- [ ] 用户确认后才允许写入日程、任务或提醒
- [ ] 标记低置信度字段并要求用户检查
- [ ] 保留原图来源，便于回看和纠错

## P1 测试与验收

- [x] 已有 Electron 服务层基础测试
- [x] 已有 legacy `localStorage` 状态迁移测试
- [x] 已有 AI 工具提案确认写入应用状态测试
- [x] 已有上下文管理和附件清理测试
- [x] 已有静态资源/前端契约测试，覆盖音乐、网易云、AI 窗口等关键 UI 约定
- [x] 已有 AI intent、电竟搜索和 LangChain Agent 基础测试
- [x] 已记录最新 `pnpm check` 结果：133 passed, 0 skipped, 0 failed（2026-07-15 复跑通过）
- [x] 已建立 `pnpm release:manifest`，为 installer、portable、blockmap 和 unpacked exe 生成 size / SHA-256 发布清单
- [x] 已建立 `pnpm verify:dist` 发布产物验收
- [x] 已建立可选 `pnpm verify:installer` 和完整门禁 `pnpm verify:release:full`，覆盖静默安装、快捷方式、启动、重复启动聚焦、卸载、重装与临时 `userData` 保留
- [x] 本轮 `pnpm check` 已通过 151 项，`pnpm dist:win`、`pnpm release:manifest` 和 `pnpm verify:dist` 已通过；最新版解包版和 portable 均完成启动、二次启动读回、SQLite 恢复及资源审计，`verify:dist` 5/5 通过。减少动态效果已进入最新 Windows 产物；如需覆盖安装/卸载流程，再运行 `pnpm verify:installer`
- [x] 已补充 [Windows 发布验收清单](./WINDOWS-RELEASE-CHECKLIST.md)，覆盖安装器、portable、本地音乐、网易云真实账号、界面缩放、键盘焦点和减少动态效果的人工验收步骤
- [x] `pnpm verify:dist` 已接入临时 `userData` 桌面数据审计，打包 smoke 生成的 app-state、相关 JSON store、`kairos.sqlite` 和 AI/音乐 store 摘要索引会被自动检查是否可解析且迁移就绪，并覆盖删除 `app-state.json` 后从 SQLite 恢复任务/习惯数据、删除 `music-state.json` 后从 SQLite 恢复曲库与队列、删除本地音乐源文件后通过 renderer music bridge 标记 `missing_file` 可见降级、删除 `ai-data.json` 后从 SQLite 恢复 AI 会话；`pnpm check` 另已覆盖 `ai-settings.json` 与 `netease-api-state.json` 的 SQLite 恢复 fallback；portable 产物已覆盖同一临时 `userData` 二次启动读回 app-state、音乐和 AI smoke 数据
- [x] 当前 Windows 用户真实 `userData` 已通过 `pnpm audit:desktop-data` 审计；`app-state.json` 与 `ai-data.json` 可解析，可选的音乐/网易云/窗口状态文件尚未生成但不构成失败
- [~] AI 不可用时核心独立运行已有自动化证据，仍缺界面端到端验收记录
- [x] 日期计算、月历生成、跨天/周期日程覆盖和连续打卡已有 `calendar-core` 与 `habit-core` 单测
- [~] 提醒核心已有自动化测试，默认规则与 Snooze 设置已有设置页/日程/提醒静态契约覆盖；真实桌面休眠/系统时间修改仍需人工验收
- [~] 本地音乐不支持格式、空音频拒绝、非空损坏标签回退、超大内嵌封面跳过、导入失败原因提示、路径失效可见降级和 `music-state.json` 丢失/损坏恢复已有服务层、UI 契约和打包产物 smoke 自动化，Windows 权限不足真实场景仍需验收
- [x] 网易云播放失败可读降级已有服务层纯函数测试、静态契约测试和播放器刷新错误透传契约
- [x] 网易云账号设置、音质偏好、清理本地播放缓存和个人使用范围提示已有静态契约测试，且 `pnpm check` 覆盖音质参数传入播放/URL 刷新请求与设置页缓存清理事件
- [ ] 按 [Windows 发布验收清单](./WINDOWS-RELEASE-CHECKLIST.md) 使用真实网易云账号测试登录、搜索、歌单、喜欢、历史、播放、URL 过期和不可播放歌曲
- [ ] 按 [Windows 发布验收清单](./WINDOWS-RELEASE-CHECKLIST.md) 测试键盘操作、焦点状态、文本可读性和减少动态效果
- [ ] 按 [Windows 发布验收清单](./WINDOWS-RELEASE-CHECKLIST.md) 在 100%、125%、150% Windows 缩放下检查布局
- [ ] 按 [Windows 发布验收清单](./WINDOWS-RELEASE-CHECKLIST.md) 在常见桌面窗口尺寸下检查无重叠、裁切和文本溢出
- [~] Windows 静默安装、快捷方式创建/清理、启动、重复启动聚焦、卸载、重装和临时 `userData` 保留 smoke 已通过；portable 首次启动、写入与同一 `userData` 二次读回已通过自动化验证，交互安装流程和 portable 真实用户数据目录行为仍需人工验收

## P2 后续扩展

- [ ] 网易云歌词展示与桌面歌词
- [~] 网易云歌词/封面缓存与桌面歌词；音质选择和本地播放缓存清理已完成
- [ ] 更多电竞项目和赛事订阅
- [ ] 学习统计、周报和趋势复盘
- [~] 数据备份、导出、恢复与多设备同步方案；app-state 已有迁移备份、导入/恢复前自动备份、备份列表/读取/恢复 API，并已在设置页 Data 面板提供备份刷新、预览、恢复、当前 app-state 导出和 JSON 导入入口；多设备同步仍未完成
- [ ] 可选主题、角色服装和更多动作资源

## 下一步建议

- [x] 第一优先级：整理本机 Node/npm/pnpm 启动环境，让你不用依赖 Codex 内置 runtime，也不用手动输入 Electron 可执行文件路径
- [ ] 第二优先级：按发布验收清单用真实账号验收网易云登录、歌单、喜欢、历史、播放、URL 过期、接口限流和不可播放歌曲
- [x] 第三优先级：修复 portable 产物二次启动使用同一 `userData` 时 app-state smoke marker 被空状态覆盖的问题，并让 `pnpm verify:dist` 恢复 5/5 通过
- [ ] 第四优先级：按发布验收清单完整手测本地音乐导入、文件夹扫描、封面读取、队列恢复和路径失效
- [ ] 第五优先级：补充 AI provider 不可用时的日程、任务、习惯、提醒、音乐界面端到端验收记录
- [ ] 第六优先级：按发布验收清单补充提醒恢复、窗口缩放和真实界面日期行为相关自动化/人工验收
- [ ] 第七优先级：把 桌宠 动作素材精修成稳定、温柔、不打扰的动画
- [ ] 第八优先级：决定是否迁移 React + TypeScript；如果不迁移，则整理当前原生 HTML/CSS/JS 的模块边界
- [ ] 第九优先级：继续把音乐、网易云、AI、设置等 JSON store 升级到 SQLite repository，并准备完整数据迁移

## 完成标准

- [x] 主视图在基准分辨率下通过视觉对照验收
- [~] 日程、任务、习惯和音乐核心流程已基本可用，仍需完整离线/在线验收
- [ ] 本地音乐和网易云音乐可在同一队列中稳定播放，并能处理不可播、过期、断网和路径失效
- [~] 数据重启后不丢失；打包后 app-state 已覆盖任务/习惯 marker 重启读回，并已加入 app-state schema v2、设置页/CLI 迁移审计、桌面 userData 目录审计、迁移前备份、导入/恢复前自动备份、备份列表/读取/恢复、导出/导入、迁移落盘测试、`kairos.sqlite` 镜像、辅助 store 摘要索引，以及 app-state / music-state / ai-data / ai-settings / netease-api-state JSON 丢失或损坏时从 SQLite 快照恢复；完整 SQLite repository 升级尚未实现
- [ ] 桌宠 动画和 AI 入口不影响主界面性能与操作
- [~] AI 不可用时核心日程、任务、习惯、提醒、音乐仍可独立运行；已有服务层和提醒前端静态契约自动化证据，仍缺界面端到端验收记录
- [~] 已重新生成可安装的 Windows 应用，并完成临时 `userData` 干净启动、unpacked app-state 重启读回、portable renderer smoke 与二次启动读回、静默安装、快捷方式创建与清理、重复启动聚焦、静默卸载、重装与数据保留验收；仍需完成交互安装和 portable 普通双击数据目录手测
# 2026-07-19 Structure Refactor

- [x] Reorganized renderer code into `pages/`, `features/`, `shell/`, `shared/`, and classified `assets/` directories without changing user data paths.
- [x] Reorganized Electron code into `main/`, `preload/`, `services/`, `data/`, `migrations/`, `scripts/`, and categorized tests.
- [x] Rebuilt `release/win-unpacked`, refreshed `release/manifest.json`, and passed source tests (151/151) plus distribution verification (5/5).
- [ ] Manually verify real NetEase Cloud Music account workflows, window scaling, keyboard focus, and real desktop reminder timing before public release.
