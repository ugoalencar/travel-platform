'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const ROOT = path.resolve(__dirname, '../..');
const OUT = __dirname;
const TMP = path.join(ROOT, '.tmp');
const API = 'http://127.0.0.1:4100';
const read = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const save = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
async function db() {
  const c = new Client({host:'127.0.0.1',port:55644,database:'travel_platform_teste',user:'teste_admin',password:'teste_admin_local',connectionTimeoutMillis:4000});
  await c.connect();
  const r = await c.query('select current_database() db, inet_server_port() port');
  if (r.rows[0].db !== 'travel_platform_teste') throw Error('Destino de banco proibido');
  return c;
}
async function http(method, route, body, token, allowed, attempt=0) {
  if (!route.startsWith('/') || route.startsWith('//')) throw Error('Rota invalida');
  const response = await fetch(API + route, {method, headers:{...(body === undefined ? {} : {'content-type':'application/json'}), ...(token ? {authorization:`Bearer ${token}`} : {})}, ...(body === undefined ? {} : {body:JSON.stringify(body)}),signal:AbortSignal.timeout(90000)});
  const raw = await response.text(); let data; try { data=JSON.parse(raw); } catch {data={text:raw};}
  if(response.status===429 && attempt<8) {
    const seconds=Math.max(1,Number(response.headers.get('retry-after'))||(data.code==='BACKUP_RATE_LIMIT'?60:10));
    console.log(`AGUARDA | limite HTTP | ${seconds}s ${method} ${route}`);
    for(let elapsed=0;elapsed<seconds;elapsed+=10) await new Promise(r=>setTimeout(r,Math.min(10,seconds-elapsed)*1000));
    return http(method,route,body,token,allowed,attempt+1);
  }
  if (!(allowed ? allowed.includes(response.status) : response.ok)) throw Error(`${method} ${route} HTTP ${response.status}: ${data.code || ''} ${data.message || data.error || raw.slice(0,250)}`);
  return {status:response.status,data};
}
function credentials() { return read(path.join(TMP, 'full-teste-login.json')); }
async function login(email, password, slug='alpha-viagens') {
  const cacheFile=path.join(TMP,'full-teste-sessions.json');
  const cache=fs.existsSync(cacheFile)?read(cacheFile):{};
  const key=slug+'|'+email;
  if(cache[key]&&Date.now()-cache[key].at<30*60*1000)return cache[key].token;
  const r = await http('POST','/auth/login',{agencySlug:slug,email,password});
  if (!r.data.sessionToken) throw Error('Login sem sessionToken');
  cache[key]={at:Date.now(),token:r.data.sessionToken};save(cacheFile,cache);
  return r.data.sessionToken;
}
function arrays(data) { if(Array.isArray(data)) return data; return Object.values(data).find(Array.isArray) || []; }
module.exports={fs,path,ROOT,OUT,TMP,API,read,save,db,http,credentials,login,arrays};
