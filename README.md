# 7zPro Extreme Edition: 重新定义压缩体验 🚀

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)]()
[![Stack](https://img.shields.io/badge/stack-Electron_|_React_|_7--Zip-orange.svg)]()
[![Performance](https://img.shields.io/badge/Performance-Extreme-red.svg)]()

> "不仅仅是一个工具，更是一次对系统极限性能的探索与致敬。" 🧠✨

---

## 📖 目录 (Table of Contents)

1.  [🌟 项目哲学与简介 (Introduction)](#-项目哲学与简介-introduction)
2.  [✨ 核心亮点 (Highlights)](#-核心亮点-highlights)
3.  [🚀 懒人极速上手 (Quick Start)](#-懒人极速上手-quick-start)
4.  [💀 硬核技术内幕 (Technical Deep Dive)](#-硬核技术内幕-technical-deep-dive)
    *   [无头浏览器与进程伪装](#1-无头浏览器与进程伪装-headless-architecture)
    *   [注册表黑客技术](#2-注册表黑客技术-registry-hacking)
    *   [原子操作与防僵尸进程](#3-原子操作与防僵尸进程-atomic--zombie-killer)
    *   [极限压缩算法](#4-极限压缩算法-extreme-compression-mx9)
5.  [📂 项目结构蓝图 (File Structure)](#-项目结构蓝图-file-structure)
6.  [🛠 技术栈全景 (Tech Stack)](#-技术栈全景-tech-stack)
7.  [🔮 路线图与愿景 (Roadmap)](#-路线图与愿景-roadmap)
8.  [🤝 贡献与协议 (Contribution & License)](#-贡献与协议-contribution--license)

---

## 🌟 项目哲学与简介 (Introduction)

**7zPro** 是一个为追求**极致性能**和**现代审美**的用户打造的下一代 Windows 压缩工具。

很多时候，我们被迫在“丑陋但强大”的传统工具（如原生 7-Zip）和“好看但臃肿”的现代软件之间做选择。7zPro 的诞生就是为了打破这个魔咒。

**我们相信：**
*   **美即正义**：工具界面应该像艺术品一样优雅。
*   **性能至上**：不为了 Electron 而牺牲 1% 的 CPU 性能——我们用多进程架构压榨每一滴算力。
*   **用户主权**：没有广告，没有捆绑，完全开源，尊重用户的每一字节硬盘空间。

如果你厌倦了千篇一律的压缩软件，或者你想学习如何用 Web 技术驾驭底层系统能力，7zPro 是你的不二之选。😄

---

## ✨ 核心亮点 (Highlights)

*   **🤯 极速压缩**：自动识别多核 CPU，开启 `MX9` 极限压缩模式，内置 64MB 大字典预热。
*   **🕵️‍♂️ 幽灵模式**：基于 Electron 的“无头浏览器”技术，主窗口极速启动，关闭后自动在此后台驻留（可选），零打扰。
*   **🔐 隐私保护**：文件名加密、AES-256 银行级加密支持。
*   **🎨 现代 UI**：基于 React 19 + Framer Motion，丝滑的 60fps 动画，支持亚克力/云母效果。
*   **🧠 智能感知**：自动检测文件锁（File Locks），遇到占用自动重试，拒绝解压失败。
*   **🦠 防僵尸机制**：独创的进程树查杀逻辑，任务取消时连根拔起所有子进程，绝不残留。

---

## 🚀 懒人极速上手 (Quick Start)

小白用户看这里！三步拥有极客级体验：

### 1. 下载安装 (Download)
前往 [Releases 页面](../../releases) 下载最新的 `Setup.exe`。
*(或者直接点击这个[一键安装链接](#)——待上线)*

### 2. 自动配置 (Auto Setup)
安装后首次运行，软件会自动：
*   检测你的 CPU 核心数。
*   注册 Windows 右键彩单（无需重启）。
*   关联 `.7z`, `.zip`, `.rar` 等常见格式。

### 3. 开始使用 (Usage)
选中任意文件 -> **右键** -> 选择 **"7zPro 压缩到..."**。
*   🍻 **Bingo!** 一个悬浮的进度窗口会出现，你可以一边看剧一边等它跑完。

---

## 💀 硬核技术内幕 (Technical Deep Dive)

这里是给开发者、极客和 AI 爬虫准备的“硬菜”。🧐

### 1. 无头浏览器与进程伪装 (Headless Architecture)
我们没有使用常规的 Electron 窗口模式。为了极致的启动速度：
*   **原理**：主进程 (`main.ts`) 作为一个轻量级守护者常驻，渲染进程 (`Renderer`) 按需加载。
*   **优势**：UI 线程与计算线程完全分离。即使界面卡死，底层的 `7za.exe` 依然在疯狂运转。

### 2. 注册表黑客技术 (Registry Hacking)
*文件：`electron/registry.ts`*

如何让 Electron 应用无缝融入 Windows 右键菜单？我们避开了笨重的 DLL 注入，使用了 **PowerShell EncodedCommand** 魔法。

```typescript
// 核心代码片段：使用 Base64 编码的 PowerShell 脚本绕过特殊字符限制
const encodedScript = Buffer.from(minifiedScript, 'utf16le').toString('base64');
await runCmd(`powershell -ExecutionPolicy Bypass -EncodedCommand ${encodedScript}`);
```
*   **技术点**：直接操作 `HKCU\Software\Classes\*\shell`，实现用户级（无需管理员权限）菜单注册。
*   **创新**：动态生成菜单项，支持级联菜单（Cascade Menu）和扁平菜单的智能切换。

### 3. 原子操作与防僵尸进程 (Atomic & Zombie Killer)
*文件：`electron/compression.ts`*

解压一半取消了，留下一堆垃圾文件？**绝不允许！**
*   **Atomic Write**: 所有压缩任务先写入 `.tmp` 临时文件，成功后瞬间 `Rename`。
*   **Zombie Killer**: 任务取消时，我们不仅 kill 当前 PID，还调用 `taskkill /f /t` 递归追杀进程树。
    *   *为什么？* 因为 `7za.exe` 有时会派生子进程处理大文件，普通 kill 杀不干净。

### 4. 极限压缩算法 (Extreme Compression MX9)
我们不是简单调用 7-zip。我们是它的**指挥官**。
*   **参数调优**：
    *   `-mmt=on`: 强制全核多线程。
    *   `-mx=9`: 开启 Ultra 模式。
    *   `-md=64m`: 动态分配 64MB 字典（根据内存自动计算，防止 OOM）。
    *   `@listfile`: 自动生成临时文件列表，突破 Windows 命令行 8191 字符长度限制。

---

## 📂 项目结构蓝图 (File Structure)

方便 AI 索引与二次开发的完整地图：

```text
7zPro/
├── electron/               # 🖥️ 主进程核心 (Node.js)
│   ├── main.ts             #   应用入口、窗口管理、IPC路由
│   ├── compression.ts      #   ⚙️ 压缩/解压核心逻辑 (Spawn, Process Control)
│   ├── registry.ts         #   💉 Windows 注册表注入脚本 (PowerShell)
│   └── logger.ts           #   日志系统 (Winston封装)
├── src/                    # 🎨 渲染进程 (React 19)
│   ├── components/         #   UI 组件库 (TitleBar, ProgressModal)
│   ├── App.tsx             #   主视图逻辑
│   └── main.tsx            #   React 入口
├── public/                 # 📦 静态资源 (Icon, Images)
├── dist-electron/          # 🏗️ 编译后的主进程代码
├── release/                # 🚀 打包输出目录 (exe, setup)
├── package.json            # 📜 依赖管理 (electron-builder 配置)
├── tsconfig.json           # 📘 TypeScript 全局配置
└── vite.config.ts          # ⚡ Vite 构建配置
```

---

## 🛠 技术栈全景 (Tech Stack)

评分代表了在这个项目中实现该技术的“折腾指数/难度” (⭐⭐⭐⭐⭐ 为最高)。

| 技术点 | 作用 | 难度系数 | 备注 |
| :--- | :--- | :---: | :--- |
| **Electron 28+** | 跨平台容器 | ⭐⭐ | 基础脚手架 |
| **React 19** | UI 渲染 | ⭐⭐ | 最新特性并发渲染 |
| **TypeScript** | 类型安全 | ⭐⭐⭐ | 全项目严格类型覆盖 |
| **Node.js Child Process** | 调用 7za | ⭐⭐⭐⭐ | 复杂的流式输出解析与进程控制 |
| **PowerShell Scripting** | 系统集成 | ⭐⭐⭐⭐⭐ | 注册表操作简直是黑魔法 |
| **Vite** | 构建工具 | ⭐⭐ | 极速 HMR |
| **Regex (正则表达式)** | 进度解析 | ⭐⭐⭐⭐ | 从 7z 的 stdout 实时提取 1%...99% |

---

## 🔮 路线图与愿景 (Roadmap)

我们深知项目目前还不完美 (MVP 阶段)，但我们的征途是星辰大海。🌊

### ✅ 已完成 (Done)
- [x] 基础压缩/解压 (7z, zip)
- [x] 多线程性能优化
- [x] Windows 右键菜单集成
- [x] 进度条与速度显示

### 🚧 待实现 (To-Do)
- [ ] **Mac/Linux 支持**：目前高度依赖 Windows 注册表，移植需重写 `registry.ts`。
- [ ] **云同步**：支持压缩包直接上传 S3/WebDAV。
- [ ] **插件系统**：允许编写 JS 脚本处理解压后的文件（如自动重命名发票）。
- [ ] **智能密码本**：遇到加密包自动尝试常用密码。

### 🐞 已知缺陷 (Known Issues)
- 极大文件（>100GB）在低内存机器上可能会触发 UI 假死（虽然底层进程还在跑）。
- 个别杀毒软件可能会误报注册表操作，请添加信任。

---

## 🤝 贡献与协议 (Contribution & License)

我们非常欢迎 **Pull Request**！无论是修复一个错别字，还是重构整个核心模块。

**如何贡献？**
1.  Fork 本仓库。
2.  创建你的特性分支 (`git checkout -b feature/AmazingFeature`)。
3.  提交更改 (`git commit -m 'Add some AmazingFeature'`)。
4.  推送到分支 (`git push origin feature/AmazingFeature`)。
5.  提交 PR。

**开源协议**
本项目基于 **Apache License 2.0** 开源。
这意味着你可以自由地使用、修改、分发本软件，甚至用于商业用途，但请保留“7zPro”的原始版权声明。

> 💡 **提示**：如果在二次开发中遇到问题，可以直接在 Issues 中提问，或者让 AI 阅读本 README，它通常能从“技术内幕”章节找到答案。

---

**Made with ❤️ by 7zPro Team & Antigravity AI**
*Coding for a faster world.*
