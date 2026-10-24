# HDR 与杜比视界映射

Luma 使用现有 mpv `gpu-next` / libplacebo 渲染路径处理色彩与亮度。无需重新编码、复制影片或增加另一套播放内核。普通 SDR 内容默认不扩展成 HDR。

## 项目选择

| 项目 | 能力与定位 | Luma 的选择 |
|---|---|---|
| [mpv](https://github.com/mpv-player/mpv) | 成熟播放器，GPU 渲染、Windows D3D11 输出、色调映射与 IPC 控制 | 沿用播放内核，通过受限选项控制 |
| [libplacebo](https://github.com/haasn/libplacebo) | 动态 HDR、场景亮度分析、色域映射、杜比视界色彩重建；也用于 VLC 与 FFmpeg | 使用 mpv 已包含的版本，不重复加载着色器或引入第二条映射链 |
| [dovi_tool / libdovi](https://github.com/quietvoid/dovi_tool) | 杜比 RPU 元数据解析、提取、编辑与转换 | 作为分析工具参考；播放不必先转换或修改原文件 |
| [MPC Video Renderer](https://github.com/Aleksoid1978/VideoRenderer) | Windows DirectShow 渲染器，HDR 转 SDR、HDR10 输出、部分杜比支持 | 是可行替代路线，但不能直接插入现有 mpv 渲染路径，本次不引入 |

libplacebo 的 GitHub 仓库是官方镜像，项目成熟度不宜只按镜像的 star 数判断。

## 使用

- **设置 → 播放设置 → 画面与 HDR**：保存默认值，重新打开影片后生效。设为自动适配时保持屏幕自动检测。
- **原生播放窗口右键 → 画面与 HDR**：即时调整本次播放。重开影片恢复设置页中的默认值。曲线／峰值子菜单按返回先回到画面菜单。
- **右键 → 片源信息**：分别显示实际输入色彩、渲染目标的色域／曲线／峰值与映射算法。不能把影片 HDR 标签当作屏幕已启用 HDR。
- HDR 影片使用 Luma 影院处理，即使设置了优先内置播放。普通 H.264／AAC 仍可用内置播放器；网页预览只保存设置，不实现 mpv 映射。

输出方式包括自动、普通屏幕 SDR、HDR 屏幕 PQ。HDR 模式需屏幕支持且开启 Windows HDR；峰值可自动读取或选择 400 / 600 / 1000 / 1500 / 2000 / 4000 尼特。离开 HDR 输出后复位目标峰值，避免把 SDR 屏幕当作 HDR 显示器。

曲线提供 Auto、Spline、BT.2390、BT.2446A、ST2094-40、ST2094-10。曲线名称指映射算法，不表示取得完整 Dolby 显示认证，也不表示无元数据片源会产生新的 HDR10+ 或杜比元数据。动态场景峰值分析可关闭；色域采用感知映射，不开启反向色调映射。

## 依据与验证

- [mpv 官方色彩输出与映射说明](https://mpv.io/manual/master/#options-target-colorspace-hint)：自动输出、目标亮度、映射曲线与场景峰值。
- [libplacebo 官方功能说明](https://github.com/haasn/libplacebo#features)：动态 HDR、DV Profile 5 转换、重建与色彩管理。
- [mpv 的渲染目标属性](https://mpv.io/manual/master/#properties-video-target-params)：`video-target-params` 描述实际 VO 目标；`video-out-params` 是滤镜后的视频，不能代替最终输出格式。

本次已在用户授权的私有片源上验证 P5、P7、P8、普通 HDR、高帧率和普通 SDR。检查真实渲染目标为 BT.709 SDR，并比较暂停于同一帧的窗口截图：HDR 映射曲线改变画面，普通 SDR 对照不变。另测设置保存、主进程传递、播放菜单、峰值复位与返回层级。结果与截图只保存在忽略目录中，媒体保持只读。

测试桌面是 SDR，未认证物理 HDR 屏幕亮度、HDMI 杜比输出或完整 P7 FEL 增强层合成。支持的处理能力以随附内核和实际解码／渲染状态为准；不把软件映射等同于电视已进入杜比视界模式。

保持 0.1.3 开发版；本次不发布安装包。
