import {Sun} from 'lucide-react';
import type {ColorMapping,Settings} from './types';

export function PlaybackColorSettings({settings,onChange}:{settings:Settings;onChange:(settings:Settings)=>void}){
  const color:ColorMapping={output:'auto',curve:'auto',peakNits:0,dynamicPeak:true,...settings.colorMapping};
  const update=(patch:Partial<ColorMapping>)=>onChange({...settings,colorMapping:{...color,...patch}});
  return <section className="playback-color-settings" aria-label="HDR 与杜比视界色彩映射">
    <h2><Sun size={16}/>画面与 HDR</h2>
    <p className="field-help">自动读取杜比视界色彩信息，将亮部与色彩适配到屏幕。由 Luma 影院处理，保存后重新打开影片生效。</p>
    <label className="field-label" htmlFor="color-output">输出方式</label>
    <select id="color-output" value={color.output} onChange={e=>update({output:e.target.value as ColorMapping['output']})}>
      <option value="auto">自动适配屏幕（推荐）</option><option value="sdr">HDR 转 SDR · 普通屏幕</option><option value="hdr">HDR 屏幕 · PQ 输出</option>
    </select>
    {color.output==='hdr'&&<><p className="field-help">需屏幕支持 HDR，并先开启 Windows HDR。按屏幕实测峰值映射，避免亮部超出显示能力。</p>
      <label className="field-label" htmlFor="color-peak">屏幕峰值亮度</label><select id="color-peak" value={color.peakNits} onChange={e=>update({peakNits:Number(e.target.value)})}>
        <option value={0}>自动读取屏幕</option>{[400,600,1000,1500,2000,4000].map(n=><option key={n} value={n}>{n} 尼特</option>)}
      </select></>}
    <label className="field-label" htmlFor="color-curve">亮度映射</label>
    <select id="color-curve" value={color.curve} onChange={e=>update({curve:e.target.value as ColorMapping['curve']})}>
      <option value="auto">自动 · 均衡（推荐）</option><option value="spline">Spline · 平滑过渡</option><option value="bt.2390">BT.2390 · 柔和高光</option><option value="bt.2446a">BT.2446A · HDR / SDR 转换</option><option value="st2094-40">ST2094-40 · 动态曲线</option><option value="st2094-10">ST2094-10 · 动态曲线</option>
    </select>
    <label className="settings-check"><input type="checkbox" checked={color.dynamicPeak} onChange={e=>update({dynamicPeak:e.target.checked})}/>按场景分析亮度</label>
    <p className="field-help">结合场景峰值保留亮部层次；性能不足时可关闭。杜比视界色彩重建自动处理；这些选项不代表屏幕已进入杜比视界模式。</p>
    {!window.desktop&&<p className="field-help">网页预览只保存选项，实际映射需 Windows 桌面版的 Luma 影院。</p>}
  </section>;
}
