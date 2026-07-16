# Kairos Windows 发布验收清单

> 更新日期：2026-07-15
>
> 目标：验证 Kairos 作为 Windows 桌面应用可安装、可启动、可卸载，并且不会丢失用户数据。自动验收负责可重复的构建与包内容检查；安装器、卸载器和 portable 行为仍需人工执行确认。

## 自动验收

在发布前运行：

```powershell
pnpm verify:release
```

正式发版前如需连同安装器 smoke 一起验证，运行：

```powershell
pnpm verify:release:full
```

等价于：

```powershell
pnpm check
pnpm dist:win
pnpm release:manifest
pnpm verify:dist
```

当前自动覆盖：

- [x] `npm start` / `pnpm dev` / `start-kairos.cmd` / `start-kairos.ps1`：统一走 `scripts/kairos-dev.cjs`，不再要求手动输入 `node_modules\electron\dist\electron.exe .`。
- [x] `npm run doctor`：输出 Node、npm、pnpm、corepack 和本地 Electron 路径，用于排查 PATH 或依赖安装问题。
- [x] `pnpm check`：语法检查与 Node 测试；当前最新结果为 150 passed, 0 failed。
- [x] `pnpm dist:win`：生成 `win-unpacked`、NSIS installer 和 portable exe。
- [x] `pnpm verify:dist`：确认发布产物存在且命名不冲突。
- [x] `pnpm release:manifest`：生成 `release/manifest.json`，记录 installer、portable、blockmap 和 unpacked exe 的 size / SHA-256。
- [x] `pnpm verify:dist`：校验 `release/manifest.json` 中的 size / SHA-256 与实际产物一致。
- [x] `pnpm verify:dist`：检查 `app.asar` 不包含 `.env*`、`docs/`、`Brainstorm/`、`references/`、测试文件或启动脚本。
- [x] `pnpm verify:dist`：启动 `release/win-unpacked/Kairos.exe`，使用临时 `userData` 验证主窗口可加载，初始化核心状态文件和 `kairos.sqlite`，并在打包后的渲染进程中确认日历、今日计划、习惯、音乐、提醒和 AI 面板入口已挂载；随后用同一 `userData` 二次启动，确认任务/习惯 app-state marker、本地音乐导入记录、播放队列、音量、播放进度和 AI 会话可读回；再删除 `app-state.json` 并三次启动，确认任务/习惯数据可从 SQLite 快照恢复；继续删除 `music-state.json` 并四次启动，确认本地音乐曲库和队列可从 SQLite 镜像恢复；最后删除 `ai-data.json` 并五次启动，确认 AI 会话可从 SQLite 镜像恢复；同时审计临时 `userData` JSON store、SQLite 数据库以及 AI/音乐 store 摘要索引是否可解析且迁移就绪。
- [x] `pnpm verify:dist`：启动 `release/Kairos-0.1.0-win-x64-portable.exe`，使用临时 `userData` 验证 portable 可启动并挂载同一组核心 UI，确认任务/习惯、本地音乐和 AI 会话 smoke 可写入状态；随后再次启动 portable，确认同一临时 `userData` 可读回这些状态，并清理本次临时 portable 进程。
- [x] `pnpm verify:release`：串联 `check`、`dist:win`、`release:manifest`、`verify:dist`，已完成一次端到端发布门禁验证。
- [x] `pnpm verify:release:full`：串联默认发布门禁与 `verify:installer`，用于正式发版前完整验证；该命令会真实安装和卸载应用。
- [x] `pnpm audit:app-state`：审计当前用户 `app-state.json` 或指定 JSON 导出，输出迁移摘要并在发现数据问题时返回非零退出码。
- [x] `pnpm audit:desktop-data`：审计整个 Kairos `userData` 目录，检查 app-state、AI、音乐、网易云、AI 设置和窗口状态 JSON 是否存在且可解析；如果 `kairos.sqlite` 已生成，也会检查数据库迁移、核心索引表和 JSON store 摘要索引健康。
- [x] `pnpm check`：覆盖 `app-state.json`、`music-state.json`、`ai-data.json`、`ai-settings.json` 和 `netease-api-state.json` 丢失或损坏时的 SQLite 恢复 fallback。

当前不自动覆盖：

- [x] NSIS 静默安装、桌面/开始菜单快捷方式创建与清理、已安装应用启动、重复启动聚焦、卸载、重装和临时 `userData` 保留已通过 `pnpm verify:installer` 验证；交互安装流程仍需手动确认。
- [x] 已安装应用的启动、关闭和重复启动聚焦已通过 `pnpm verify:installer` 自动验证。
- [ ] 升级安装后的数据保留。
- [ ] 卸载后的数据保留。
- [~] portable 便携版的启动、核心 UI 挂载和同一临时 `userData` 重启读回已自动覆盖；普通双击场景的数据目录位置与保留行为仍需手动确认。
- [ ] 真实网易云账号登录、歌单、喜欢、历史、播放、URL 过期、接口限流和不可播放歌曲。
- [ ] 真实本地音乐文件夹导入、封面读取、Windows 权限不足/文件占用场景。
- [ ] 100%、125%、150% Windows 缩放下的主界面、设置页、音乐页可读性与无重叠。

## 产物位置

- Installer：`release/Kairos-0.1.0-win-x64-setup.exe`
- Portable：`release/Kairos-0.1.0-win-x64-portable.exe`
- Unpacked：`release/win-unpacked/Kairos.exe`
- Blockmap：`release/Kairos-0.1.0-win-x64-setup.exe.blockmap`
- Manifest：`release/manifest.json`

## 数据审计

审计当前系统用户的 Kairos app-state：

```powershell
pnpm audit:app-state
```

审计当前系统用户的整个 Kairos userData 目录：

```powershell
pnpm audit:desktop-data
```

审计某个导出的 JSON：

```powershell
pnpm audit:app-state -- D:\path\to\kairos-app-state.json
```

审计某个 userData 目录：

```powershell
pnpm audit:desktop-data -- D:\path\to\Kairos-userData
```

`audit:app-state` 会输出 schema 版本、日程/任务/习惯/笔记/心情等数量，以及重复 id、无效日期、非法日程类型、空习惯名、无效打卡日期等迁移风险。`audit:desktop-data` 会额外检查 `ai-data.json`、`music-state.json`、`netease-api-state.json`、`ai-settings.json`、`pet-state.json` 和 `window-state.json` 是否存在且可解析；可选文件缺失只会记录为缺失，不会导致失败。如果 `kairos.sqlite` 已存在，审计会打开数据库并读取 schema migration、app-state snapshot、核心索引表统计和 JSON store 摘要索引。审计通过时退出码为 `0`；发现数据问题时退出码为 `2`；文件不存在或 JSON 解析失败时退出码为 `1`。

当前结果：当前 Windows 用户 `C:\Users\lenovo\AppData\Roaming\Kairos` 已通过 `pnpm audit:desktop-data` 审计；`app-state.json` 与 `ai-data.json` 可解析，音乐、网易云、AI 设置、pet 和窗口状态文件尚未生成，均作为可选缺失记录。

## 安装器验收

可选自动 smoke：

```powershell
pnpm verify:installer
```

它会静默安装到临时目录，验证桌面快捷方式和开始菜单快捷方式指向本次安装目录，使用临时 `userData` 启动已安装的 `Kairos.exe`，再启动第二次确认单实例锁会聚焦已有进程而不是保留第二个 `Kairos.exe`，静默卸载并确认快捷方式被清理，重新安装到同一临时目录，再次使用同一 `userData` 启动并确认数据保留，最后清理临时安装目录和临时 `userData`。该命令会真实运行 installer / uninstaller，因此不要放入默认 `pnpm verify:release`；正式发布前可通过 `pnpm verify:release:full` 一并运行。

当前结果：已通过最新 `pnpm verify:installer`，覆盖静默安装、桌面/开始菜单快捷方式创建与指向校验、已安装应用 smoke 启动、重复启动聚焦、静默卸载、快捷方式清理、重装和临时 `userData` 保留。

1. 双击 `release/Kairos-0.1.0-win-x64-setup.exe`。
2. 选择普通用户安装，不要求管理员权限。
3. 保持默认安装路径，完成安装。
4. 确认桌面快捷方式存在且名称为 `Kairos`。
5. 确认开始菜单快捷方式存在且名称为 `Kairos`。
6. 从快捷方式启动 Kairos。
7. 确认主窗口可以显示最终主视图。
8. 关闭 Kairos 后重新打开，确认窗口尺寸与位置能恢复。
9. 在 Kairos 已运行时再次打开快捷方式，确认不会出现第二个主窗口，而是聚焦已有窗口。

## 核心功能 smoke

安装后至少确认：

- [ ] 日历主视图显示正常。
- [ ] 今日计划区域显示正常。
- [ ] 习惯打卡区域显示正常。
- [ ] 新增、勾选、删除一个测试习惯后重启仍保持状态。
- [ ] 新增、完成、删除一个测试任务后重启仍保持状态。
- [ ] 音乐底栏显示正常。
- [ ] 本地音乐导入入口可打开系统文件选择器。
- [ ] 网易云入口可打开，未登录状态有清晰提示。
- [ ] FireFly / AI 入口可打开 AI 窗口。
- [ ] 在 Settings > Reminders 确认 Windows notifications 默认开启；创建一条几分钟后到期的测试日程，确认同时出现应用内提醒、FireFly 提示和 Windows 通知中心提醒；点击系统通知后确认 Kairos 聚焦并打开对应日程编辑窗口。关闭该选项后再次触发，确认仅保留应用内提醒和 FireFly 提示。
- [ ] AI 不配置 key 时不会影响日历、任务、习惯、提醒和音乐基础功能。

## 本地音乐验收

准备一个包含 MP3、FLAC、WAV、M4A 或 AAC 的本地音乐文件夹，至少包含一首带封面、一首无封面、一首文件名含中文或空格的歌曲。

1. 打开 Music 页面。
2. 导入单个音乐文件，确认歌曲出现在本地音乐列表。
3. 导入整个音乐文件夹，确认生成对应播放列表。
4. 播放带封面的歌曲，确认底部播放器显示封面、标题、歌手、时长和进度。
5. 播放无封面的歌曲，确认显示音乐占位图而不是空白或破图。
6. 调整音量、播放模式、进度条，重启后确认状态保留。
7. 将一个已导入的源文件移动或删除，重启后确认该歌曲显示 Missing / File unavailable，并且不会阻断其他歌曲播放。
8. 使用清理不可用歌曲入口，确认队列、播放列表和播放进度中的失效歌曲被移除。
9. 尝试导入空文件或非音频文件，确认导入提示能说明 skipped / unsupported / empty。
10. 如方便，使用一个只读或被其他播放器占用的文件，确认 Kairos 不崩溃，并给出可读失败提示。

通过标准：

- [ ] 本地音乐导入、播放、队列、封面、音量、进度和重启恢复均可用。
- [ ] 文件缺失或不可读时有可见降级，不影响其他歌曲。
- [ ] 导入失败原因可读，不污染曲库。

## 网易云账号验收

准备一个可正常登录网易云音乐的个人账号。第一版合规范围是个人授权账号、个人学习场景，不做音乐内容再分发或商业化播放；详细边界见 [Netease Music first-version scope](./NETEASE-COMPLIANCE.md)。

1. 打开 Settings > Music。
2. 确认 Netease Music 区域显示登录状态、音质偏好、刷新账号数据、清理本地缓存和清理会话入口。
3. 选择一个音质偏好，例如 Higher 或 Lossless，关闭设置页后播放网易云歌曲，确认没有报错。
4. 点击登录，使用网易云音乐 App 扫码登录。
5. 登录成功后确认 Settings > Music 显示昵称或账号 ID。
6. 打开 Music > Netease Music，确认搜索页可以加载每日推荐或热门歌单；如果账号不支持推荐，应显示可读空状态或失败提示。
7. 搜索一首歌曲，点击播放，确认底部播放器能播放并显示封面、标题、歌手、时长和进度。
8. 将网易云歌曲加入队列，确认本地队列和网易云队列不会混在一起，切换时有提示。
9. 打开 Playlist、Like、History，确认能读取歌单、喜欢歌曲和播放历史；如果账号数据为空，应显示空状态。
10. 点喜欢/取消喜欢一首网易云歌曲，确认状态能更新；如果接口拒绝，应显示可读失败提示。
11. 播放一首无版权、会员限制或不可播放歌曲，确认显示会员/版权/不可播放等可读降级信息。
12. 等待或模拟 URL 过期后再次播放，确认 Kairos 会刷新播放 URL；失败时底部播放器显示具体原因。
13. 在 Settings > Music 点击刷新账号数据，确认登录状态重新读取。
14. 在 Settings > Music 点击清理本地缓存，确认本地网易云播放队列/播放快照被清空，但仍保持登录状态，本地音乐和其他 app 数据不受影响。
15. 在 Settings > Music 点击清理会话，确认回到未登录状态；本地音乐和其他 app 数据不受影响。
16. 退出并重启应用，确认网易云登录 cookie、音质偏好和本地队列状态符合预期。

通过标准：

- [ ] 登录、退出、清理会话、清理本地缓存、音质偏好、刷新账号数据可用。
- [ ] 搜索、歌单、喜欢、历史、播放、队列和 URL 刷新可用。
- [ ] 不可播放、无版权、会员限制、接口失败、未登录、验证码或安全验证均有可读提示。
- [ ] 网易云不可用时，本地音乐、日程、任务、习惯、提醒和 AI 入口不受影响。

## 界面与可访问性验收

1. 分别在 100%、125%、150% Windows 缩放下打开主视图、日程页、习惯页、音乐页、设置页和 AI 窗口。
2. 确认没有主要文本溢出、按钮文字被截断、组件重叠或无法点击。
3. 使用键盘 Tab 在设置页、音乐页、任务/习惯入口中移动焦点，确认焦点可见。
4. 用 Alt+1 至 Alt+5 分别切换日历、日程、习惯、笔记和音乐；用 Ctrl+, 打开设置；用 Ctrl+Shift+A 打开 AI 对话，确认焦点回到预期窗口。
5. 在原生菜单中显示/隐藏 FireFly，确认角色窗口与主视图状态一致。
6. 在 Settings > Appearance 打开 Reduce motion，确认主视图、日程、习惯、笔记和音乐页面不再依赖持续动画；再关闭该选项并确认原有动效可恢复。系统“减少动态效果”或浏览器 `prefers-reduced-motion` 场景也应保持核心操作可用。
7. 暗色模式下检查文字对比度、纸张纹理/颗粒感、音乐播放器和弹窗可读性。

通过标准：

- [ ] 常见缩放和窗口尺寸下无阻断级布局问题。
- [ ] 键盘焦点可见，主要操作可通过键盘抵达。
- [ ] 减少动态效果时核心功能仍可用。

## 数据保留验收

1. 安装后创建一条测试任务和一条测试习惯。
2. 关闭应用。
3. 重新打开应用，确认测试数据仍存在。
4. 再次运行同版本 installer，选择相同安装路径覆盖安装。
5. 打开应用，确认测试数据仍存在。
6. 从 Windows 设置或卸载程序卸载 Kairos。
7. 确认卸载时不会删除用户数据，因为 `deleteAppDataOnUninstall` 当前为 `false`。
8. 重新安装 Kairos。
9. 打开应用，确认测试数据仍存在。

## Portable 验收

1. 双击 `release/Kairos-0.1.0-win-x64-portable.exe`。
2. 等待应用启动。
3. 确认主窗口可以显示最终主视图。
4. 创建一条测试任务或习惯。
5. 关闭 portable 应用。
6. 再次启动 portable 应用，确认测试数据保留。
7. 确认关闭后没有残留 `Kairos.exe` 进程。

## 通过标准

- [ ] 自动验收全部通过。
- [ ] Installer 可安装并通过核心功能 smoke。
- [ ] 升级安装不会丢失用户数据。
- [ ] 卸载后重新安装仍保留用户数据。
- [~] Portable 可启动、挂载核心 UI 并在同一临时 `userData` 重启后读回状态已自动覆盖；普通双击关闭和数据目录保留仍需手动确认。
- [ ] 本地音乐真实文件夹和异常文件场景通过。
- [ ] 网易云真实账号在线能力和不可播放降级通过。
- [ ] 常见 Windows 缩放、键盘焦点和减少动态效果检查通过。
- [ ] 不存在阻断级错误。
