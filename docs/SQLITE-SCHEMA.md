# Kairos SQLite schema

`kairos.sqlite` 是桌面端所有运行时持久数据的唯一来源。JSON 仅用于旧版本迁移输入，以及用户显式创建的、带校验的导出与备份。

## 控制表

| 表名 | 字段 | 说明 |
| --- | --- | --- |
| `schema_migrations` | `id`（主键）、`applied_at` | 已执行的数据库和数据迁移标识。 |
| `database_metadata` | `key`（主键）、`value`、`updated_at` | 数据库级元数据；包含 `storage_mode=sqlite-primary` 与旧 JSON 导入时间。 |
| `data_exports` | `id`（主键）、`format_version`、`checksum`、`reason`、`created_at`、`payload` | 每次生成 JSON 导出的审计记录。`checksum` 是对应用状态和各存储 payload 计算的 SHA-256。 |

## 应用状态

| 表名 | 字段 | 说明 |
| --- | --- | --- |
| `app_state_snapshots` | `id`（固定为 `1`，主键）、`version`、`payload`、`updated_at` | 权威的完整应用状态文档；用于原子状态操作和 JSON 导出。 |
| `app_schedules` | `id`（主键）、`title`、`type`、`date`、`end_date`、`status`、`payload`、`updated_at` | 可查询的日程和任务，以及对应的完整源数据。 |
| `app_habits` | `id`（主键）、`name`、`streak_count`、`completion_count`、`payload`、`updated_at` | 可查询的习惯，以及对应的完整源数据。 |
| `app_checkins` | `id`（主键）、`title`、`date`、`payload`、`updated_at` | 打卡记录。 |
| `app_notes` | `id`（主键）、`title`、`date`、`payload`、`updated_at` | 笔记。 |

`payload` 字段保存 JSON 文本，使领域数据可以向后兼容地扩展；其余字段构成稳定、可查询的索引面。

## 辅助状态

| 表名 | 字段 | 存储内容 |
| --- | --- | --- |
| `store_payloads` | `store`（主键）、`version`、`summary`、`payload`、`updated_at` | `ai-data`、`music-state`、`netease-api-state`、`ai-settings`、`pet-state`、`window-state`。`summary` 保存轻量审计信息，`payload` 是权威状态。 |

附件和音乐封面仍保存为文件；它们的元数据及文件路径保存于 `store_payloads.payload`。桌面数据审计会检查已持久化的 AI 附件路径是否缺失。

## 完整性与恢复

- 启动时会在初始化仓储前执行 `PRAGMA integrity_check`。
- 第一次采用 SQLite 主库启动时，会先把旧 JSON 复制到 `legacy-json/`，再在单个 SQLite 事务中导入全部数据。
- v3 会把旧 `app_study_plans` 合并到 `app_schedules`，并把缺失的旧镜像数据提升到 `store_payloads`；验证完成后删除这两张旧表。
- 导出采用 `kairos-desktop-export` 格式版本 1，并附带 SHA-256 校验值。
- 导入会验证格式和校验值，先创建导出备份，再以事务方式替换数据。
