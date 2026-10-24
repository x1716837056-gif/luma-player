# Luma 使用的开源组件

本项目代码为 MIT。以下组件和随附二进制保留各自许可证，不能把整个打包程序描述成只有 MIT 许可。

| 项目 | 用途 | 仓库 / 许可证 |
| --- | --- | --- |
| @ctrl/video-filename-parser | 前后端共用片名、年份、季集与发行信息解析 | https://github.com/scttcper/video-filename-parser · MIT |
| opencc-js 1.4.2 | 中文繁简规范化，仅后台识别时延迟加载 | https://github.com/nk2028/opencc-js · MIT AND Apache-2.0；保留 LICENSE、LICENSES/Apache-2.0.txt 与 THIRD_PARTY_LICENSES.md |
| tmdb-ts | 电影、电视剧搜索和详情、演职员数据 | https://github.com/blakejoy/tmdb-ts · MIT |
| p-queue | 后台任务并发、请求节流和取消 | https://github.com/sindresorhus/p-queue · MIT |
| chokidar | 本地目录监听、网络目录轮询 | https://github.com/paulmillr/chokidar · MIT |
| better-sqlite3 | 本机事务存储、旧 JSON 迁移、任务状态记录 | https://github.com/WiseLibs/better-sqlite3 · MIT |
| mpv | 独立播放窗口及 Windows named-pipe JSON IPC | https://github.com/mpv-player/mpv · 此处使用的常规构建包含 GPL 组件，以构建与上游许可为准 |
| FFmpeg / ffprobe | 容器、编码、音轨、字幕、分辨率和 HDR 片源参数探测 | https://github.com/FFmpeg/FFmpeg · 此处 BtbN win64-lgpl 构建随附 LICENSE.txt 为 LGPL v3 |
| OpenList v4.2.8 | 独立本机进程，115 / 百度 / 夸克的存储连接与读取 | https://github.com/OpenListTeam/OpenList · AGPL-3.0；使用未修改的官方 Windows amd64 二进制 |

OpenList 的固定下载地址、SHA-256 与源码版本见 `tools/openlist-build.json`。随程序资源附带 `tools/openlist/LICENSE` 和 `SOURCE.txt`；对应源码为 https://github.com/OpenListTeam/OpenList/tree/v4.2.8 。Luma 通过本机 API 与独立进程通信，账号授权采用 OpenList 官方授权服务及网盘官方页面；本项目的连接管理与播放器适配代码未复制上游驱动实现。接入与验证范围见 [CLOUD-SOURCES.md](CLOUD-SOURCES.md)。

精确 npm 版本保存在 package-lock.json。运行库的原始下载地址和 GitHub asset SHA-256 分别保存在 tools/mpv-build.json 和 tools/ffmpeg-build.json；本次已核对下载压缩包与该校验值一致。

mpv Windows 构建来源：https://github.com/shinchiro/mpv-winbuild-cmake/releases 。构建源及步骤：https://github.com/shinchiro/mpv-winbuild-cmake 。随附 tools/mpv/LICENSE.GPL、Copyright。

ffprobe Windows 构建来源：https://github.com/BtbN/FFmpeg-Builds/releases 。构建源及步骤：https://github.com/BtbN/FFmpeg-Builds 。随附 tools/ffmpeg/LICENSE.txt（开发目录中位于构建子目录）。分发时还需按实际构建及其链接库的许可证提供相应材料。

React、Electron、Vite、Lucide、字体等原有依赖及素材声明继续见 README.md 和 public/OFL.txt。

本次未将 electron-mpv-video / electron-libmpv 加入生产依赖：它们需要独立的原生编译和渲染验证，前者当前文档的集成还要求改变 sandbox 设置。现在采用 mpv 官方进程控制接口，保留现有 Electron sandbox、contextIsolation 与文件访问边界。播放仍是独立 mpv 窗口，不是内嵌 libmpv。
