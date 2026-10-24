const path=require('node:path');
function runtimeFile(name){if(path.basename(name)!==name)throw Error('Invalid runtime resource');const file=path.join(__dirname,name),root=process.resourcesPath&&path.join(process.resourcesPath,'app.asar');return root&&file.startsWith(root+path.sep)?path.join(process.resourcesPath,'app.asar.unpacked','electron',name):file;}
module.exports={runtimeFile};
