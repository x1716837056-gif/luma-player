# Luma 0.1.6

0.1.6 为电脑 HDMI 直连功放增加 WASAPI 家庭影院输出设置，并改进播放期间的音频设备状态与故障恢复。

## 家庭影院音频

- 提供系统兼容、独占 PCM、HDMI 原码直通模式；可选择 WASAPI 输出端点与 PCM 声道上限，并按功放能力设置 AC3、EAC3、DTS、DTS-HD 和 TrueHD 直通格式。
- 播放时显示实际输出格式和设备状态。只有 WASAPI 正在发送编码载波时才标为直通；PCM 回退、格式降级和设备失败会如实显示。
- 设备断开时暂停并提示。用户可以尝试在当前端点恢复为 PCM，或显式切换到系统默认端点；应用不会静默切到另一台扬声器。
- 直通模式不应用软件音量和变速；音量由功放控制。实际功放对 Atmos / DTS:X 等格式的接收，需使用相应 HDMI 设备确认。

## 下载

- `Luma-Windows-x64.exe`：Windows 10 / 11 x64 安装程序。
- `Luma-0.1.6-Windows-x64.zip`：完整解压一次后运行文件夹中的 `Luma.exe`。
- `SHA256SUMS.txt`：安装程序和 ZIP 的 SHA-256 校验值。

影院设备实测边界与兼容说明见 [AUDIO-OUTPUT.md](AUDIO-OUTPUT.md)。本次仅覆盖当前可用的 WASAPI 扬声器端点和授权媒体；测试机没有 HDMI 功放，Atmos / DTS:X 功放接收及真实热插拔仍需相应设备验收。
