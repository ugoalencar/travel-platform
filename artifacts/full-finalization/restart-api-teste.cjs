// Apenas API teste 4100. Executar apos build para carregar a correcao de ocorrencias.
const L=require('./full-teste-lib.cjs');
const {spawn}=require('node:child_process');
(async()=>{
 const c=await L.db();await c.end();
 const p=L.read(L.path.join(L.TMP,'full-teste-pids.json'));
 if(!Number.isInteger(p.api)||p.api===p.agency)throw Error('PID invalido');
 try{process.kill(p.api);}catch(error){if(error.code!=='ESRCH')throw error;}
 await new Promise(r=>setTimeout(r,1000));
 const env={};for(const k of ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','COMSPEC','PATHEXT'])if(process.env[k])env[k]=process.env[k];
 Object.assign(env,{NODE_ENV:'development',ALLOW_DEV_AUTH:'true',HOST:'127.0.0.1',PORT:'4100',DATABASE_URL:'postgresql://travel_app_runtime_local:travel_app_runtime_local_password@127.0.0.1:55644/travel_platform_teste',PLATFORM_DATABASE_URL:'postgresql://travel_app_platform_local:travel_app_platform_local_password@127.0.0.1:55644/travel_platform_teste',RATE_LIMIT_STORE:'memory'});
 const out=L.fs.openSync(L.path.join(L.TMP,'full-teste-api.log'),'a');
 const child=spawn(process.execPath,[L.path.join(L.ROOT,'services/api/dist/services/api/src/server.js')],{cwd:L.path.join(L.ROOT,'services/api'),env,detached:true,windowsHide:true,stdio:['ignore',out,out]});
 child.unref();p.api=child.pid;L.save(L.path.join(L.TMP,'full-teste-pids.json'),p);console.log('API teste reiniciada',child.pid);
})().catch(e=>{console.error(e.message);process.exitCode=1});
