'use strict';
const L=require('./full-teste-lib.cjs');
const {chromium}=require('playwright');
const coverage=require('./cobertura-full-teste.cjs');
(async()=>{
 const conf=L.credentials(),token=await L.login(conf.owner,conf.password,conf.slug);
 const source=L.fs.readFileSync(L.path.join(L.ROOT,'apps/agency/src/App.tsx'),'utf8');
 const state=L.read(L.path.join(L.TMP,'full-teste-seed-state.json'));
 const ids=state.ids;
 const appRoutes=[...source.matchAll(/<Route path="([^"]+)"/g)].map(m=>'/'+m[1]);
 const auth=['/login','/signup','/forgot-password','/reset-password','/*','/onboarding'];
 const skipped=[];
 const routes=[...new Set(['/',...coverage.map(r=>r[1]),...appRoutes.filter(r=>!auth.includes(r)).map(r=>{
  const family=r.split('/')[1];
  const value={customers:ids.customer1,wishes:ids.wish0,trips:ids.trip0,proposals:ids.proposal0,bookings:ids.booking,sales:ids.sale1,offers:ids.offer0,communications:ids.communication,employees:ids.employee0,financial:ids.sale1}[family];
  if(r.includes(':')&&!value){skipped.push(r);return null;}
  return r.replace(/:saleId|:id/g,value);
 }).filter(Boolean)])];
 let browser;const results=[];
 try{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  // Nao acessa hosts externos: todas as requisicoes do navegador ficam locais.
  await context.route('**/*',route=>{const u=new URL(route.request().url());return ['http:','https:'].includes(u.protocol)&&!(u.hostname==='127.0.0.1'&&['4100','5183'].includes(u.port))?route.abort():route.continue();});
  await context.addInitScript(({token})=>sessionStorage.setItem('travel_platform_agency_session',JSON.stringify({token,expiresAt:new Date(Date.now()+3600000).toISOString()})),{token});
  const page=await context.newPage();let errors=[],failures=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().includes('/api/')&&r.status()>=400)failures.push({path:new URL(r.url()).pathname,status:r.status()});});
  L.fs.mkdirSync(L.path.join(L.OUT,'telas'),{recursive:true});
  for(const route of routes){
   errors=[];failures=[];
   try{
    await page.goto('http://127.0.0.1:5183'+route,{waitUntil:'networkidle',timeout:30000});
    const main=page.locator('main');const body=await (await main.count()?main:page.locator('body')).innerText();
    const empty=body.split('\n').filter(t=>/nenhum[a]? .*encontrad|nenhum[a]? .*cadastrad|sem registros|n[aã]o h[aá] .*cadastrad/i.test(t));
    const broken=/p[aá]gina n[aã]o encontrada|something went wrong|erro inesperado/i.test(body)||body.trim().length<20;
    const form=/\/new$|\/edit$|\/editor$|\/preview$/.test(route);
    let apiCount=null;const contract=coverage.find(r=>r[1]===route);
    if(contract?.[3]){const d=(await L.http('GET',contract[2],undefined,token)).data;apiCount=Array.isArray(d[contract[3]])?d[contract[3]].length:0;}
    const ok=!errors.length&&!failures.length&&!broken&&(!empty.length||form)&&apiCount!==0;
    const record={route,ok,errors:[...errors],httpFailures:[...failures],empty,form,apiCount};results.push(record);
    await page.screenshot({path:L.path.join(L.OUT,'telas',String(results.length).padStart(2,'0')+'.png'),fullPage:true});
    console.log(`${ok?'OK':'FALHA'} | tela ${route} | erros=${errors.length} HTTP=${failures.length} vazios=${empty.length}`);
   }catch(e){results.push({route,ok:false,error:e.message});console.log(`FALHA | tela ${route} | ${e.message}`);}
   L.save(L.path.join(L.OUT,'telas-resultado.json'),{at:new Date().toISOString(),results,skipped});
  }
 }finally{if(browser)await browser.close();}
 console.log(`TOTAL | ${results.filter(r=>r.ok).length} OK | ${results.filter(r=>!r.ok).length} FALHA | ${skipped.length} sem fixture`);
 if(results.some(r=>!r.ok)||skipped.length)process.exitCode=1;
})().catch(e=>{console.error('FALHA | navegador |',e.message);process.exitCode=1});
