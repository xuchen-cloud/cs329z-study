# 斯坦福 Stanford CS329Z 中文教程｜Engineering AI Agents

这是一套基于斯坦福 CS329Z 公开课程资料的中文自学教程，面向有 Python 基础的学习者。19 讲从模型如何调用工具、检索资料讲起，逐步讨论怎样构建、评测和改进一个 Agent 系统。

Chinese study guide for Stanford CS329Z: Engineering AI Agents. Includes 19 lessons, 4 hands-on exercises, Markdown sources and an offline HTML reader.

本互动学习版基于 wanghao-SunSky 整理的中文教程 `cs329z-chinese` 修订而成。为了降低自学门槛，本版新增了分段阅读、情境题、三步图解、小节自测和学习笔记，并对全部数学公式进行了重新排版。

[斯坦福官方课程](https://cs329z.stanford.edu/) · [在线学习](https://xuchen-cloud.github.io/cs329z-study/) · [单文件课程](https://xuchen-cloud.github.io/cs329z-study/offline.html) · [课程目录与学习路径](course-guide.md) · [下载本版仓库](https://github.com/xuchen-cloud/cs329z-study/archive/refs/heads/main.zip)

第 1–9 讲的「开篇」提供相应课程视频的入口。感谢 UP 主「不做挖掘姬」整理上传的[哔哩哔哩视频合集](https://www.bilibili.com/video/BV1ARxc61Er2/)。

## 包含什么

| 内容 | 入口 |
| --- | --- |
| 19 讲中文教程 | [从第 1 讲开始](01-Agent基础与全景.md) |
| 从零搭建 Agent、设计评测、课程项目、论文实践 | [实战练习](exercises/) |
| HW1 与第 5 讲配套代码的阅读指南 | [代码导读](code-guide.md) |
| 支持搜索、目录、深浅主题的网页，以及单文件离线版 | [HTML 文件](html/) |

适合具备初级 Python 编程基础、了解基本 API 调用，希望扎实掌握 Agent 工程开发的读者（即使 AI 算法背景较少，也能跟着教程中的白话直觉循序渐进上手）。推荐先通读第 1–4 讲打好基础，再结合 HW1 动手实践；完整学习路线见上方的课程目录。

## 本地阅读与构建

如果想在本地阅读，下载仓库后直接用浏览器打开 `html/index.html` 即可；若只想保存一个便携的离线文件，可以使用 `html/offline.html`。

修改 Markdown 内容后，在仓库目录运行以下命令即可重新构建网页并校验（需要 Node.js 18+ 和 Python 3）：

```bash
node tools/build_site.mjs
python3 tools/verify_publication.py
```

## 来源与修订

感谢斯坦福 CS329Z 教学团队公开课程材料，也感谢 wanghao-SunSky 整理原中文教程。xuchen-cloud 在该项目基础上修订了本互动学习版。课程、论文与配套代码的权利归各自作者。本版的整理范围及待核对内容见[阅读说明与版本来源](docs/editorial-notes.md)。若在学习过程中发现问题，欢迎提交到[本仓库 Issues](https://github.com/xuchen-cloud/cs329z-study/issues)。
