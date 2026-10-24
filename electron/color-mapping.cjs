// mpv gpu-next / libplacebo options, validated against the bundled runtime.
// https://mpv.io/manual/master/#options-target-colorspace-hint
const curves=['auto','spline','bt.2390','bt.2446a','st2094-40','st2094-10'];
function normalizeColorMapping(value={}){
  const color=value&&typeof value==='object'?value:{};
  return {output:['auto','sdr','hdr'].includes(color.output)?color.output:'auto',
    curve:curves.includes(color.curve)?color.curve:'auto',
    peakNits:[0,400,600,1000,1500,2000,4000].includes(color.peakNits)?color.peakNits:0,
    dynamicPeak:color.dynamicPeak!==false};
}
function colorOptions(value){
  const color=normalizeColorMapping(value);
  return {'target-colorspace-hint':'auto','target-colorspace-hint-mode':'target',
    'target-trc':color.output==='sdr'?'srgb':color.output==='hdr'?'pq':'auto',
    'target-prim':color.output==='sdr'?'bt.709':color.output==='hdr'?'bt.2020':'auto',
    'target-peak':color.output==='hdr'&&color.peakNits?String(color.peakNits):'auto',
    'tone-mapping':color.curve,'gamut-mapping-mode':'perceptual',
    'hdr-compute-peak':color.dynamicPeak?'auto':'no','inverse-tone-mapping':'no'};
}
function colorArguments(value){return Object.entries(colorOptions(value)).map(([key,value])=>`--${key}=${value}`);}
module.exports={normalizeColorMapping,colorOptions,colorArguments};
