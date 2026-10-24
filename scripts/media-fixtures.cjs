const fs=require('node:fs'),path=require('node:path');
// Local, ignored inventory. No personal paths or media are bundled with the app.
function selectFixture(role){
  const manifest=path.resolve(__dirname,'../verification-local/media-fixtures.json');
  if(!fs.existsSync(manifest))return null;
  const data=JSON.parse(fs.readFileSync(manifest,'utf8'));
  const candidates=data.entries.filter(e=>e.available&&e.roles.includes(role));
  const entry=candidates.find(e=>fs.existsSync(e.path));
  if(!entry)throw new Error(`The private test library has no accessible ${role} fixture; reconnect its drive.`);
  return entry;
}
module.exports={selectFixture};
