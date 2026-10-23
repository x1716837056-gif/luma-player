# Luma · Windows 影音库界面预览

按照 Infuse Mac 的视觉方向制作：深色侧栏、暖金色选中态、宽幅影片背景、圆角海报墙、半透明弹窗和简洁播放控件。面向本地硬盘与 NAS 共享文件夹。

这是可操作的 **0.1.0 界面预览版**。界面使用 React / TypeScript / CSS，Windows 外壳使用 Electron。代码没有使用 Infuse 的源码、图标或品牌素材。

## 直接使用 Windows 版本

在 Windows 10 / 11 x64 上运行 `Luma 0.1.0.exe`。这是免安装预览版。

首次启动展示明确标注的示例影音库。点击「添加影片」选择自己的文件夹后，会自动替换示例。也可以到「设置 → 影音库与刮削」清空示例库。

NAS 使用 Windows UNC 路径，例如 `\\NAS\Movies`。先在资源管理器中连接共享文件夹并保存凭据，再在「添加影片 → NAS / SMB」输入路径。当前不包含局域网自动发现和独立 SMB 账号管理。

## 已实现

| 模块 | 行为 |
| --- | --- |
| 首页 | 精选背景、继续观看、最近添加、来源与状态 |
| 影音库 | 电影 / 剧集、中文 / 原名搜索、类型筛选、排序、海报 / 列表视图 |
| 详情 | 大幅背景、海报、简介、演职人员、评分、收藏、已看标记、文件位置 |
| 本地导入 | 递归扫描视频，读取同名 NFO、movie.nfo、tvshow.nfo 与常见海报 / 背景文件 |
| 刮削 | 设置 TMDB Read Access Token 后，在影片详情中手动搜索和选择匹配结果 |
| 播放 | 内置 MP4 / WebM 等 Chromium 支持的格式，进度拖动、续播、音量、倍速、全屏、外挂 WebVTT 字幕 |
| 外部 mpv | 在设置中指定 mpv.exe，可播放 MKV、HEVC 等更多格式；当前不回传外部播放进度 |
| 存储 | 本机 JSON 持久化影片、来源、收藏、观看进度；Windows 凭据加密保存 TMDB 令牌 |
| 离线来源 | 刷新失败时标记来源离线，并保留已有资料 |

本版本尚未内嵌 libmpv，也没有自动批量在线刮削、完整电视剧季集聚合或 HDR 输出控制。示例库的播放按钮会打开明确标记的 Big Buck Bunny 演示片段，不包含示例影片正片。

网页预览支持浏览界面与导入浏览器选取的文件；直接读取 NAS 路径、NFO sidecar 与外部 mpv 需要桌面版。浏览器重启后需要重新选择本地文件夹以恢复视频访问权限。

## 本地开发

需要 Node.js 22.12+。

```sh
npm ci
npm run dev
```

访问终端显示的地址，默认 `http://localhost:5173`。

```sh
# 构建并运行桌面版
npm run desktop

# 生成 Windows x64 免安装程序
npm run package:win

# 扫描器、NFO、Range 与元数据测试
npm test

# 浏览器交互检查，先启动 npm run dev
npm run test:browser

# 本机 Electron 端到端检查（包含真实文件导入与播放）
npm run test:desktop
```

Linux 检查脚本默认使用 `/usr/bin/chromium` 和 Electron 的 headless Ozone。其他开发环境可调整脚本中的浏览器路径与启动参数。

## 文件结构

```text
src/App.tsx          界面、详情、来源、设置和播放交互
src/styles.css      视觉样式与窗口尺寸适配
src/storage.ts      网页预览存储与 TMDB 客户端
electron/main.cjs   Windows 窗口、IPC、文件协议与持久化
electron/library.cjs 文件扫描、NFO、HTTP Range 与 TMDB 查询
tests/              核心行为测试
scripts/            构建素材与端到端检查
reference/          界面截图（工作目录中，源码压缩包不包含官方参考图）
```

## 验证范围

已进行 TypeScript / Vite 构建、核心测试、Chromium 交互检查与 Linux Electron 文件导入 / 播放检查。Windows 可执行文件由 electron-builder 交叉打包；当前环境没有 Windows，尚未完成 Windows 实机和真实 NAS 验证。

## 素材与依赖

项目代码采用 MIT 许可证。第三方运行库保留各自许可证，Electron 运行时在打包产物中提供第三方声明。

- 图标：[Lucide](https://lucide.dev)，ISC。
- 中文字体：[Noto Sans SC](https://github.com/notofonts/noto-cjk)，SIL Open Font License；本地包含界面所需字符子集，完整许可证位于 `public/OFL.txt`。
- 示例海报与背景来自 [TMDB](https://www.themoviedb.org)，仅用于展示影音库界面，其权利属于各自权利人。
- 演示视频：[Big Buck Bunny trailer](https://media.w3.org/2010/05/bunny/trailer.mp4)，Blender Foundation，CC BY 3.0，见 [项目网站](https://peach.blender.org/about/)。

This product uses the TMDB API but is not endorsed or certified by TMDB.
