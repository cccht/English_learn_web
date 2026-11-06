# 首页功能插画

延续原有薄荷绿色书本形象，将首页三个功能区的 9 个线性小图标替换为同一角色系列，并为每个大幅产品展示补充一幅横向场景插画。仅用于公开首页，不修改题目、评分或个人学习数据。

## 素材

| 位置 | 主题 | 素材 |
| --- | --- | --- |
| 全卷练习 | 阅读、练习与时间分配 | `practice-feet-v2.webp` |
| 文章批注 | 手写、高亮与笔记 | `notes.webp` |
| 词汇与复盘 | 单词卡与积累 | `review.webp` |

横向场景位于 `public/images/feature-illustrations/`，统一导出为 1200 x 400 WebP；原始 PNG 保留在本目录的 `originals/`。新增计时角色位于 `public/images/mascots/timer.webp`，原图保留在 `docs/design/mascot-series/originals/timer.png`。

全部素材由内置 Image Gen 生成。共同参考原有执笔角色，后两幅场景另以第一幅作为构图与材质参考。完整提示词见 `prompts.json`，来源、尺寸与 SHA-256 记录见 `assets.json`；计时角色的校验记录并入原角色系列的 `assets.json`。

练习插画第二版仅修正腿脚：两只珊瑚色鞋子统一大小、朝向与鞋底厚度，平稳落在底座上，短白腿自然连接身体。原 `originals/practice.png` 和 `practice.webp` 均保留，旧版本校验记录在 `assets.json` 的 `previousVersions` 中；编辑提示词见 `practice-feet-v2-prompt.json`。

## 页面规则

- 素材统一注册在 `shared/illustrations.json`，角色使用 `items`，横向插画使用 `scenes`。
- 功能说明图标按含义使用阅读、计时、复习、执笔、查找、整理、词汇和诊断角色，预留 64px 正方形空间；所有图片保持完整比例。
- 三幅横向插画位于功能说明之后、段落行动按钮之前，最大展示宽度 760px，手机端自适应；不加卡片、边框或额外文字。
- 纯白底通过混合模式衔接已有白色、浅蓝和浅绿背景；不裁切主体、不拉伸，也不修改生成图片中的角色。
- 插画为装饰，使用空 `alt` 与 `aria-hidden`；原有标题和文字保留语义。按钮和登录字段继续使用功能性 Lucide 图标；首页已改为静态小屋，不再显示 3D 工具栏。
- 图中时钟、纸张和词卡仅为道具，不代表用户成绩、作答内容或统计结果。原有图片和历史导出均保留。

公开版本的 `generatedSource` 使用仓库内原图的相对路径，不公开图像工具的本机缓存路径；原图文件及 SHA-256 记录保持不变。
