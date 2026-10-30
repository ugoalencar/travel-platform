'use strict';
// API real + PostgreSQL descartavel. Nao usa mocks, Docker ou .env.
const assert=require('node:assert/strict');
const L=require('./full-teste-lib.cjs');
const coverage=require('./cobertura-full-teste.cjs');
const results=[];
async function test(description,run){try{const detail=await run();results.push({description,ok:true,detail:detail||''});console.log(`OK | ${description} | ${detail||''}`);}catch(e){results.push({description,ok:false,detail:e.message});console.log(`FALHA | ${description} | ${e.message}`);}L.save(L.path.join(L.OUT,'e2e-resultado.json'),{at:new Date().toISOString(),results});}
function positive(value){if(typeof value==='number')return value>0;if(typeof value==='string'&&/^\d+(\.\d+)?$/.test(value))return Number(value)>0;if(Array.isArray(value))return value.length>0;if(value&&typeof value==='object')return Object.values(value).some(positive);return false;}
async function main(){
 const db=await L.db();await db.end();
 const users=L.read(L.path.join(L.TMP,'full-teste-usuarios.json'));
 const state=L.read(L.path.join(L.TMP,'full-teste-seed-state.json'));
 const tokens={};
 for(const role of ['OWNER','ADMIN','MANAGER','AGENT','VIEWER'])await test(`Login ${role}`,async()=>{
  const u=users.users.find(u=>u.role===role&&u.email.startsWith('seed-'))||users.users.find(u=>u.role===role);
  assert(u,`Usuario ${role} ausente`);tokens[role]=await L.login(u.email,u.password,users.agencySlug);
  const r=(await L.http('GET','/settings/agency',undefined,tokens[role])).data;assert.equal(r.userRole,role);return 'sessao e papel confirmados';
 });
 const call=async(method,route,body,role='OWNER',allowed)=>(await L.http(method,route,body,tokens[role],allowed));
 const get=async route=>(await call('GET',route)).data;
 const post=async(route,body={})=>(await call('POST',route,body)).data;
 if(process.argv.includes('--atomic-sale-only')){
  await atomicSaleScenario({post,call,state});
  const failed=results.filter(r=>!r.ok).length;
  L.save(L.path.join(L.OUT,'e2e-venda-atomica-resultado.json'),{at:new Date().toISOString(),total:results.length,passed:results.length-failed,failed,results});
  console.log(`TOTAL | ${results.length-failed} OK | ${failed} FALHA`);if(failed)process.exitCode=1;
  return;
 }
 if(process.argv.includes('--supplier-only')){
  await supplierCommissionScenario({get,post,call,state,tokens});
  const failed=results.filter(r=>!r.ok).length;
  L.save(L.path.join(L.OUT,'e2e-resultado.json'),{at:new Date().toISOString(),total:results.length,passed:results.length-failed,failed,results});
  console.log(`TOTAL | ${results.length-failed} OK | ${failed} FALHA`);if(failed)process.exitCode=1;
  return;
 }
 const matrix=[];
 for(const [area,route,endpoint,key] of coverage)await test(`Dados ${area} ${route}`,async()=>{
  const data=await get(endpoint);
  const count=key?(Array.isArray(data[key])?data[key].length:null):null;
  const row={area,route,endpoint,count,ok:key?count>0:positive(data)};matrix.push(row);
  if(key)assert(count>0,`Colecao ${key} vazia/ausente (chaves ${Object.keys(data).join(',')})`);else if(endpoint==='/settings/agency')assert(data.profile?.id,'Perfil ausente');else assert(positive(data),'Indicadores sem dados');
  return count===null?'indicadores presentes':`${count} registros`;
 });
 L.save(L.path.join(L.OUT,'cobertura-contagens.json'),matrix);
 await test('VIEWER nao escreve',async()=>{const r=await call('POST','/customers',{name:'SEED-NEGATIVO-VIEWER',email:'negative@example.test'},'VIEWER',[403]);assert.equal(r.data.code,'FORBIDDEN');});
 await test('AGENT nao administra',async()=>{await call('POST','/settings/departments',{name:'SEED-NEGATIVO-AGENT'},'AGENT',[403]);await call('GET','/settings/invitations',undefined,'AGENT',[403]);});
 await test('GRANT individual permite recebiveis',async()=>{const r=await call('GET','/financial/receivables',undefined,'AGENT');assert(r.data.receivables.length>0);});
 await test('REVOKE individual bloqueia caixa',async()=>{await call('GET','/financial/cash-transactions',undefined,'AGENT',[403]);});
 await test('Restricao pessoal oculta comissoes',async()=>{
  const widgets=(await call('GET','/dashboard/widgets',undefined,'MANAGER')).data.widgets;
  assert(!widgets.some(w=>w.key==='commissions_projection'));
  if(!state.ids.sale1)throw Error('Venda fixture ausente');
  const r=(await call('GET',`/sales/${state.ids.sale1}/agency-revenue`,undefined,'MANAGER')).data;
  assert.equal(r.analysis.employeeCommission,undefined,'Comissao exposta para restrito');
  assert.equal(r.analysis.difference,undefined,'Diferenca permite deduzir comissao');
  await call('GET','/employees',undefined,'MANAGER',[403]);
 });
 await test('Isolamento entre agencias via API e RLS',async()=>{
  assert(users.agencyB?.slug,'Agencia B ausente');const b=users.agencyB;
  const token=await L.login(b.email,b.password,b.slug);
  const customers=(await L.http('GET','/customers',undefined,token)).data.customers;
  assert(customers.length>0);assert(customers.every(c=>c.agencyId!==state.agencyId));
  await L.http('GET',`/customers/${state.ids.customer1}`,undefined,token,[404]);
  const c=await L.db();try{
   await c.query('begin');await c.query('set local role travel_app_runtime_local');await c.query('select set_tenant_context($1,$2)',[customers[0].agencyId,'SEED-RLS']);
   const r=await c.query('select count(*)::int n from customers where agency_id=$1',[state.agencyId]);assert.equal(r.rows[0].n,0);
  }finally{await c.query('rollback');await c.end();}
 });
 await test('Importacao CSV idempotente e rejeicao preservada',async()=>{
  assert(state.importBody,'CSV fixture ausente');
  const before=(await get('/sales')).sales.length;
  const dry=await post('/imports/sales/dry-run',state.importBody);assert.equal(dry.alreadyImported,true);
  const r=await post('/imports/sales/confirm',{...state.importBody,contentHash:dry.contentHash});assert.equal(r.replayed,true);assert.equal((await get('/sales')).sales.length,before);assert(r.summary.rejected>=1);assert(Number.isInteger(r.summary.toComplete));
 });
 await test('Campos cliente obrigatorio e desabilitado valem no servidor',async()=>{
  await call('POST','/customers',{name:'SEED-NEGATIVO-SEM-EMAIL'},'OWNER',[422]);
  await call('POST','/customers',{name:'SEED-NEGATIVO-DESABILITADO',email:'seed-negativo@example.test',socialName:'valor proibido'},'OWNER',[422]);
 });
 await test('Formas de pagamento e data de corte configuradas',async()=>{
  const config=await get('/commission-release/config');
  for(const method of ['PIX','BOLETO','CARD'])assert.equal(config.receiptRules.find(r=>r.method===method)?.requiresReceipt,method!=='CARD');
  assert(config.profiles.some(p=>p.active&&p.effect==='META_E_LIBERACAO'));
  assert.equal((await get('/commission-engine-settings')).cutoverDate,'2026-10-01');
 });
 await test('Vendas, comissoes e receita cobrem os status solicitados',async()=>{
  const sales=(await get('/sales')).sales;for(const status of ['PENDING','CONFIRMED','PAID','CANCELLED'])assert(sales.some(s=>s.status===status),`Venda ${status} ausente`);
  assert(sales.length>=12);assert((await get('/customers')).customers.length>=20);assert((await get('/suppliers')).suppliers.length>=4);
  const entries=(await get('/commissions')).commissions;for(const status of ['PENDING_RULE','PENDING','APPROVED','PAYABLE','PAID'])assert(entries.some(e=>e.status===status),`Comissao ${status} ausente`);
  const revenue=(await get('/agency-revenue/entries')).entries;for(const status of ['PENDING_RULE','FORECAST','ENTITLED','AVAILABLE','RECEIVED','CANCELLED'])assert(revenue.some(e=>e.status===status),`Receita ${status} ausente`);
  const c=await L.db();try{assert((await c.query('select count(*)::int n from sale_payment_reversals where agency_id=$1',[state.agencyId])).rows[0].n>=2);}finally{await c.end();}
 });
 for(const endpoint of ['/reports/receivables-projection','/reports/revenue-forecast','/reports/supplier-balances','/reports/commissions-projection'])await test(`Projecao e CSV ${endpoint}`,async()=>{
  const data=await get(endpoint);assert(positive(data),'Projecao sem valores');
  const csv=(await call('GET',endpoint+'?format=csv')).data;assert(csv.text?.length>20,'CSV vazio');
 });
 if(!process.argv.includes('--skip-backup'))await test('Backup criptografado -> verificacao dry-run',async()=>{
  const currentPassword=users.users.find(u=>u.role==='OWNER').password;
  const exported=await post('/settings/backup/export',{currentPassword,archivePassword:users.archivePassword});
  const envelope=exported.envelope||exported;
  L.save(L.path.join(L.TMP,'full-teste-backup.encrypted.json'),envelope);
  assert(!envelope.tables,'Arquivo deve estar criptografado');
  const r=await post('/settings/backup/verify',{envelope,archivePassword:users.archivePassword,currentPassword:users.users.find(u=>u.role==='OWNER').password});
  assert.equal(r.ok,true);assert(r.tables?.length>0);L.save(L.path.join(L.OUT,'backup-verificacao-e2e.json'),r);L.save(L.path.join(L.OUT,'backup-verificacao.json'),r);return `${r.tables.length} tabelas verificadas; restore nao executado`;
 });
 if(!process.argv.includes('--somente-leitura'))await excursionScenario({get,post,call,state});
 if(!process.argv.includes('--somente-leitura'))await supplierCommissionScenario({get,post,call,state,tokens});
 const failed=results.filter(r=>!r.ok).length;
 L.save(L.path.join(L.OUT,'e2e-resultado.json'),{at:new Date().toISOString(),total:results.length,passed:results.length-failed,failed,results});
 console.log(`TOTAL | ${results.length-failed} OK | ${failed} FALHA`);if(failed)process.exitCode=1;
}
async function atomicSaleScenario({post,call,state}){
 const marker=`SEED-ATOMIC-SALE-${Date.now()}`;
 await test('Cria venda e múltiplos itens de fornecedores em uma única transação',async()=>{
  const sale=(await call('POST','/sales',{customerId:state.ids.customer1,amount:300,notes:marker,items:[
   {description:'Item fornecedor 1',supplierId:state.ids.supplier0,qty:1,unitPrice:100,unitCost:30},
   {description:'Item fornecedor 2',supplierId:state.ids.supplier1,qty:2,unitPrice:100,unitCost:40},
  ]},'AGENT')).data.sale;
  const db=await L.db();
  try{
   const items=await db.query('select supplier_id,line_total,payable_id from sale_items where agency_id=$1 and sale_id=$2 order by description',[state.agencyId,sale.id]);
   assert.equal(items.rows.length,2);assert.deepEqual(items.rows.map(row=>Number(row.line_total)),[100,200]);
   assert(items.rows.every(row=>row.payable_id),'Cada custo de fornecedor deve estar ligado a um pagável');
   const payables=await db.query('select count(*)::int n, sum(amount)::numeric(12,2) total from payables where agency_id=$1 and sale_id=$2',[state.agencyId,sale.id]);
   assert.equal(payables.rows[0].n,2);assert.equal(Number(payables.rows[0].total),110);
   const stored=await db.query('select amount,total from sales where agency_id=$1 and id=$2',[state.agencyId,sale.id]);
   assert.deepEqual(stored.rows[0],{amount:'300.00',total:'300.00'});
   return '2 itens, 2 pagáveis e total R$300; mesma chamada POST /sales';
  }finally{await db.end();}
 });
 await test('Erro no segundo item reverte venda, primeiro item e pagáveis',async()=>{
  const failed=await call('POST','/sales',{customerId:state.ids.customer1,amount:300,notes:marker+'-ROLLBACK',items:[
   {description:'Item válido inicial',supplierId:state.ids.supplier0,qty:1,unitPrice:100,unitCost:30},
   {description:'Item inválido posterior',supplierId:'supplier-inexistente',qty:1,unitPrice:200,unitCost:40},
  ]},'AGENT',[404]);
  assert.equal(failed.status,404);
  const db=await L.db();
  try{
   const sales=await db.query('select id from sales where agency_id=$1 and notes=$2',[state.agencyId,marker+'-ROLLBACK']);
   assert.equal(sales.rows.length,0,'A venda incompleta não pode persistir');
   const items=await db.query("select count(*)::int n from sale_items where agency_id=$1 and description in ('Item válido inicial','Item inválido posterior')",[state.agencyId]);
   assert.equal(items.rows[0].n,0,'Itens parciais não podem persistir');
   const payables=await db.query("select count(*)::int n from payables where agency_id=$1 and description='SaleItem: Item válido inicial'",[state.agencyId]);
   assert.equal(payables.rows[0].n,0,'Pagável parcial não pode persistir');
  }finally{await db.end();}
  return '404 no fornecedor inválido; nenhum registro parcial persistiu';
 });
}
async function supplierCommissionScenario({get,post,call,state,tokens}){
 const key='SEED-SUPPLIER-COMMISSION-'+Date.now();let saleId,entryId;
 await test('Comissao por fornecedor aguarda repasse e usa data fixa',async()=>{
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
  const cash=(await get('/payment-conditions')).conditions.find(condition=>condition.name==='SEED-A vista'&&condition.active);
  assert(cash,'Condicao SEED A vista ativa ausente');
  await call('PUT','/agency-revenue/settlement-policy',{settlementMode:'BATCH_WINDOW',closingDay:20,paymentDays:5});
  const sale=(await post('/sales',{customerId:state.ids.customer1,amount:0,categoryId:state.ids.category0,notes:key,saleDate:today,travelStartDate:'2026-12-20',travelEndDate:'2026-12-27',originText:'Sao Paulo',destinationText:'SEED-Fornecedor repasse',passengerCount:1})).sale;
  saleId=sale.id;
  await post(`/sales/${saleId}/items`,{description:key,productId:state.ids.product0,supplierId:state.ids.supplier0,qty:1,unitPrice:1000,unitCost:600,travelers:[{name:'SEED-Passageiro fornecedor'}]});
  await post(`/sales/${saleId}/confirm`);
  await post(`/sales/${saleId}/payment-schedule`,{conditionId:cash.id,installments:1,paymentMethod:'PIX'});
  await post(`/sales/${saleId}/payments`,{amount:1000,idempotency_key:key,method:'PIX',paid_at:`${today}T15:00:00Z`,reference:key});
  await post(`/sales/${saleId}/agency-revenue/calculate`);
  let revenue=(await get(`/agency-revenue/entries?saleId=${saleId}`)).entries.find(e=>e.supplier_id===state.ids.supplier0);
  assert(revenue,'Receita do fornecedor nao criada');assert.equal(Number(revenue.amount),70);
  await post(`/sales/${saleId}/commission-attributions`,{employeeId:state.ids.employee0,supplierId:state.ids.supplier0,categoryId:state.ids.category0,recognitionDate:today});
  const generated=await post(`/sales/${saleId}/commission-entries/versioned`,{employeeId:state.ids.employee0,supplierId:state.ids.supplier0});
  entryId=generated.entryId;assert.equal(generated.amount,10);
  await call('PATCH',`/commissions/${entryId}/approve`,{});
  assert.equal((await get(`/commission-entries/${entryId}/release`)).released,0,'Comissao liberada antes do recebimento do lote');
  const batchDb=await L.db();let month;
  try{
   const used=new Set((await batchDb.query('select to_char(window_month,\'YYYY-MM\') m from agency_revenue_batches where agency_id=$1',[state.agencyId])).rows.map(row=>row.m));
   for(let year=2026;year>=2020&&!month;year--)for(let m=9;m>=1;m--){const candidate=`${year}-${String(m).padStart(2,'0')}`;if(!used.has(candidate)){month=candidate;break;}}
   assert(month,'Nenhuma janela de lote livre para fixture');
   await batchDb.query('update agency_revenue_entries set entitled_at=$3::timestamptz where agency_id=$1 and id=$2 and sale_id=$4 and status=$5',[state.agencyId,revenue.id,month+'-15T12:00:00Z',saleId,'ENTITLED']);
  }finally{await batchDb.end();}
  const batch=await post('/agency-revenue/batches/close',{month});assert(batch.id);
  revenue=(await get(`/agency-revenue/entries?saleId=${saleId}`)).entries.find(e=>e.id===revenue.id);assert.equal(revenue.status,'AVAILABLE');
  await post(`/agency-revenue/batches/${batch.id}/receive`,{reference:key+'-lote'});
  revenue=(await get(`/agency-revenue/entries?saleId=${saleId}`)).entries.find(e=>e.id===revenue.id);assert.equal(revenue.status,'RECEIVED');
  const release=await get(`/commission-entries/${entryId}/release`);
  assert.equal(release.released,10);
  const releasedDate=new Date(`${today}T00:00:00.000Z`);let due=new Date(Date.UTC(releasedDate.getUTCFullYear(),releasedDate.getUTCMonth(),10));
  if(due.toISOString().slice(0,10)<today)due=new Date(Date.UTC(releasedDate.getUTCFullYear(),releasedDate.getUTCMonth()+1,10));
  assert.equal(release.expectedPayDate,due.toISOString().slice(0,10));
  const competence=`${release.expectedPayDate.slice(0,7)}-01`;
  const payroll=(await post('/payroll-entries/generate',{employeeId:state.ids.employee0,competence})).payrollEntry;
  assert(Number(payroll.commissionsTotal)>=10,'Folha da competencia nao agrupou a comissao liberada');
  assert.equal(String(payroll.dueDate).slice(0,10),release.expectedPayDate);
  const reservationDb=await L.db();let reservation;
  try{reservation=(await reservationDb.query('select payroll_entry_id from commission_entries where agency_id=$1 and id=$2',[state.agencyId,entryId])).rows[0]?.payroll_entry_id;}finally{await reservationDb.end();}
  assert.equal(reservation,payroll.id,'Comissao nao foi reservada na folha com data fixa');
  const team=(await get('/settings/team')).team;
  const agent=team.find(user=>user.role==='AGENT'&&user.email.startsWith('seed-'));
  assert(agent,'Usuario AGENT de teste ausente');
  const linkDb=await L.db();let agentEmployeeId;
  try{
   await linkDb.query('BEGIN');await linkDb.query("select set_config('app.agency_id',$1,true)",[state.agencyId]);
   agentEmployeeId=(await linkDb.query('select id from employees where agency_id=$1 and user_id=$2',[state.agencyId,agent.id])).rows[0]?.id;
   if(!agentEmployeeId)agentEmployeeId=(await linkDb.query('select id from employees where agency_id=$1 and user_id is null order by created_at,id limit 1',[state.agencyId])).rows[0]?.id;
   await linkDb.query('COMMIT');
  }catch(error){await linkDb.query('ROLLBACK');throw error;}
  finally{await linkDb.end();}
  if(!agentEmployeeId){
   agentEmployeeId=state.ids.employee0;
   const scopes=(await get('/commission-rule-scopes')).scopes;
   if(!scopes.some(scope=>scope.employeeId===agentEmployeeId&&scope.supplierId===state.ids.supplier0&&scope.categoryId===null))
    await post('/commission-rule-scopes',{employeeId:agentEmployeeId,supplierId:state.ids.supplier0,version:{effectiveFrom:today,mode:'PERCENTAGE',calculationMetric:'SUPPLIER_SOLD_TOTAL',value:1,releaseAfterSupplierPayment:true,reason:'SEED-Privacidade do funcionario'}});
   const db=await L.db();try{
    await db.query('BEGIN');await db.query("select set_config('app.agency_id',$1,true)",[state.agencyId]);
    await db.query('update employees set user_id=$3 where agency_id=$1 and id=$2 and user_id is null',[state.agencyId,agentEmployeeId,agent.id]);await db.query('COMMIT');
   }catch(error){await db.query('ROLLBACK');throw error;}finally{await db.end();}
  }
  if(agentEmployeeId!==state.ids.employee0){
   const scopes=(await get('/commission-rule-scopes')).scopes;
   if(!scopes.some(scope=>scope.employeeId===agentEmployeeId&&scope.supplierId===state.ids.supplier0&&scope.categoryId===null))
    await post('/commission-rule-scopes',{employeeId:agentEmployeeId,supplierId:state.ids.supplier0,version:{effectiveFrom:today,mode:'PERCENTAGE',calculationMetric:'SUPPLIER_SOLD_TOTAL',value:1,releaseAfterSupplierPayment:true,reason:'SEED-Privacidade do funcionario'}});
   await post(`/sales/${saleId}/commission-attributions`,{employeeId:agentEmployeeId,supplierId:state.ids.supplier0,categoryId:state.ids.category0,recognitionDate:today});
   entryId=(await post(`/sales/${saleId}/commission-entries/versioned`,{employeeId:agentEmployeeId,supplierId:state.ids.supplier0})).entryId;
  }
  const mine=(await call('GET','/commissions/mine',undefined,'AGENT')).data;
  assert(mine.commissions.some(commission=>commission.id===entryId),'AGENT nao recebeu a propria comissao de teste');
  for(const forbidden of ['agencyRevenue','supplierRevenue','supplierCommissionRate','difference','agencyResult'])assert(!JSON.stringify(mine).includes(forbidden),`Resposta do funcionario revelou ${forbidden}`);
  return `venda=1.000; receita=70 recebida em lote ${month}; comissao=10 liberada apos o lote e agrupada na folha dia 10`;
 });
 await test('WARN marca comissao do funcionario acima da receita do fornecedor',async()=>{
  const key='SEED-SUPPLIER-COST-WARN-'+Date.now();
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
  const cash=(await get('/payment-conditions')).conditions.find(condition=>condition.name==='SEED-A vista'&&condition.active);
  assert(cash,'Condicao SEED A vista ativa ausente');
  await call('PUT','/agency-revenue/settlement-policy',{settlementMode:'PER_SALE'});
  try {
   const sale=(await post('/sales',{customerId:state.ids.customer2,amount:0,categoryId:state.ids.category1,notes:key,saleDate:today,travelStartDate:'2026-12-20',travelEndDate:'2026-12-27',originText:'Sao Paulo',destinationText:'SEED-Custo acima da receita',passengerCount:1})).sale;
   await post(`/sales/${sale.id}/items`,{description:key,productId:state.ids.product1,supplierId:state.ids.supplier1,qty:1,unitPrice:1000,unitCost:600,travelers:[{name:'SEED-Passageiro custo'}]});
   await post(`/sales/${sale.id}/confirm`);
   await post(`/sales/${sale.id}/payment-schedule`,{conditionId:cash.id,installments:1,paymentMethod:'PIX'});
   await post(`/sales/${sale.id}/payments`,{amount:1000,idempotency_key:key,method:'PIX',paid_at:`${today}T15:00:00Z`,reference:key});
   await post(`/sales/${sale.id}/agency-revenue/calculate`);
   const revenue=(await get(`/agency-revenue/entries?saleId=${sale.id}`)).entries.find(e=>e.supplier_id===state.ids.supplier1);
   assert(revenue,'Receita do fornecedor ausente');assert.equal(Number(revenue.amount),20);
   await call('POST',`/agency-revenue/entries/${revenue.id}/receive`,{amount:20,reference:key});
   await post(`/sales/${sale.id}/commission-attributions`,{employeeId:state.ids.employee1,supplierId:state.ids.supplier1,categoryId:state.ids.category1,recognitionDate:today});
   const generated=await post(`/sales/${sale.id}/commission-entries/versioned`,{employeeId:state.ids.employee1,supplierId:state.ids.supplier1});
   assert.equal(generated.amount,200);
   const db=await L.db();let snapshot;
   try{snapshot=(await db.query('select calculation_snapshot from commission_entries where agency_id=$1 and id=$2',[state.agencyId,generated.entryId])).rows[0]?.calculation_snapshot;}finally{await db.end();}
   assert.equal(snapshot?.agencyRevenueWarning,'COMMISSION_EXCEEDS_AGENCY_REVENUE');
   return 'receita=20; comissao=200; alerta de custo registrado no snapshot';
  } finally {
   await call('PUT','/agency-revenue/settlement-policy',{settlementMode:'BATCH_WINDOW',closingDay:20,paymentDays:5});
  }
 });
}
async function excursionScenario({get,post,call,state}){
 const key='SEED-E2E-'+Date.now();const f={};const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
 await test('Excursao 1000: fixture real e parcelas 300 + 350 + 350',async()=>{
  f.sale=(await post('/sales',{customerId:state.ids.customer1,amount:0,categoryId:state.ids.category0,notes:key,saleDate:today,travelStartDate:'2026-12-20',travelEndDate:'2026-12-27',originText:'Sao Paulo',destinationText:'SEED-Excursao E2E',passengerCount:2})).sale;
  await post(`/sales/${f.sale.id}/items`,{description:key,productId:state.ids.product0,supplierId:state.ids.supplier0,qty:1,unitPrice:1000,unitCost:600,travelers:[{name:'SEED-Passageiro E2E'}]});
  await post(`/sales/${f.sale.id}/confirm`);
  const bal=await post(`/sales/${f.sale.id}/payment-schedule`,{conditionId:state.ids.entry,installments:1,paymentMethod:'PIX'});
  assert.deepEqual(bal.receivables.map(r=>Number(r.amount)),[300,700]);
  await post(`/sales/${f.sale.id}/commission-attributions`,{employeeId:state.ids.employee0,categoryId:state.ids.category0,recognitionDate:today});
  const commission=await post(`/sales/${f.sale.id}/commission-entries/versioned`,{employeeId:state.ids.employee0});f.entry=commission.entryId;assert.equal(commission.amount,50);
  await call('PATCH',`/commissions/${f.entry}/approve`,{});
  await post(`/sales/${f.sale.id}/agency-revenue/calculate`);
  f.pay=async(amount,n)=>post(`/sales/${f.sale.id}/payments`,{amount,idempotency_key:key+'-'+n,method:'PIX',paid_at:today+'T15:00:00Z',reference:key+'-'+n});
 });
 await test('Entrada 300 libera 15 e nao gera direito de receita',async()=>{
  assert(f.pay,'Fixture nao criada');await f.pay(300,'entrada');
  const release=await get(`/commission-entries/${f.entry}/release`);assert.equal(release.released,15);
  const rev=await post(`/sales/${f.sale.id}/agency-revenue/calculate`);f.revenue=rev;const detail=await get(`/sales/${f.sale.id}/agency-revenue`);
  assert(!JSON.stringify(detail).includes('"status":"ENTITLED"'));return 'recebido=300; liberado=15';
 });
 await test('Parcela 350 libera 32.50; estorno retorna a 15',async()=>{
  const p=await f.pay(350,'parcela2');f.reversedPayment=p.paymentId;
  assert.equal((await get(`/commission-entries/${f.entry}/release`)).released,32.5);
  await post(`/sales/${f.sale.id}/payments/${p.paymentId}/reverse`,{reason:'SEED-E2E estorno controlado'});
  assert.equal((await get(`/commission-entries/${f.entry}/release`)).released,15);
  const replay=await post(`/sales/${f.sale.id}/payments/${p.paymentId}/reverse`,{reason:'SEED-E2E replay'});assert.equal(replay.balance.received,300);
 });
 await test('Avulsa parcial e bloqueio COMMISSION_PAID_EXCEEDS_RELEASED',async()=>{
  const p=await f.pay(350,'parcela2-corrigida');f.payable=(await post(`/commissions/${f.entry}/create-payable`)).payableId;
  const payment=(await post('/financial/payments',{direction:'OUT',amount:20,occurredAt:today,method:'PIX',reference:key+'-comissao'})).payment;
  await post(`/financial/payments/${payment.id}/allocations`,{allocations:[{payableId:f.payable,amount:20}]});
  assert.equal((await get(`/commission-entries/${f.entry}/release`)).paid,20);
  const r=await call('POST',`/sales/${f.sale.id}/payments/${p.paymentId}/reverse`,{reason:'SEED-E2E deve bloquear'},'OWNER',[409]);assert.equal(r.data.code,'COMMISSION_PAID_EXCEEDS_RELEASED');
 });
 await test('Quitacao libera 50 e receita ENTITLED de 70',async()=>{
  await f.pay(350,'parcela3');const b=await get(`/sales/${f.sale.id}/balance`);assert.equal(b.received,1000);assert.equal(b.remaining,0);
  assert.equal((await get(`/commission-entries/${f.entry}/release`)).released,50);
  await post(`/sales/${f.sale.id}/agency-revenue/calculate`);
  const entries=(await get(`/agency-revenue/entries?saleId=${f.sale.id}`)).entries;const entry=entries.find(e=>e.status==='ENTITLED');assert(entry,'ENTITLED ausente');assert.equal(Number(entry.amount),70);f.revenueEntry=entry.id;
 });
 await test('Lote BATCH_WINDOW fecha AVAILABLE e recebe RECEIVED',async()=>{
  assert(f.revenueEntry,'Receita nao gerada');
  // Nao existe rota para datar a competencia do direito. Fixture historica
  // limitada a esta entrada SEED; status e valores continuam pelo motor real.
  const c=await L.db();let month;
  try{
   const used=new Set((await c.query("select to_char(window_month,'YYYY-MM') m from agency_revenue_batches where agency_id=$1",[state.agencyId])).rows.map(r=>r.m));
   for(let year=2026;year>=2020&&!month;year--)for(let m=9;m>=1;m--){const candidate=`${year}-${String(m).padStart(2,'0')}`;if(!used.has(candidate)){month=candidate;break;}}
   assert(month);await c.query('update agency_revenue_entries set entitled_at=$3::timestamptz where agency_id=$1 and id=$2 and sale_id=$4 and status=$5',[state.agencyId,f.revenueEntry,month+'-15T12:00:00Z',f.sale.id,'ENTITLED']);
  }finally{await c.end();}
  await call('PUT','/agency-revenue/settlement-policy',{settlementMode:'BATCH_WINDOW',closingDay:20,paymentDays:5});
  const batch=await post('/agency-revenue/batches/close',{month});assert(batch.id);
  let entry=(await get(`/agency-revenue/entries?saleId=${f.sale.id}`)).entries.find(e=>e.id===f.revenueEntry);assert.equal(entry.status,'AVAILABLE');
  await post(`/agency-revenue/batches/${batch.id}/receive`,{reference:key+'-lote'});
  entry=(await get(`/agency-revenue/entries?saleId=${f.sale.id}`)).entries.find(e=>e.id===f.revenueEntry);assert.equal(entry.status,'RECEIVED');
  return `lote ${month}; competencia historica provisionada por SQL, transicoes por API`;
 });
}
main().catch(e=>{console.error('FALHA | execucao |',e.message);process.exitCode=1});
