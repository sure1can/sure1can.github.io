# 事实与课题分离器

个人使用的本地优先 MVP。当前版本的核心分析器位于 `skill/fact-task-separator.js`，与 UI 解耦，输入和输出都是结构化对象。网页默认使用本地确定性分析，后续可把同一字段接到服务端 JSON Schema 模型调用。

## 运行

直接打开 `dist/index.html` 即可使用；也可以在 `dist` 目录启动任意静态文件服务器。

## 核心字段

`facts`、`feelings`、`assumptions_about_others`、`future_predictions`、`unknowns`、`mixedProblems`、`mutationPoint`、`assumptionChains`、`myTasks`、`othersTasks`、`sharedTasks`、`futureTasks`、`boundaryCrossings`、`validEmotions`、`needs_action_now`、`does_not_need_action_now`、`waitingType`、`thinkingStopReason`、`oneSmallAction`、`reasoning_evidence`、`confidence`。

## 测试

在项目根目录执行：`node skill/test-cases.mjs`

