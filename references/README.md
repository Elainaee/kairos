# Kairos reference materials

本目录保存用户明确喜爱的设计素材、组件源码、导入结果和历史档案。它们不参与 Kairos 运行时打包，但应在后续 UI 优化中被主动检索和参考。

“喜欢”不等于“直接复制”。每份素材只在其擅长的维度提供参考；最终实现仍服从当前 Kairos UI、已有组件、`docs/UI-DESIGN-SYSTEM.md` 和 `app/themes/claude-plus.css`。

## 设计权威顺序

1. 当前实际运行的 Kairos UI 和语义主题 token
2. 已有组件与交互契约
3. `docs/UI-DESIGN-SYSTEM.md`
4. 本目录中的参考素材
5. 通用设计经验

参考素材与当前界面冲突时，默认保留当前界面。只有用户明确要求迁移到某个参考方案时，才改变已经形成的 Kairos 视觉语言。

## 使用标签

| 标签 | 含义 | 模型应该怎么使用 |
|---|---|---|
| `approved` | 用户喜欢，可积极参考 | 提取适合当前任务的结构、细节或氛围 |
| `partial` | 用户喜欢，但只适合某些维度 | 严格限定到标注的组件、交互或动效 |
| `upstream` | 第三方完整源码 | 查实现细节，不视为 Kairos 的运行时或设计权威 |
| `historical` | 历史产物和溯源资料 | 理解演进，不直接复制 |

本目录没有因“不喜欢”而标记的素材。`partial`、`upstream` 和 `historical` 只表示使用范围，不是否定其设计价值。

## 目录索引

### `design-imports/` — approved / partial

最适合在日常 UI 任务中优先检索的设计导入与精选组件。

#### `design-imports/tweakcn-dashboard/` — approved

参考重点：

- 数据密度与清晰层级
- section cards、data table、charts、header 和导航组织
- 现代而克制的 dashboard 结构
- shadcn/TweakCN 组件状态的完整性

限制：

- 不直接替换 Kairos 顶部导航、色彩、字体和 Electron 窗口结构
- 不因为参考项目使用 React/TSX 就在 Vue renderer 中引入 React
- 表格和卡片必须适配 Kairos 的暖纸表面和按钮 hover 规则

#### `design-imports/tweakcn-application-chat/` — approved

参考重点：

- 消息排布、头像/图标、composer、附件和消息操作层级
- 聊天页面的信息节奏与组件组合

限制：

- Kairos AI Chat 继续使用暖色主题，不引入独立蓝紫 AI 视觉体系
- 复用 `app/features/assistant/ai-chat.*` 的行为和事件契约
- 按钮 hover 只改变文字、图标或描边，不生成底板和阴影

#### `design-imports/reactbits-components/` — partial: motion and component ideas

包含 AnimatedList、BorderGlow、Counter、ElasticSlider、GooeyNav、MagicBento、PillNav、ScrollReveal、ScrollStack、ShinyText、SpotlightCard、Stepper 和 TiltedCard。

参考重点：局部动效、过渡连续性、列表反馈、导航指示、数据呈现和可感知的互动细节。

限制：

- 不把 React Bits 的展示页配色、背景和全局排版带入 Kairos
- 一次只选择对任务有明确作用的效果
- 必须适配 Vue/现有 legacy 结构、语义 token 和 `prefers-reduced-motion`
- BorderGlow、SpotlightCard、MagicBento 等不能演变成按钮 hover 光晕或阴影背景

#### `design-imports/tweakcn-chunks/` — partial / implementation archaeology

构建产物和 chunks 主要用于在缺少原始源码时追溯 TweakCN 实现。优先阅读可读的 TSX/CSS/README；只有无法定位行为时才搜索构建 chunks。

#### `design-imports/tweakcn-dashboard-build/` — historical build output

用于比对构建后行为和溯源，不作为首选设计输入。

### `shadcn-components/` — approved structure / upstream-like components

包含组件索引、metadata 和 UI 源码。参考重点：

- 可访问的组件结构
- variant、size、disabled、selected、focus-visible 等状态完整性
- dialog、popover、combobox、table、tabs、toast 等基础交互模式

限制：

- 先查 `docs/UI-COMPONENT-INVENTORY.md`，Kairos 已有对应系统时必须复用
- 不直接引入默认 shadcn 色彩、字体、阴影和 hover 背景
- 不为使用一个组件而增加平行组件库

### `source-libraries/` — upstream

#### `source-libraries/react-bits-source/`

React Bits 完整上游源码。用于理解参数、动画算法、可访问性和 reduced-motion 处理。不要把完整 demo、技术栈或全局视觉样式移植进 Kairos。

#### `source-libraries/tweakcn-source/`

TweakCN 完整上游源码。用于理解主题 token、组件结构和选定示例的实现。Kairos 当前 `Claude +` 主题和已适配组件仍是更高权威。

由于 `source-libraries/` 文件量很大，禁止在每次 UI 任务中无目的通读。先通过 `rg` 搜索具体组件或 token，只读取与当前任务有关的文件。

### `legacy-artifacts/` — historical / approved intent

包含历史 HTML、TSX、JSON、ZIP 和导入产物，例如旧桌面宠物、TweakCN 页面与 Stitch 档案。

参考重点：追溯用户曾选择的视觉方向、核对特定历史组件或页面意图、恢复遗漏的设计细节。

限制：

- 不直接覆盖当前运行文件
- 不将 ZIP 或构建输出视为最新实现
- 当前组件与历史档案冲突时，以当前组件为准

## 按任务选择参考

| 任务类型 | 优先查看 | 只提取 |
|---|---|---|
| 数据卡片、统计、表格 | `tweakcn-dashboard/`, `shadcn-components/` | 层级、密度、状态结构 |
| AI Chat | `tweakcn-application-chat/` | 消息结构、composer、附件层级 |
| 导航 | `reactbits-components/GooeyNav`, `PillNav` | 当前项连续性和局部动效 |
| Habits 列表 | `AnimatedList`, `MagicBento`, `Counter` | 进入、排序、计数和局部反馈 |
| Music slider | `ElasticSlider` | 拖动反馈和轨道行为 |
| 品牌细节 | `ShinyText`, 历史 artifacts | 小范围品牌动效 |
| Dialog、Popover、Combobox | `shadcn-components/` | 状态、键盘和焦点结构 |
| 桌面宠物 | `legacy-artifacts/chibi_pet_final.html` | 角色、气泡和菜单意图 |

## 按钮 hover 规则适用于所有参考

即使参考素材原本使用 hover 背景、光晕、阴影或上浮，移植到 Kairos 时也必须转换为：文字变色、图标或图案变色、描边/线条变色、必要时的下划线或持续状态指示。

不得为按钮 hover 新增背景块、彩色底板、halo、glow 或 box-shadow。实心按钮可以保留原填充并做很轻的颜色变化，但不能新增阴影。键盘 `focus-visible` 必须保留清晰 outline/ring。

## 新增参考素材时

新增目录或重要文件后，在本 README 中记录：

1. 标签：`approved`、`partial`、`upstream` 或 `historical`
2. 适合参考的维度
3. 不应复制的维度
4. 对应的 Kairos 页面或组件
5. 若已有运行实现，列出其文件路径
