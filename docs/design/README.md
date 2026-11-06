# 设计记录

参考用户指定仓库 https://github.com/leonxlnx/taste-skill ，读取版本 `ccbc15639c97057cbfcf32ecebc38ef716e4bb37` 的 `skills/gpt-tasteskill/SKILL.md` 与 `skills/taste-skill-v1/SKILL.md`。

适用规则：Geist 字体、清晰层级、克制绿色强调色、边框与留白划分区域、避免嵌套卡片、完整加载/空白/错误状态、移动端单列降级、减少运动偏好支持。针对日常答题场景，采用功能工作台而非营销页，取消大幅宣传首屏、滚动劫持、持续自动动画与不必要的玻璃效果。

主色 `#246b56`，画布白色，导航为中性浅灰。错误和模拟题标签使用低饱和暖色。UI 使用 Geist 加系统中文无衬线字体；英文阅读正文使用书刊阅读字体。主要交互统一使用 Lucide 图标。练习开始弹窗展示实际题卷分项，而不是写死标准题卷。

## 图像

使用内置 Image Gen 生成，并保存为项目资产：

- `workspace-concept.png`：完整工作台设计参考。
- `../../public/images/reading-desk.png`：右栏英文书本照片。

概念图提示词摘要：完整的中文六级学习工具，208px 侧栏，白色主内容、绿色按钮、真题列表、真实零起点学习统计、今日词汇和分项计时安排；禁止营销首屏、渐变、光球、嵌套卡片。

照片提示词：Photorealistic editorial still life, close overhead three-quarter view of an open English reading book on a clean white desk in soft natural window daylight. One dark forest-green sharpened pencil lies diagonally on right page. Small green leaf edge at upper left. Actual detailed paper, readable English paragraph on left page with simple title 'Stay curious' and paragraph 'Every new word opens a small window. Read slowly. Notice the details. Keep a little room for something unexpected.' Crisp book print and beautiful paper texture, inviting, intelligent, clean and quiet. White and gray neutral scene, natural green accents. Full image filled by open book spread, page margins and a little desk at edge. Wide landscape 3:2. No brands, no watermarks, no overlays, no decorative text outside book. The open book is the main focus, well lit and clearly visible. This will be a cropped photograph in a language learning app sidebar.

概念图中的示意题目被实际核验的题库替换，题数为 57。未采用概念图额外的虚构试卷、浏览器装饰、口号与假账户信息。网页文本、题目和按钮均是可操作 React 组件，图像只作为书本照片使用。

## 账号页面升级

2026-09-12：再次按 Taste Skill 的字体层级、留白、真实图片与完整状态规则优化登录 / 注册页。采用无遮挡的英文书本照片和白色表单区，保留绿色强调色；移动端照片缩为顶部横幅，表单保持完整宽度。账号、密码显隐、注册关闭、输入错误、提交等待均为真实可操作状态。

设计参考保存在 `auth-accounts-concept.png`；由内置 Image Gen 生成，再从概念图生成独立书本照片 `../../public/images/auth-reading.png`。照片提示词为：提取参考图左侧的完整写实照片，只保留明亮白色桌面、展开的英文书、绿色铅笔、植物与书籍，清晰自然光、无界面、无文字覆盖，竖幅 3:4。登录界面文字、表单、Geist 字体和 Lucide 图标均由代码呈现。
