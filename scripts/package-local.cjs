const {build,Platform,Arch}=require('electron-builder');
// electron-builder merges this override with package.json; repeating resource arrays would copy them twice.
const targets=process.argv.slice(3);
build({targets:Platform.WINDOWS.createTarget(targets.length?targets:['nsis','zip'],Arch.x64),config:{electronDist:require('node:path').resolve(__dirname,'../node_modules/electron/dist'),directories:{output:process.argv[2]||'release'}}}).catch(error=>{console.error(error);process.exitCode=1;});
