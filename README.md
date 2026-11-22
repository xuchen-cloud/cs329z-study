# 斯坦福 Stanford CS329Z 中文教程｜Engineering AI Agents

一套面向 Python 开发者的 AI 智能体（Agent）自学教程。围绕斯坦福大学 Stanford CS329Z 的公开材料，用中文讲解如何构建、评测和改进 Agent：从大语言模型、RAG、工具调用，到记忆、多 Agent 协作和安全防护。

Chinese study guide for Stanford CS329Z: Engineering AI Agents. Includes 19 lessons, 4 hands-on exercises, Markdown sources and an offline HTML reader.

本互动学习版基于 wanghao-SunSky 整理的中文教程 `cs329z-chinese`。本版增加了分段阅读、情境题、三步图解、小节自测和学习笔记，并重新排版了公式。

[斯坦福官方课程](https://cs329z.stanford.edu/) · [在线学习](https://xuchen-cloud.github.io/cs329z-study/) · [单文件课程](https://xuchen-cloud.github.io/cs329z-study/offline.html) · [课程目录与学习路径](course-guide.md) · [下载本版仓库](https://github.com/xuchen-cloud/cs329z-study/archive/refs/heads/main.zip)

第 1–9 讲可在各讲「开篇」观看课程视频，也可以直接打开由 UP 主「不做挖掘姬」整理上传的[哔哩哔哩视频合集](https://www.bilibili.com/video/BV1ARxc61Er2/)。

## 包含什么

| 内容 | 入口 |
| --- | --- |
| 19 讲中文教程 | [从第 1 讲开始](01-Agent基础与全景.md) |
| 从零搭建 Agent、设计评测、课程项目、论文实践 | [实战练习](exercises/) |
| HW1 与第 5 讲配套代码的阅读指南 | [代码导读](code-guide.md) |
| 支持搜索、目录、深浅主题的网页，以及单文件离线版 | [HTML 文件](html/) |

适合会写 Python、了解基本 API 调用，希望系统学习 Agent 开发的读者。建议先读第 1–4 讲，再结合 HW1 动手实践；完整路线见课程目录。

## 本地阅读与构建

下载仓库后，直接用浏览器打开 `html/index.html`。只想保存一个文件，可以使用 `html/offline.html`。

修改 Markdown 后，在仓库目录运行（需要 Node.js 18+ 和 Python 3）：

```bash
node tools/build_site.mjs
python3 tools/verify_publication.py
```

## 来源与修订

Stanford CS329Z 提供原课程材料，wanghao-SunSky 编写了原中文教程，xuchen-cloud 在其项目基础上整理了本互动学习版。课程、论文与配套代码的权利归各自作者。整理范围及待核对的内容见[阅读说明与版本来源](docs/editorial-notes.md)。本版问题可提交到[本仓库 Issues](https://github.com/xuchen-cloud/cs329z-study/issues)。
