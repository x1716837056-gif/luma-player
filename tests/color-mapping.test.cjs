const {test}=require('node:test'),assert=require('node:assert/strict');
const {normalizeColorMapping,colorOptions,colorArguments}=require('../electron/color-mapping.cjs');
test('legacy and invalid color settings keep automatic display detection and cannot inject options',()=>{
  for(const value of [undefined,null,{},'hdr',{output:'--script=bad',curve:'unknown',peakNits:100000}]){
    assert.deepEqual(normalizeColorMapping(value),{output:'auto',curve:'auto',peakNits:0,dynamicPeak:true});
    assert.ok(colorArguments(value).includes('--target-colorspace-hint=auto'));
    assert.ok(colorArguments(value).includes('--inverse-tone-mapping=no'));
  }
});
test('peak luminance only constrains HDR output and is reset when returning to SDR or auto',()=>{
  for(const output of ['sdr','auto'])assert.equal(colorOptions({output,peakNits:1000})['target-peak'],'auto');
  const hdr=colorOptions({output:'hdr',peakNits:600,curve:'st2094-40',dynamicPeak:false});
  assert.equal(hdr['target-peak'],'600');assert.equal(hdr['target-trc'],'pq');assert.equal(hdr['target-prim'],'bt.2020');
  assert.equal(hdr['hdr-compute-peak'],'no');assert.equal(hdr['tone-mapping'],'st2094-40');
  assert.equal(colorOptions({output:'sdr'})['target-trc'],'srgb');assert.equal(colorOptions({output:'sdr'})['target-prim'],'bt.709');
});
