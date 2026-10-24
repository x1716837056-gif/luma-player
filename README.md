# Luma · Windows 影音库界面预览

按照 Infuse Mac 的视觉方向制作：深色侧栏、暖金色选中态、宽幅影片背景、圆角海报墙、半透明弹窗和简洁播放控件。面向本地硬盘与 NAS 共享文件夹。

当前版本为 **0.1.3**。界面使用 React / TypeScript / CSS，Windows 外壳使用 Electron。代码没有使用 Infuse 的源码、图标或品牌素材。

0.1.3 新增「设置 → 播放设置 → 画面与 HDR」，以及原生播放窗口右键的即时调整：基于现有 mpv / libplacebo 进行杜比视界色彩重建、HDR 转 SDR、屏幕亮度与色域映射。默认为自动适配屏幕；[项目选择、使用方法与验证范围](HDR-MAPPING.md)说明了物理 HDR 输出的验证边界。更新内容见 [0.1.3 发布说明](RELEASE-NOTES-0.1.3.md)。

## 直接使用 Windows 版本

[下载最近发布的 Windows x64 安装程序](https://github.com/x1716837056-gif/luma-player/releases/latest/download/Luma-Windows-x64.exe) · [版本与 ZIP 下载](https://github.com/x1716837056-gif/luma-player/releases/latest)

Windows 10 / 11 x64：首次运行 `Luma-Windows-x64.exe` 完成安装，以后从桌面或开始菜单的 **Luma** 快捷方式启动。安装程序只需运行一次；反复打开安装程序会重复安装。0.1.2 不再使用每次启动都解压全部运行库的便携 EXE，应用显示后才启动目录监听与后台整理。

不想安装时，下载发布页中的 Windows x64 ZIP，**完整解压一次**，然后双击解压文件夹里的 `Luma.exe`。请保留其余文件，不要从压缩包预览中直接运行。

音轨语言与字幕使用独立菜单；在海报、列表或播放画面上右键，可查看影片简介和片源信息。片源信息分别展示视频参数、音轨语言、字幕、文件大小与位置。

以显示已加载的影音库为启动计时终点，目标约 3 秒。首次安装 / 解压不计入日常启动；其他电脑的硬盘、杀毒扫描和配置会影响实际时间，未承诺所有设备都在 3 秒内启动。

首次启动展示明确标注的示例影音库。点击「添加影片」选择自己的文件夹后，会自动替换示例。也可以到「设置 → 影音库与刮削」清空示例库。

右上角太阳 / 月亮按钮可切换浅色与深色模式，影音库、详情、来源与设置同步切换；刷新和重新启动后保留选择。

「电影」页提供影片类型、建议观看年龄、上映年份组合分类。类型参考 Netflix 的类别浏览：动作与冒险、科幻与奇幻、悬疑与惊悚、喜剧、剧情、爱情、犯罪、恐怖、动画、儿童与家庭、纪录片、战争、历史、音乐与歌舞及西部；年龄分组为全年龄、7+、10+、13+、16+、18+和未分级。年份支持近 5 年、具体年份和年代。年龄按 TMDB / NFO 地区分级归组，缺少可靠分级时保留未分级；已有 TMDB 影片可单独补全分级，不覆盖手动资料、收藏或进度。

本机已恢复开发环境时，可以双击源码目录里的 `Start-Luma.cmd`。打包后安装程序位于 `release/Luma-Windows-x64.exe`，ZIP 版位于 `release/Luma-0.1.3-Windows-x64.zip`。

设置中填写 TMDB API Key 或读取令牌后，可自动匹配导入的影片，或点击底部「自动匹配未整理影片」。仅唯一且片名、年份足够匹配的候选会自动应用；不明确的结果留待手动确认。NFO 和手动修正的资料不会被自动刮削覆盖。后台任务支持并发限制、请求节流、瞬时错误重试和取消；海报缓存在本机。

默认使用随附 mpv 播放真实影片，支持 HEVC / MKV 等格式。独立视频窗口内提供悬浮进度、倍速、音量、音轨、字幕与全屏控件，影音库保留简洁控制条，关闭窗口时保存最终位置。设置可优先使用内置播放器；HEVC 等不兼容编码或解码失败时自动切换 mpv。

媒体库使用本机 `library.sqlite`；首次启动会迁移旧 `library.json` 并保留 `library.json.pre-sqlite.bak`，不会删除原 JSON。目录监听支持本地事件和 NAS 轮询，来源断开或文件缺失时保留原资料、收藏和观看位置。探测和刮削结果都存放在应用数据目录，不写回影片目录。

NAS 使用 Windows UNC 路径，例如 `\\NAS\Movies`。先在资源管理器中连接共享文件夹并保存凭据，再在「添加影片 → NAS / SMB」输入路径。当前不包含局域网自动发现和独立 SMB 账号管理。

## 已实现

| 模块 | 行为 |
| --- | --- |
| 首页 | 精选背景、继续观看、最近添加、来源与状态 |
| 影音库 | 电影 / 剧集、中文 / 原名搜索、类型筛选、排序、海报 / 列表视图 |
| 详情 | 大幅背景、海报、简介、演职人员、评分、收藏、已看标记、文件位置 |
| 本地导入 | 递归扫描视频，读取同名 NFO、movie.nfo、tvshow.nfo 与常见海报 / 背景文件 |
| 刮削 | tmdb-ts 搜索与详情，保守自动匹配、手动纠错、后台任务与本地海报缓存 |
| 播放 | 内置 MP4 / WebM 等 Chromium 支持的格式，进度拖动、续播、音量、倍速、全屏、外挂 WebVTT 字幕 |
| 外部 mpv | 随附 mpv，JSON IPC 回传进度、暂停、音轨和内封字幕；可指定自有播放器路径 |
| 存储 | better-sqlite3 事务保存影片、来源和任务，迁移旧 JSON；Windows 凭据加密保存 TMDB 令牌 |
| 探测 | ffprobe 读取真实容器、编码、分辨率、时长、音轨、字幕与 HDR 片源参数 |
| 离线来源 | 刷新失败时标记来源离线，并保留已有资料 |

本版本尚未内嵌 libmpv，也没有完整电视剧季集聚合、自动下一集、BDMV/ISO 原盘聚合或 HDR 显示输出验证。HDR 标签只表示 ffprobe 识别到的源参数。示例库的播放按钮会打开明确标记的 Big Buck Bunny 演示片段，不包含示例影片正片。

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

# 生成 Windows x64 安装程序与解压一次的 ZIP
npm run package:win

# 扫描器、NFO、Range 与元数据测试
npm test

# 浏览器交互检查，先启动 npm run dev
npm run test:browser

# 本机 Electron 端到端检查（包含真实文件导入与播放）
npm run test:desktop
```

首次打包前需准备 `tools/` 中的 mpv 与 ffprobe，运行 `powershell -File scripts/setup-tools.ps1`。打包保留外部程序及其许可文件，准确来源和校验值见 `THIRD-PARTY.md`。

额外验证命令：

```sh
node scripts/smoke-mpv-ui.mjs
node scripts/benchmark-startup.mjs "release/win-unpacked/Luma.exe"
node scripts/test-real-library.cjs "Z:\\a测试"
node scripts/test-real-library.cjs "Z:\\测试\\4K-HDR 演示片" "01_"
```

真实目录测试须显式提供路径，只读取媒体；临时数据库、测试视频和缓存均在本机临时目录。`smoke-mpv-ui.mjs` 额外使用完整 FFmpeg 构建中的 ffmpeg.exe 生成无声临时测试片，不修改原文件。

## 文件结构

```text
src/App.tsx          影音库、详情、来源与设置
src/PlayerModal.tsx  内置播放界面与兼容播放器回退
src/player.css       悬浮播放器控件、菜单和淡出动效
electron/player/luma-osc.lua  真实 mpv 视频窗口的悬浮控件
src/styles.css      视觉样式与窗口尺寸适配
src/storage.ts      网页预览存储与 TMDB 客户端
electron/main.cjs   Windows 窗口、IPC、文件协议与持久化
electron/library.cjs 文件扫描、NFO、HTTP Range 与 TMDB 查询
tests/              核心行为测试
scripts/            构建素材与端到端检查
reference/          界面截图（工作目录中，源码压缩包不包含官方参考图）
```

## 验证范围

2026-10-23 已在 Windows 完成 TypeScript / Vite 构建、10 项核心及服务测试、Electron 文件导入 / NFO / 本地海报 / MP4 拖动续播 / SQLite / 离线保留测试，以及 mpv 控制条端到端测试。真实 mpv 视频窗口与内置播放器均改用悬浮控件，已验证速度菜单、暂停、跳转、自动隐藏和全屏。Z 盘追加实测《坚如磐石》HEVC MP4 与《惊奇队长》4K HEVC MKV：旧版强制内置设置可自动分流到兼容内核，使用已加密保存的 API Key 自动获取中文资料、演职员、海报与背景缓存。

TMDB 支持 API Key 与读取令牌，凭据由系统加密保存。尚未完成整盘逐片兼容性检查、HDR 显示器输出和多声道设备输出。历史交接文档 `HANDOFF.md` 描述的是迁移前基线，当前行为以本 README 与实际代码为准。

## 素材与依赖

项目代码采用 MIT 许可证。第三方运行库保留各自许可证，Electron 运行时在打包产物中提供第三方声明。

- 图标：[Lucide](https://lucide.dev)，ISC。
- 中文字体：[Noto Sans SC](https://github.com/notofonts/noto-cjk)，SIL Open Font License；本地包含界面所需字符子集，完整许可证位于 `public/OFL.txt`。
- 示例海报与背景来自 [TMDB](https://www.themoviedb.org)，仅用于展示影音库界面，其权利属于各自权利人。
- 演示视频：[Big Buck Bunny trailer](https://media.w3.org/2010/05/bunny/trailer.mp4)，Blender Foundation，CC BY 3.0，见 [项目网站](https://peach.blender.org/about/)。

This product uses the TMDB API but is not endorsed or certified by TMDB.
