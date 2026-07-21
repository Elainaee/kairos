# Kairos C 盘文件结构

Kairos 在 Windows 上的主要用户数据目录为：

```text
C:\Users\<用户名>\AppData\Roaming\Kairos\
```

## 用户数据目录

```text
C:\Users\<用户名>\AppData\Roaming\Kairos\
├─ kairos.sqlite                  # 核心业务主库：日程、AI 对话、设置、窗口状态等
├─ kairos.sqlite-wal              # SQLite WAL 日志，运行中不可手动删除
├─ kairos.sqlite-shm              # SQLite 共享内存文件，运行中不可手动删除
│
├─ backups\
│  └─ kairos-data-*.json          # 用户导出/恢复前自动生成的数据备份
├─ legacy-json\                   # 旧版本 JSON 迁移留档；仅在存在旧数据时创建
│
├─ attachments\                   # 保留的 AI 附件文件；附件元数据在 SQLite
├─ music-covers\                  # 本地音乐提取出的封面图片
│
├─ Cache\                         # Electron 网络/资源缓存，可重建
├─ Code Cache\                    # JavaScript/WASM 缓存，可重建
├─ GPUCache\                      # GPU 缓存，可重建
├─ DawnGraphiteCache\             # 图形渲染缓存，可重建
├─ DawnWebGPUCache\               # WebGPU 缓存，可重建
├─ Shared Dictionary\             # Chromium 压缩字典缓存
├─ blob_storage\                  # Chromium Blob 数据
│
├─ Local Storage\                 # 页面 LocalStorage
├─ Session Storage\               # 页面会话存储
├─ Network\                       # Cookie、网络安全状态等
├─ Preferences                     # Electron/Chromium 偏好
├─ Local State                     # Chromium 本地状态
├─ SharedStorage                   # Chromium Shared Storage
└─ DIPS                            # Chromium 隐私/交互状态
```

## 临时目录

临时 AI 附件在需要时创建于：

```text
C:\Users\<用户名>\AppData\Local\Temp\kairos-ai\
└─ 临时 AI 附件文件
```

## 数据与清理边界

- `kairos.sqlite` 是唯一的运行时业务数据主库。
- `backups\` 保存 JSON 导出与恢复前备份；建议按需要保留，不应被缓存清理操作删除。
- `attachments\` 与 `music-covers\` 保存用户文件或派生资源；删除前应先确认不再需要对应附件或封面。
- `kairos.sqlite-wal` 与 `kairos.sqlite-shm` 是 SQLite 的运行辅助文件。应用运行时不得手动删除。
- `Cache\`、`Code Cache\`、`GPUCache\`、`DawnGraphiteCache\`、`DawnWebGPUCache\` 可在 Kairos 完全退出后清理，之后会自动重建。
- `Network\`、`Local Storage\`、`Session Storage\`、`Preferences` 等属于 Electron/Chromium 运行状态。手动删除可能影响登录状态、页面偏好或会话，不建议作为常规清理对象。

## 安装目录

应用安装目录取决于安装时选择的位置，常见位置包括：

```text
C:\Program Files\Kairos\
C:\Users\<用户名>\AppData\Local\Programs\Kairos\
```

这些目录通常保存可执行文件和运行依赖，不应与用户数据目录混淆。
