'use strict';
// Executar na raiz: bun --no-env-file artifacts/full-finalization/seed-full-teste.cjs
// Destinos fixos. Nao aplica migrations, nao inicia servicos, nao le .env.
const L = require('./full-teste-lib.cjs');
const crypto = require('node:crypto');
const statePath=L.path.join(L.TMP,'full-teste-seed-state.json');
const state=L.fs.existsSync(statePath)?L.read(statePath):{ids:{},steps:{}};
let token;
const get=async p=>(await L.http('GET',p,undefined,token)).data;
const post=async(p,b={})=>(await L.http('POST',p,b,token)).data;
const put=async(p,b)=>(await L.http('PUT',p,b,token)).data;
function checkpoint(){L.save(statePath,state);}
async function step(name,fn){if(process.argv.includes('--areas')&&name.startsWith('venda '))return;try{await fn();state.steps[name]={ok:true};console.log(`OK | ${name}`);}catch(e){state.steps[name]={ok:false,error:e.message};console.log(`FALHA | ${name} | ${e.message}`);}checkpoint();}
async function ensure(key,route,body,field,match) {
 const rows=L.arrays(await get(route));
 const found=rows.find(match|| (r=>body.name?r.name===body.name:body.title?r.title===body.title:body.notes?r.notes===body.notes:false));
 const response=found?null:await post(route,body);
 const result=found || response[field] || Object.values(response).find(v=>v&&typeof v==='object'&&v.id);
 if(!result?.id) throw Error(`Resposta sem id em ${route}`);
 state.ids[key]=result.id;checkpoint();return result;
}
function cpf(n){let s=String(790000000+n);for(let k=9;k<=10;k++){let sum=0;for(let i=0;i<k;i++)sum+=Number(s[i])*(k+1-i);let v=(sum*10)%11;s+=v===10?'0':String(v);}return s;}
const id=k=>{if(!state.ids[k])throw Error(`Dependencia ausente: ${k}`);return state.ids[k]};
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date()), future='2026-12-20';
async function main(){
 const c=await L.db();await c.end();
 const conf=L.credentials();token=await L.login(conf.owner,conf.password,conf.slug);
 const profile=await get('/settings/agency');state.agencyId=profile.profile.id;
 if(profile.profile.slug!=='alpha-viagens')throw Error('Agencia inesperada');
 const usersFile=L.path.join(L.TMP,'full-teste-usuarios.json');
 const users=L.fs.existsSync(usersFile)?L.read(usersFile):{agencySlug:conf.slug,users:[],archivePassword:crypto.randomBytes(24).toString('base64url')};
 for(const [role,email] of [['OWNER',conf.owner],['ADMIN',conf.admin]]){
  if(!users.users.some(u=>u.email===email))users.users.push({role,email,password:conf.password});
 }
 users.users=users.users.filter(u=>u.email!=='pedro@alpha.test');
 L.save(usersFile,users);
 await step('usuarios MANAGER e VIEWER',async()=>{
  for(const role of ['MANAGER','VIEWER','AGENT']){
   const email=`seed-${role.toLowerCase()}@alpha.test`;
   let user=users.users.find(u=>u.email===email);
   if(!user){user={role,email,password:`T!a9${crypto.randomBytes(18).toString('base64url')}`};users.users.push(user);L.save(usersFile,users);}
   const team=(await get('/settings/team')).team;
   if(!team.some(u=>u.email===email)){
    const inv=await post('/settings/invitations',{email,role,name:`SEED-${role}`,ttlDays:30});
    await L.http('POST',`/invitations/${inv.token}/accept`,{name:`SEED-${role}`,password:user.password});
   }
   const member=(await get('/settings/team')).team.find(u=>u.email===email);state.ids[role]=member.id;
  }
 });
 await step('departamento e convite pendente',async()=>{
  await ensure('department','/settings/departments',{name:'SEED-Comercial'},'department');
  const inv=(await get('/settings/invitations')).invitations;
  if(!inv.some(i=>i.email==='seed-pendente@alpha.test'&&i.status==='PENDING'))await post('/settings/invitations',{email:'seed-pendente@alpha.test',name:'SEED-Convite Pendente',role:'AGENT',ttlDays:30});
 });
 await step('campos cliente',()=>put('/settings/customers/field-settings',{fields:[{fieldKey:'email',enabled:true,required:true},{fieldKey:'social_name',enabled:false,required:false}]}));
 for(let i=1;i<=20;i++)await step(`cliente ${i}`,()=>ensure(`customer${i}`,'/customers',{name:`SEED-Cliente Ficticio ${String(i).padStart(2,'0')}`,email:`seed-cliente-${i}@example.test`,phone:'11900000000',cpf:cpf(i),birthDate:'1990-01-15',nationality:'Brasileira',address:{zipCode:'01001000',street:'Rua Ficticia de Teste',number:String(i),neighborhood:'Centro',city:'Sao Paulo',state:'SP',country:'Brasil'},notes:'SEED-dados inteiramente ficticios'},'customer',r=>r.email===`seed-cliente-${i}@example.test`));
 for(const [i,name] of ['Aereo','Terrestre','Rodoviario','Cruzeiro','Hospedagem'].entries())await step(`categoria ${name}`,async()=>{
  const cat=await ensure(`category${i}`,'/sale-categories',{name:`SEED-${name}`},'category');
  const fields=['sale_date','travel_start_date','travel_end_date','origin_text','destination_text','passenger_count','locator'].map(fieldKey=>({fieldKey,enabled:true,required:fieldKey==='destination_text'}));
  const form=(await get(`/sale-categories/${cat.id}/form`)).form;
  if(!form.fields?.some(f=>f.fieldKey==='destination_text'&&f.required))await put(`/sale-categories/${cat.id}/form`,{fields});
 });
 for(let i=0;i<5;i++)await step(`fornecedor e produto ${i}`,async()=>{
  const supplier=await ensure(`supplier${i}`,'/suppliers',{name:`SEED-Fornecedor ${i+1}`,email:`seed-fornecedor-${i}@example.test`,notes:'SEED-FICTICIO'},'supplier');
  const product=await ensure(`product${i}`,'/travel-products',{title:`SEED-Produto ${['Aereo','Terrestre','Excursao','Cruzeiro','Hotel'][i]}`,category:['TICKET','TRANSFER','TOUR','CRUISE','HOTEL'][i],categoryId:id(`category${i}`),supplierId:supplier.id,destination:'Destino Ficticio',cost:600,price:1000,active:true},'travelProduct');
  if(product.supplierId!==supplier.id)await L.http('PATCH',`/travel-products/${product.id}`,{supplierId:supplier.id},token);
 });
 await step('condicoes de pagamento',async()=>{
  const base={maxInstallments:1,minInstallmentAmount:null,interestFree:true,downPaymentMode:'NONE',downPaymentValue:0,downPaymentRequired:false,balanceDeadlineAnchor:'SALE_DATE',balanceDeadlineOffsetDays:0,allowsPartialPayments:true,paymentMethods:['PIX','BOLETO','CARD'],categoryIds:[],productIds:[]};
  for(const [key,extra] of [['cash',{name:'SEED-A vista',scheduleKind:'SINGLE'}],['card',{name:'SEED-Cartao 10x minimo 100',scheduleKind:'EQUAL_INSTALLMENTS',maxInstallments:10,minInstallmentAmount:100}],['entry',{name:'SEED-Entrada 30 saldo D-15',scheduleKind:'DOWN_PAYMENT_PLUS_BALANCE',maxInstallments:3,downPaymentMode:'PERCENT',downPaymentValue:30,downPaymentRequired:true,balanceDeadlineAnchor:'TRAVEL_START',balanceDeadlineOffsetDays:-15}]])await ensure(key,'/payment-conditions',{...base,...extra},'condition');
 });
 await step('planos e funcionarios',async()=>{
  const plan=await ensure('plan','/commission-plans',{name:'SEED-Plano legado 5%',calculationType:'PERCENT_SALE',percentage:5},'plan');
  for(let i=0;i<3;i++)await ensure(`employee${i}`,'/employees',{name:`SEED-Funcionario ${i+1}`,email:`seed-funcionario-${i}@example.test`,baseSalary:2000+i*200,employmentType:'EMPLOYEE',department:'SEED-Comercial',hireDate:'2026-01-01',defaultCommissionPlanId:plan.id},'employee');
 });
 await step('politica de recebimento',async()=>{for(const method of ['PIX','BOLETO','CARD'])await put('/commission-release/receipt-rules',{method,requiresReceipt:method!=='CARD'});await put('/commission-engine-settings',{cutoverDate:'2026-10-01'});});
 for(let i=0;i<12;i++)await step(`venda ${i+1}`,async()=>{
  const sale=await ensure(`sale${i}`,'/sales',{customerId:id(`customer${i+1}`),amount:0,categoryId:id(`category${i%5}`),notes:`SEED-Venda ${String(i+1).padStart(2,'0')}`,saleDate:today,travelStartDate:future,travelEndDate:'2026-12-27',originText:'Sao Paulo',destinationText:'Destino Ficticio',passengerCount:2,modalityData:{locator:`SEED${i+1}`}},'sale',r=>r.notes===`SEED-Venda ${String(i+1).padStart(2,'0')}`);
  const items=(await get(`/sales/${sale.id}/items`)).saleItems;
  if(!items.length)await post(`/sales/${sale.id}/items`,{description:`SEED-Item ${i+1}`,productId:id(`product${i%5}`),supplierId:id(`supplier${i%5}`),qty:1,unitPrice:1000,unitCost:600});
  if(sale.status==='PENDING'&&i%4!==0){await post(`/sales/${sale.id}/confirm`);}
  if(i%4===3&&sale.status!=='CANCELLED'){await post(`/sales/${sale.id}/cancel`);return;}
  if(i%4!==3){let bal=await get(`/sales/${sale.id}/balance`);if(!bal.snapshot)await post(`/sales/${sale.id}/payment-schedule`,{conditionId:id(i%3===0?'entry':i%3===1?'card':'cash'),installments:i%3===1?10:1,paymentMethod:i%3===1?'CARD':'PIX'});
   if(i%4===2){
    const db=await L.db();let exists;try{exists=(await db.query('select 1 from sale_payment_requests where agency_id=$1 and sale_id=$2 and idempotency_key=$3',[state.agencyId,sale.id,`SEED-pay-${i}`])).rows.length>0;}finally{await db.end();}
    if(!exists)await post(`/sales/${sale.id}/payments`,{amount:1000,idempotency_key:`SEED-pay-${i}`,method:'PIX',paid_at:`${today}T12:00:00Z`,reference:`SEED-pay-${i}`});
    if(sale.status!=='PAID')await post(`/sales/${sale.id}/mark-paid`);
   }
   if(i%4===1){
    const db=await L.db();let exists;try{exists=(await db.query('select 1 from sale_payment_requests where agency_id=$1 and sale_id=$2 and idempotency_key=$3',[state.agencyId,sale.id,`SEED-pay-${i}`])).rows.length>0;}finally{await db.end();}
    if(!exists)await post(`/sales/${sale.id}/payments`,{amount:300,idempotency_key:`SEED-pay-${i}`,method:'PIX',paid_at:`${today}T12:00:00Z`,reference:`SEED-pay-${i}`});
   }
  }
 });
 await step('desejos viagens ofertas propostas tarefas',async()=>{
  for(let i=0;i<3;i++){
   await ensure(`wish${i}`,'/wishes',{customerId:id(`customer${i+1}`),destination:`SEED-Destino ${i}`,budget:3000,travelersCount:2,startDate:future,endDate:'2026-12-27',notes:`SEED-Desejo ${i}`},'wish');
   await ensure(`trip${i}`,'/trips',{customerId:id(`customer${i+1}`),name:`SEED-Viagem ${i}`,destination:'Destino Ficticio',startDate:future,endDate:'2026-12-27'},'trip');
   await ensure(`offer${i}`,'/offers',{name:`SEED-Oferta ${i}`,price:1000,description:'SEED-Oferta ficticia',validUntil:'2027-01-01'},'offer');
   await ensure(`proposal${i}`,'/proposals',{customerId:id(`customer${i+1}`),offerId:id(`offer${i}`),wishId:id(`wish${i}`),title:`SEED-Proposta ${i}`,proposedPrice:1000,validUntil:'2027-01-01'},'proposal',r=>r.title===`SEED-Proposta ${i}`);
   const team=(await get('/settings/team')).team;
   await ensure(`task${i}`,'/commercial/tasks',{customerId:id(`customer${i+1}`),assignedUserId:team.find(u=>u.email=== (i===0?conf.owner:i===1?'seed-agent@alpha.test':'pedro@alpha.test')).id,title:`SEED-Tarefa ${i}`,dueAt:`${today}T12:00:00Z`},'task');
   const task=L.arrays(await get('/commercial/tasks')).find(t=>t.title===`SEED-Tarefa ${i}`);
   const assignedUserId=team.find(u=>u.email===(i===0?conf.owner:i===1?'seed-agent@alpha.test':'pedro@alpha.test')).id;
   if(task.assignedUserId!==assignedUserId)await L.http('PATCH',`/commercial/tasks/${task.id}`,{assignedUserId},token);
   await ensure(`interaction${i}`,'/commercial/interactions',{customerId:id(`customer${i+1}`),channel:'PHONE',direction:'OUTBOUND',summary:`SEED-Interacao ${i}`},'interaction',r=>r.summary===`SEED-Interacao ${i}`);
  }
 });
 await step('importacao CSV',async()=>{
  const header=['external_ref','sale_date','customer_cpf','category','supplier','total','discount','origin','destination','travel_start_date','notes'];
  const rows=[{external_ref:'SEED-CSV-1',sale_date:today,customer_cpf:cpf(1),category:'SEED-Aereo',supplier:'SEED-Fornecedor 1',total:'1000',discount:'0',origin:'Sao Paulo',destination:'Destino Ficticio',travel_start_date:future,notes:'SEED-CSV completa'},...['2','3'].map(n=>({external_ref:`SEED-CSV-${n}`,sale_date:today,customer_cpf:cpf(Number(n)),total:'800',notes:'SEED-CSV a completar'})),{external_ref:'SEED-CSV-REJEITADA',sale_date:today,customer_cpf:'00000000000',total:'-1',notes:'SEED-rejeitada'}];
  L.fs.writeFileSync(L.path.join(L.OUT,'vendas-full-teste.csv'),header.join(';')+'\n'+rows.map(r=>header.map(h=>r[h]||'').join(';')).join('\n')+'\n');
  const body={sourceSystem:'SEED-CSV',rows};state.importBody=body;
  const dry=await post('/imports/sales/dry-run',body);state.importResult=await post('/imports/sales/confirm',{...body,contentHash:dry.contentHash});
 });
 // Areas adicionais ficam em modulo separado para preservar checkpoints por dominio.
 await require('./seed-full-teste-areas.cjs')({L,state,step,ensure,get,post,put,id,token,users,today,future,checkpoint});
 const failed=Object.entries(state.steps).filter(([,v])=>!v.ok);
 L.save(L.path.join(L.OUT,'seed-resultado.json'),{at:new Date().toISOString(),steps:state.steps,failed:failed.length});
 console.log(`TOTAL | ${Object.keys(state.steps).length-failed.length} OK | ${failed.length} FALHA`);if(failed.length)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error('FALHA | seed |',e.message);checkpoint();process.exitCode=1});
module.exports={main,cpf};
