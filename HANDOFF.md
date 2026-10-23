# Luma 项目迁移与开发交接

交接日期：2026-10-23。当前版本：0.1.0。本文依据实际源码、package-lock.json、打包产物与上一轮验证记录整理。

## 1. 用户需求与已确认方向

- 要做 Windows 电脑版、类似苹果 Infuse 的视频播放器，带影音库和刮削。
- 片源已经确认以本地硬盘和 NAS 共享文件夹为主。
- 用户尤其重视前端：希望尽量接近 Infuse Mac 的视觉风格，明确接受高度参考它的界面。
- 当前界面名称暂定 Luma；这不是用户指定的最终产品名，后续可以改名。
- 继续开发时保留目前的视觉方向：深色侧栏、低对比边框、暖金色强调、圆角海报、电影大背景、简洁控件。不要自行改成普通后台管理系统。
- 先前讨论过 Flutter + media_kit，但实际交付代码是 React + Electron。不要把选型建议当成已经实现的架构。
- GitHub 项目只是研究参考；当前项目不是 Kodi、Frame Player、MediaElch 或 Infuse 源码的 fork。

## 2. 当前交付物与迁移包结构

建议将整个迁移包带到新电脑。解压后结构如下：

```text
Luma-transfer/
  Luma-handoff.md                  完整交接文档
  Luma-handoff.txt                 同内容文本，方便复制给其他开发助手
  SHA256SUMS.txt                   迁移包内文件的校验值
  Luma-source/
    package.json
    package-lock.json
    README.md
    HANDOFF.md
    LICENSE
    index.html
    vite.config.ts
    tsconfig.json
    src/
    electron/
    public/
    scripts/
    tests/
  artifacts/
    Luma-Windows-x64-preview.exe   Windows x64 免安装界面预览版，约 96.1 MiB
    Luma-preview.html              单文件界面预览，约 19.1 MiB
    Luma-home.png                  首页效果图
    Luma-detail.png                详情页效果图
    Luma-files.sha256              原始交付物校验值
```

原独立源码包名为 Luma-source.zip，约 13.9 MiB。迁移包中直接提供展开后的源码，方便继续开发。

原开发目录是 `/workspace/infuse-windows`，原交付物目录是 `/workspace/shared/downloads`。这些是旧环境路径，不是新电脑必须使用的路径。

源码、Windows 程序和 HTML 预览是不同用途的文件：继续开发要使用源码，不能只带 EXE 或 HTML。

## 3. 当前完成程度

这是可操作的界面预览版，不是完整成熟的 Infuse 替代品。

已经实现：

| 模块 | 实际行为 |
| --- | --- |
| 首页 | 精选影片背景、继续观看、最近添加、文件来源与状态 |
| 影音库 | 电影 / 剧集入口、中文与原名搜索、类型筛选、排序、海报 / 列表视图 |
| 影片详情 | 海报、大背景、简介、评分、演职人员文字、收藏、已看标记、文件位置 |
| 本地导入 | 原生选择目录、递归扫描、基本片名 / 年份 / 季集解析 |
| NAS | 通过 Windows 可访问的 UNC 文件夹路径直接扫描、读取文件 |
| NFO | 自动读取同名 .nfo、movie.nfo、tvshow.nfo 的基础字段 |
| 本地图片 | 读取常见 poster / fanart / folder 文件命名 |
| 在线刮削 | 设置 TMDB Read Access Token 后，手动搜索并选择匹配结果 |
| 内置播放 | HTML video 播放 Chromium 能解码的格式；进度拖动、暂停、续播、音量、倍速、全屏 |
| 字幕 | 内置播放器可加载外挂 WebVTT 字幕 |
| 外部播放器 | 指定 mpv.exe 路径后启动外部 mpv，支持传入已有起播位置 |
| 保存 | 本机 JSON 保存来源、媒体、收藏和内置播放进度 |
| 离线来源 | 扫描失败时保留媒体记录并标记来源离线 |
| 演示 | 初始示例库有明确标识，示例播放使用标明的 Big Buck Bunny 片段 |

尚未完成或不能声称已具备：

- 内嵌 libmpv / 原生解码内核。
- 全格式兼容；MP4 容器也不代表其中所有编码都能被内置播放器解码。
- 外部 mpv 播放状态、进度、音轨、字幕回传。
- 自动批量 TMDB 刮削、任务队列、置信度判断和失败重试。
- 电视剧的剧 / 季 / 集完整数据模型与聚合界面。
- 自动下一集；Settings 中存在 autoplay 字段，但当前不能据此宣称自动连播已经实现。
- 完整的 SRT / ASS / 内封字幕支持。
- 真正的 HDR、Dolby Vision、Atmos 输出控制或播放能力验证。
- MediaInfo / ffprobe 探测；部分质量标记来自文件名，首页还有演示阶段的技术徽标显示逻辑，不应当成实际音视频能力检测。
- 局域网 NAS 自动发现、独立 SMB 协议栈、应用内 SMB 账号管理。
- 真实大型影音库优化、SQLite、虚拟列表、完善的数据库迁移。
- TMDB 在线图片的独立持久缓存；示例图片和读取到的本地图片可以本地显示，不代表远程海报已经完整离线化。
- 影片路径变更映射、重复文件完整处理、来源删除、明确区分删除文件与暂时不可访问文件。
- 真实演员照片；当前部分头像是姓名首字占位。
- Windows 实机与真实 NAS 兼容性验证。

## 4. 实际技术栈与版本

主程序入口：`electron/main.cjs`。前端入口：`src/main.tsx`。

以下为当前 package-lock.json 实际锁定版本，而不是 package.json 中范围的最低版本：

| 依赖 | 版本 |
| --- | --- |
| React / React DOM | 19.3.1 |
| TypeScript | 5.9.3 |
| Vite | 7.3.7 |
| Electron | 40.10.6 |
| electron-builder | 26.15.3 |
| @playwright/test | 1.64.1 |
| fast-xml-parser | 5.11.2 |
| lucide-react | 0.468.0 |

旧环境使用 Node.js 24.19.0、npm 11.9.0。新环境建议 Node.js 24 LTS；README 的最低要求为 Node.js 22.12+。

包名：`luma-player`。产品名：`Luma`。appId：`studio.luma.player`。

项目以 ES module 为主；Electron 主进程、preload 和核心扫描模块使用 `.cjs`。

当前没有需要恢复的云端数据库、网站部署或 GitHub 远程仓库。没有提供 Git 提交历史；以迁移包内文件为当前基线。

## 5. 新 Windows 电脑启动步骤

1. 安装 Node.js 24 LTS，确认 node 和 npm 能运行。
2. 解压迁移包。
3. 在 `Luma-source` 目录打开 PowerShell，确保该目录下能看到 package.json。
4. 首次在新机器上重新安装依赖，不要从旧 Linux 环境复制 node_modules。

下面命令可以直接粘贴到 Windows PowerShell。使用 npm.cmd 可避免部分机器上 npm.ps1 被执行策略拦截。

```powershell
node --version
npm.cmd --version
npm.cmd ci
npm.cmd run dev
```

浏览器打开 `http://localhost:5173`。开发服务器默认端口为 5173，实际地址以终端输出为准。

另开一个 PowerShell，进入同一个源码目录，运行桌面版：

```powershell
npm.cmd run desktop
```

该命令会先构建 dist，然后启动 Electron，加载构建产物。它不会自动连接到正在运行的 Vite 热更新服务器。

如果需要桌面热更新，可以在两个终端分别执行：

```powershell
# 终端一：保持运行
npm.cmd run dev
```

```powershell
# 终端二：先确认上一步的地址确实是这个端口
$env:LUMA_DEV_URL = "http://localhost:5173"
npx.cmd electron .
```

关闭终端后环境变量即不再影响后续新终端。恢复加载 dist 时可以执行：

```powershell
Remove-Item Env:LUMA_DEV_URL -ErrorAction SilentlyContinue
npm.cmd run desktop
```

只体验已有界面时，不需要 Node.js：可以直接运行 artifacts 中的 EXE，或者用浏览器打开单文件 HTML。

## 6. 构建与重新导出交付物

在源码目录执行：

```powershell
# TypeScript 检查和前端生产构建
npm.cmd run build

# Windows x64 免安装程序
npm.cmd run package:win

# 重新生成单文件 HTML 界面预览；必须先完成 build
node scripts/export-preview.mjs release/Luma-preview.html
```

默认 Windows 打包产物是 `release/Luma 0.1.0.exe`。先前交付时将它复制改名为 `Luma-Windows-x64-preview.exe`，内容对应同一版程序。

electron-builder 配置要点：

```json
{
  "appId": "studio.luma.player",
  "productName": "Luma",
  "directories": { "output": "release" },
  "files": ["dist/**/*", "electron/**/*", "package.json"],
  "win": {
    "target": "portable",
    "signExecutable": false,
    "icon": "public/luma.ico"
  },
  "asar": true
}
```

保留 `signExecutable: false`，不要为了跳过签名随意改成 `signAndEditExecutable: false`；后者还会跳过图标和版本资源编辑。

当前 Windows 包没有代码签名证书。这里的 portable 指免安装启动方式，不表示媒体库和设置一定写在 EXE 旁边。

public 中已经包含示例海报、背景、字体、图标和演示视频，正常构建不需要重新抓取素材。`scripts/download-artwork.py` 只是素材维护辅助脚本。

## 7. 源码结构与修改入口

```text
src/
  main.tsx              React 挂载和全局样式引入
  App.tsx               主布局、筛选、导入、详情、设置、播放器交互
  styles.css            深色界面、海报、模态框、播放控件、响应式布局
  data.ts               初始示例影音库，不是真实用户片源
  types.ts              Media / Source / Library / Settings 与 desktop bridge 类型
  storage.ts            浏览器存储、浏览器文件导入、TMDB 请求与桌面接口分流

electron/
  main.cjs              窗口、IPC、持久化、加密设置、自定义媒体协议、外部 mpv
  preload.cjs           contextBridge，向 React 暴露 window.desktop
  library.cjs           扫描、NFO、片名解析、Range 解析、TMDB 查询

public/
  artwork/              示例海报和背景
  demo.mp4              Big Buck Bunny 演示视频
  luma.svg/png/ico       本项目图标
  luma-chinese.woff2     本地中文字符子集
  OFL.txt               字体许可证

scripts/
  smoke-browser.mjs     浏览器交互检查
  smoke-native.mjs      Electron 实际导入 / 播放 / 离线检查
  export-preview.mjs    将构建产物与素材嵌入单 HTML
  download-artwork.py   可选素材下载脚本

tests/
  library.test.cjs      核心扫描、NFO、文件名、Range、TMDB 测试
```

App.tsx 内主要组件：IconButton、Artwork、Modal、PosterCard、App、DetailModal、SourceModal、SettingsModal、PlayerModal。

当前 App.tsx 与 CSS 比较集中，适合在功能边界明确后拆分组件；不要在迁移时为重构而重写整个界面。

`reference/` 是旧工作区截图与参考资料目录，被 .gitignore 忽略。迁移包已在 artifacts 中提供自己生成的首页和详情截图，不需要依赖旧 reference 目录。

## 8. 前后端边界与媒体协议

调用关系：

```text
React 界面
  -> src/storage.ts 或 window.desktop
  -> electron/preload.cjs
  -> IPC
  -> electron/main.cjs
  -> 文件系统 / library.cjs / TMDB / 外部 mpv
```

window.desktop 已暴露：

```text
loadLibrary / saveLibrary
loadSettings / saveSettings
selectFolder / scanFolder
scrape
playMpv
revealFile
windowAction
```

IPC 频道：

```text
library:load       library:save
settings:load      settings:save
source:select      source:scan
metadata:search    player:mpv
file:reveal        window:action
```

桌面本地视频、海报用自定义协议读取：

```text
luma-media://local/<encodeURIComponent(绝对文件路径)>
```

协议支持 HEAD、Accept-Ranges、单段 Range、206、416 和正确 Content-Length。视频拖动和续播依赖这些行为。

main.cjs 使用 allowedFiles 白名单；只允许已加载 / 扫描入库的视频和本地海报。接入新播放器或元数据缓存时，要同步维护文件授权和路径编码，不要通过关闭 webSecurity 解决媒体读取问题。

Electron 已开启 contextIsolation 与 sandbox，关闭 nodeIntegration。继续开发时保留这个边界。

## 9. 数据模型、存储与换机保留进度

核心类型：

```text
Library
  media: Media[]
  sources: Source[]
  demo: boolean

Media
  id, title, originalTitle, year, kind
  genre[], duration, rating, certification
  poster, backdrop, description
  director?, cast[]?, episode?
  sourceId, path?, videoUrl?, quality
  favorite?, watched?, progress?, addedAt, tmdbId?, imported?

Source
  id, name, path
  type: local | nas
  status: online | offline

Settings
  tmdbToken, metadataLanguage, autoplay
  defaultPlayer: native | mpv
  mpvPath
```

duration 的单位是分钟，progress 是 0 到 1 的比例，addedAt 是毫秒时间戳，rating 当前是字符串。不要在播放内核对接时把秒数写入 duration。

桌面运行数据位于 Electron `app.getPath('userData')` 返回的目录，核心文件为：

```text
library.json    影片、来源、收藏、观看进度
settings.json   设置，桌面 TMDB 令牌使用 safeStorage 加密
```

Windows 默认通常在 `%APPDATA%` 下的应用目录中；包名为 luma-player，产品名为 Luma。开发版、打包版或自定义 user-data-dir 可能有不同路径，以运行时 app.getPath('userData') 为准。不要仅凭 EXE 所在目录猜测数据目录。

可以先用 PowerShell查找常见候选目录：

```powershell
$lumaCandidates = @(
  (Join-Path $env:APPDATA "luma-player"),
  (Join-Path $env:APPDATA "Luma")
)
$lumaCandidates | Where-Object {
  Test-Path -LiteralPath (Join-Path $_ "library.json")
}
```

如果旧电脑已经导入真实媒体并积累收藏 / 进度：

1. 先完全退出 Luma。
2. 单独备份实际 userData 目录，至少保留 library.json、settings.json。
3. 新电脑先启动并退出一次，确认新电脑真实的数据目录。
4. 备份新目录，再恢复旧数据；不要覆盖仍在运行的程序使用的数据。
5. 尽量维持原本磁盘盘符、媒体绝对路径和 NAS UNC 路径。
6. 新电脑重新设置 TMDB Token、mpv 路径，重新完成 Windows NAS 登录。

safeStorage 加密的令牌不能假定跨电脑 / 跨 Windows 用户可解密；源码也会在解密失败时将令牌置空。不要把旧 settings.json 中的加密字符串当成可直接使用的 API Token。

浏览器预览与桌面数据互相独立。浏览器使用 localStorage：

```text
luma.library.v1
luma.settings.v1
```

浏览器的 TMDB 设置当前保存在 localStorage；迁移时不要把含真实令牌的导出内容粘贴到公共问题或仓库。普通源码、EXE、HTML 交付物不包含用户后续在自己电脑中输入的设置。

浏览器导入的视频用 blob URL；刷新 / 重启后不能靠旧 blob URL 恢复文件访问，需要重新选择文件夹。复制源码或 HTML 也不会自动迁移浏览器的收藏和设置。

路径迁移是未实现功能：来源 ID 和媒体 ID 的初始生成依赖小写化绝对路径的 SHA-256 前 20 个十六进制字符，合并也主要按 path。文件移动、改盘符或 NAS 路径变化后，重新扫描可能生成新记录，收藏不保证自动关联。需要变更路径时先备份，再实现一致的路径 / URL / 来源引用迁移，不能只做一次盲目字符串替换。

## 10. NAS、NFO 与 TMDB 使用说明

NAS 示例路径：

```text
\\NAS\Movies
\\192.168.1.10\Movies
```

先在 Windows 资源管理器验证能打开目录和读取文件，再在 Luma 连接。当前依赖 Windows 文件系统与系统保存的登录凭据，应用不会代替 Windows 完成独立 SMB 账号认证。

NAS 的已有凭据不会随源码和 library.json 自动搬到另一台电脑。优先用稳定 UNC 路径，避免新旧电脑映射盘符不同。

扫描会跳过点开头的条目、$RECYCLE.BIN、System Volume Information、@eaDir 和符号链接。当前识别的扩展名：

```text
.mp4 .mkv .webm .mov .avi .m4v .ts .m2ts .wmv .flv
```

“扫描能识别扩展名”和“内置播放器能解码”是两件事。

推荐基本文件组织：

```text
Movies/
  Arrival (2016)/
    Arrival.2016.1080p.mp4
    movie.nfo
    poster.jpg
    fanart.jpg
```

NFO 读取顺序为同名 .nfo、movie.nfo、tvshow.nfo；读取基础 title、originaltitle、year、plot、runtime、rating、director、mpaa、genre、actor/name。不是完整 Kodi NFO 规范实现。

poster 支持：`<stem>-poster.jpg/png`、poster.jpg/png、folder.jpg。
backdrop 支持：`<stem>-fanart.jpg`、fanart.jpg/png、backdrop.jpg。

TMDB 设置入口为「我的空间 / 设置 → 影音库与刮削」。这里需要 API Read Access Token（Bearer 令牌），不是把账号密码或任意 API key 文本直接填进去。设置后，在影片详情点「重新匹配资料」，输入片名、选择电影 / 剧集、搜索并点选候选项。

当前只实现基础搜索结果合并，不代表 runtime、演职人员、完整类型或剧集明细都已从详情接口补全。匹配功能会保留本地 id、path 等关联字段。

新电脑需能访问 api.themoviedb.org 和 image.tmdb.org；主进程使用 Electron net.fetch，网页预览使用浏览器 fetch。没有自带的服务端代理或默认密钥。

## 11. 已验证范围与测试迁移

以下是上一轮开发已经通过的记录，本次交接整理没有重新宣称完成 Windows 实机测试。

- npm run build：TypeScript 检查与 Vite 生产构建通过。
- npm test：5 组测试通过，覆盖片名解析、递归扫描、NFO、空目录 / 无效目录、Range、TMDB 错误与合并。
- Chromium 交互检查通过：中英文搜索、空状态、收藏重载保持、电影筛选、类型筛选、海报 / 列表切换、NAS 网页限制提示、窄窗口无横向溢出、无页面脚本错误与资源失败。
- Linux Electron 检查通过：真实 MP4 文件导入、NFO 标题、海报协议、库文件落盘、播放、拖动、暂停、进度落盘、来源离线后保留记录。
- 单文件 HTML 已通过本地 HTTP 加载检查：内嵌图片、字体、详情、搜索和演示视频正常。
- Windows EXE 已由 electron-builder 交叉构建，并检查到正确名称 / 版本资源、图标以及最新前端和 bridge 被打包。
- 尚未验证 Windows 真实启动、Windows 显卡 / 音频 / 显示缩放、真实 NAS、HDR、多声道和外部 mpv 完整流程。

测试命令：

```powershell
npm.cmd test
npm.cmd run test:browser
npm.cmd run test:desktop
```

当前测试脚本含旧 Linux 环境假设，Windows 接手时需要适配，不能把直接运行失败全部归为程序功能错误：

1. smoke-browser.mjs 指定 `/usr/bin/chromium`。Windows 可改为已安装浏览器 channel（如 msedge），或执行 `npx.cmd playwright install chromium` 后使用 Playwright 的默认 Chromium 启动方式。
2. smoke-browser.mjs 访问 http://127.0.0.1:5173，运行前要启动 Vite，确认没有被端口占用自动切到 5174。
3. smoke-native.mjs 含 --no-sandbox、--ozone-platform=headless、--disable-gpu，这是旧 Linux 运行检查的参数。Windows 可使用可见 Electron 窗口，去掉这些 Linux 适配参数，并保留独立临时 user-data-dir。
4. library.test.cjs 会创建符号链接，Windows 可能需要开发者模式或对应权限。遇到 EPERM 时，可将符号链接子场景按权限条件处理；不要因此跳过整个扫描 / NFO 测试。
5. smoke 脚本将截图写进 reference，独立源码包没有这个被忽略的目录。新环境先创建它：

```powershell
New-Item -ItemType Directory -Force reference | Out-Null
```

## 12. 已修复的问题与不要回退的行为

- 文件名中的数字不能被误当成年份。例如 Blade.Runner.2049.2017 应保留片名中的 2049；2001.A.Space.Odyssey.1968 应识别 1968。已有测试覆盖。
- 片名解析在 src/storage.ts 与 electron/library.cjs 中各有一份，细节并不完全相同；以后修改要同时检查，最好逐步统一为共享模块。
- 浏览器重新选取相同文件时，应更新 blob videoUrl，同时保留已有收藏、元数据等。
- 来源离线时不能清空库中的全部资料。
- Toast 提示层曾挡住播放器暂停按钮，现通过 `.toast { pointer-events: none }` 修复。不要回退这个规则。
- 控制栏自动隐藏使用 hideTimer 和 controlsHovered；持续移动鼠标应重置计时，悬停在控件区应保持显示。不要改回只依赖 controlsVisible 状态的简单计时。
- 窄窗口隐藏侧栏文字后，导航按钮仍有 aria-label，不能只靠被隐藏的 span 提供可访问名称。
- Range 解析支持后缀范围、开放结束范围和无效范围拒绝，不能退化成仅支持 bytes=0-。
- JSON 保存使用队列和临时文件再重命名，调整存储方案时应保持写入一致性。
- 当前白名单与 scheme 路径解析关系已经验证，不要靠全局放开本地文件访问解决新增功能。

## 13. 接手时值得优先处理的已知细节

这些是当前代码行为或功能空缺，不是已完成修复：

- 主界面「继续观看 → 查看全部」目前跳到最近添加，尚无真正的继续观看全集页。
- 刷新扫描对已存在文件倾向于保留旧记录字段，修改 NFO 后未必会覆盖旧资料；需要明确用户手动修正、本地 NFO 和新扫描字段的优先级。
- 文件被移走 / 删除后，刷新通常保留旧记录；这是保守保留行为，还缺少用户可控的清理策略。
- 浏览器预览所有导入源使用 browser-local，多个目录来源建模比较简化；桌面版来源是按路径生成 ID。
- 单文件 HTML 导出脚本与当前 Vite 单 JS / 单 CSS 产物结构耦合；以后增加代码分块时，需要升级导出脚本，不能继续假设第一个 .js 文件包含全部代码。
- 内嵌中文字体是当前界面文字的子集。增加文案或更换语言后，可能需要扩充字体，或依赖系统字体回退；它不是完整中文字体包。
- App.tsx 中部分 JSX 与 styles.css 较集中，后续可有目的地拆分，先保证视觉和行为基线不丢。

## 14. 建议下一阶段工作顺序

第一阶段：在真实 Windows 上建立基线。

- 跑现有 EXE，验证窗口按钮、100% / 125% / 150% 缩放。
- 导入少量 MP4、本地 NFO 与海报。
- 重启后确认收藏和内置播放位置保留。
- 连接真实 NAS，断网 / 恢复网络，确认资料保留。
- 配置外部 mpv，验证能打开目标视频。

第二阶段：补齐核心播放能力。

- 保留已有 UI 与桌面 bridge，先验证 native mpv 集成方案。
- 如先做外部 mpv JSON IPC，可用于同步 position、duration、pause、音轨和字幕，但仍然是外部窗口，不要宣称已经内嵌。
- 真正内嵌 libmpv 需要处理 Windows 视频窗口 / 渲染表面、Web UI 控件叠加、全屏、DPI、快捷键与生命周期，不是把 mpv.exe 路径换成 DLL 就完成。

第三阶段：自动刮削与可维护的媒体库。

- 文件名解析 -> NFO 优先 -> TMDB 候选 -> 年份 / 片名置信度 -> 低置信度人工确认。
- 增加批量任务、进度、取消、限流、重试和错误提示。
- 保留用户修正与收藏 / 已看 / 进度，不让重扫覆盖这些状态。
- 演进 SQLite、海报磁盘缓存、文件变更检测、稳定路径迁移和电视剧季集结构。

不要在用户没有要求时重写成 Flutter、变成媒体服务器 / 云盘管理平台，或把项目当成网站发布任务。

## 15. Windows 验收建议

可以直接按以下顺序手工验收：

```text
1. 运行 Luma EXE，确认显示“示例影音库”。
2. 搜索 Interstellar，仅显示星际穿越。
3. 取消 / 添加收藏，退出重开后状态保留。
4. 点击详情，检查海报、背景、中文文本、窗口缩放。
5. 添加一部真实 MP4 所在目录，确认示例库被真实库替换。
6. 加入 movie.nfo、poster.jpg、fanart.jpg，验证读取。
7. 播放、拖动、暂停、音量、倍速、全屏，退出重开续播。
8. 输入真实 NAS UNC 路径，验证导入和播放。
9. 临时让 NAS 不可访问后刷新，确认库保留且显示离线。
10. 恢复 NAS 后刷新，确认来源恢复在线。
11. 填入自己的 TMDB Read Access Token，手动匹配影片。
12. 选择外部 mpv，填正确 mpv.exe 路径，验证启动。
13. 验证无效路径、错误 Token、不支持编码等错误提示。
14. 明确记录外部 mpv 暂无回传进度等当前限制。
```

## 16. 素材与许可

- 本项目代码附 MIT LICENSE。
- Lucide 图标使用 ISC 许可证。
- Noto Sans SC 字体使用 SIL Open Font License，许可证在 public/OFL.txt。
- 示例海报 / 剧照来自 TMDB，权利属于各自权利人；不是用户真实片源。
- 演示视频为 Blender Foundation 的 Big Buck Bunny trailer，原 README 记录 CC BY 3.0 来源。
- 现有关于页保留 TMDB 说明；实际发布前按所用 API 与素材要求完善署名与许可。

## 17. 可直接复制给接手开发助手的开工指令

```text
你接手的是 Luma 0.1.0，一个面向 Windows、本地硬盘和 NAS 的 Infuse 风格影音库播放器项目。

请先阅读项目根目录 HANDOFF.md、README.md、package.json、src/types.ts，再检查实际代码。

重要约束：
1. 实际技术栈是 React 19 + TypeScript + Vite + Electron，不是 Flutter。
2. 用户最重视类似 Infuse Mac 的前端风格，请保留现有深色侧栏、暖金色强调、海报墙、大背景详情和简洁播放器。
3. 这是界面预览版本；内嵌 libmpv、自动批量 TMDB 刮削、完整季集聚合、HDR 输出尚未完成，不得把已有按钮或演示徽标当成能力已经实现。
4. 本地 NFO 自动读取、TMDB 手动匹配、内置基础播放和外部 mpv 启动已经有代码，请在现有基础上继续。
5. Windows EXE 已交叉打包，上一轮通过 Linux Electron 实际导入和播放测试，但 Windows 实机与真实 NAS 尚未验证。
6. 换机需要重新安装依赖、配置 NAS 登录、TMDB Token 与 mpv 路径；旧安全存储的加密 Token 不保证跨机可解密。
7. 保留收藏、已看和播放进度，注意绝对路径变化可能造成媒体重新识别。

第一步请定位含 package.json 的源码目录，核对 Node 版本，使用 npm ci 安装依赖；启动现有界面并在 Windows 上完成基础验收，再继续当前用户明确要求的功能。不要为了换环境先把项目重写。

如运行 npm run test:browser 或 test:desktop，先适配原 Linux 浏览器路径 / Ozone 参数，创建 reference 目录；核心测试中的符号链接场景也需要考虑 Windows 权限。

任何新结论请区分“代码实现”“Linux 已验证”“Windows 实机已验证”。
```

## 18. 原始交付物校验参考

原始独立源码 ZIP 没有包含本次新增 HANDOFF.md，因此它的哈希与迁移包内带交接文档的展开源码不应混为一谈。原始文件 SHA-256：

```text
e85d9c2d8100bea6d768832cb0f5cc60b94e1fa0ccf7f00d4b278eb67b959c4d  Luma-Windows-x64-preview.exe
4e24843b2f94ae00fc346f23ff2166b3ea45f228799687cdecb24d6432fd428d  Luma-preview.html
a64633b7d8dbeacefd980bc3c6122a83188d80a4107b3e48c0b563535e9825c0  Luma-source.zip
29ef81138edd60b0bab6b527de2abe67ac6065cfe45775120b109162d92255fd  Luma-home.png
99eeead207d37d88bf1f4f4e43e6f1f5e6538778aa96b46d2a707b46d3f51643  Luma-detail.png
```

新迁移包根目录 SHA256SUMS.txt 使用的是包内实际文件路径与校验值，可以作为本次迁移的基线。
