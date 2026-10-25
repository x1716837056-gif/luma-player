# 家庭影院音频与可靠性（0.1.6）

## 项目选择

复用随 Luma 提供的 mpv / FFmpeg，未更换播放运行库、下载音效插件或复制上游实现。选择与依据：

| 项目 | 本次用途 |
| --- | --- |
| [mpv](https://github.com/mpv-player/mpv) | 实际播放、WASAPI、编解码和原码直通，使用现有独立进程与 IPC |
| [FFmpeg](https://github.com/FFmpeg/FFmpeg/blob/master/libavformat/spdifenc.c) | mpv 已链接的 IEC 61937 封装与 PCM 解码，不转码成另一种有损音频 |
| [Jellyfin Desktop](https://github.com/jellyfin/jellyfin-desktop/blob/master/resources/settings/settings_description.json) | 参考其设备类型、设备、声道与分格式直通配置方式 |
| [Kodi](https://github.com/xbmc/xbmc/blob/master/xbmc/cores/AudioEngine/Sinks/AESinkWASAPI.cpp) | 对照 Windows WASAPI / IEC 格式的成熟接收端处理方式，未引入其引擎代码 |

[mpv 音频选项](https://mpv.io/manual/stable/#audio)明确支持 `ac3,eac3,dts,dts-hd,truehd`，HDMI 的 PCM 建议显式允许布局，避免 `auto` 盲信驱动声明。Windows 对编码载波与解码后声道 / 采样率分别定义，见 [Microsoft IEC 61937 说明](https://learn.microsoft.com/en-us/windows/win32/coreaudio/representing-formats-for-iec-61937-transmissions)。

## HDMI 直连功放的使用

1. 在 Windows 中确认显卡 HDMI 音频驱动正常，功放已开机。到「设置 → 播放设置 → 音频与家庭影院」，刷新并选择对应的 HDMI 功放设备。
2. 选择「家庭影院 · HDMI 源码直通」，勾选功放支持的格式。默认提供五种格式；DTS-HD 包含 HD 扩展，DTS Core 单独选择代表只发送核心。旧配置维持兼容输出，不擅自将普通扬声器切到直通。
3. PCM 声道上限按功放和实际连接选择 7.1 / 5.1 / 立体声。不把立体声强制扩展为 7.1，不限制已经直通的编码流。AAC、FLAC、ALAC、LPCM 等使用解码 PCM；PCM 独占模式可绕过系统混音器，但实际输出格式仍受设备支持影响。
4. 播放后在原生窗口右键「音频输出状态」，或片库伴随控制条查看实际状态。`spdif-truehd`、`spdif-dtshd` 等加 WASAPI 输出才标为源码直通；PCM、失联、测试空输出分别显示。还应核对功放的 Atmos / DTS:X 接收显示，不能凭片名、设置勾选或接口名字判定已接收对象音频。

直通时使用正常速度和 100% 无增益软件音量，不做响度均衡或音频滤镜加工，音量交给功放调节。载波可能显示 192 kHz / 2 声道，这不代表把 TrueHD 7.1 降成了立体声或把片源升频；界面分开显示源音轨和实际传输。源 profile 来自 ffprobe 或播放器音轨信息，不能用发行文件名当作 Atmos / DTS:X 认证。

## 恢复与数据保护

- 自动兼容模式保留现有使用习惯；独占 PCM 和 HDMI 通过设置启用。指定 WASAPI 端点时不同时强制 `--ao`，默认设备则指定 WASAPI；关闭无声的 null 自动回退。
- 开始播放、音轨切换、格式重建和设备列表变化时更新输出状态。相同轨道 / 格式不一定触发 property-change，因此切换完成后补取一次当前参数快照，晚到快照不能覆盖更新的观察值或新剧集。没有音轨 / 用户关闭音轨与设备失败分开处理。
- 所选端点缺失时暂停并说明，不自动改用其他扬声器。允许回退时，在当前端点最多尝试一次兼容 PCM；关闭回退时，所选格式未建立直通会暂停。片源本来需要 PCM 的 AAC 等不按直通失败处理。
- 「兼容 PCM 重试」仅改变本次播放，保留文件、视频位置、音轨和暂停状态。「改用系统默认输出」为用户显式操作。恢复操作有生命周期校验，停止、换集、替换 IPC 后的旧恢复不会写进新播放器。
- 回退后的 PCM、声道减少、采样率改变和只输出 DTS Core 均明确提示；不会把解码 PCM 伪装成源码直通。输出 API 状态无法证明物理设备或驱动内部没有进一步处理。
- 连播重新打开音频设备协商格式，不使用把首集格式强行延续到下一集的 gapless 固定输出。切集清理旧音频状态，保留本次明确选择的兼容 PCM。控制管道意外断开时保存最后进度、终止失控进程并报告错误；正常退出与异常断连分开。

## 维护入口与验证边界

- `shared/audio.mjs`：配置白名单与原生播放器路由；`electron/audio-output.cjs`：参数、设备枚举和实际输出诊断；`audio-monitor.cjs`：音频观察 / 暂停 / 恢复；`mpv.cjs`：生命周期和 IPC。
- `PlaybackAudioSettings.tsx`、`AudioStatus.tsx`、`audio.css`：设备、格式和输出状态；`luma-osc.lua`：原生状态面板、恢复入口、直通音量 / 速度约束。设置保存到原有 JSON，无新增资料表；`player:audio-devices` 仅枚举端点，设备名称不推断接收能力。
- `probe.cjs` 补充 profile、声道布局、采样率、位深；旧技术记录缺少新字段时保持可用。未探测 / 未知编码、多声道、多音轨和高级音频走完整原生内核，防止优先浏览器时无声或丢失轨道。既有字幕、个人资料、季集进度与 NFO 优先逻辑沿用。
- `tests/audio-output.test.cjs` 检查参数校验、PCM / 编码 / null 区分、载波与源参数、降级提示、严格模式、端点丢失、单次恢复、取消与换集保护。
- `scripts/smoke-audio.mjs` 使用授权真实片源和临时配置，关闭刮削 / 监视：AAC 立体声、TrueHD 7.1 / 48kHz PCM，TrueHD / DTS-HD / EAC3 / AC3 编码载波送到 null，音轨切换 / 速度 / 音量 / PCM 恢复 / UI 持久化；另以失效端点和静音的系统设备检查错误恢复与 IPC 断连。null 验证编码输出链路，不代表 HDMI 硬件直通认证或听音测试。

当前测试机只发现普通 WASAPI 扬声器，没有 HDMI 功放。真实功放接收 TrueHD/Atmos、DTS-HD/DTS:X、实际热插拔、锁定耗时、长片音画同步和全部物理声道听音仍待接入家庭影院验收。提供的真实片源包含 TrueHD/Atmos、DTS-HD MA、DD+/AC3 和 AAC；没有把未提供的 DTS:X / FLAC / ALAC 实片冒充已验证。此功能随 Luma 0.1.6 发布；源码载波与静音 WASAPI 恢复验证不等同于功放接收或听音验收。
