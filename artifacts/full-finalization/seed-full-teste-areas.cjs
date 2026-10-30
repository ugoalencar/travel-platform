module.exports=async C=>{
 const {L,state,step,ensure,get,post,put,id,token,users,today,future,checkpoint}=C;
 await step('habilitacao local de modulos sem rota de agencia',async()=>{
  // A API de agencia nao oferece escrita de entitlements (somente plataforma).
  // Provisionamento exclusivamente no banco descartavel autorizado, sem alterar seguranca.
  const c=await L.db();try{
   await c.query('BEGIN');await c.query("select set_config('app.agency_id',$1,true)",[state.agencyId]);
   for(const feature of ['CAMPAIGNS','PESCADOR','CREATIVE_STUDIO'])await c.query("insert into agency_entitlements (agency_id,feature,enabled,limits,updated_by) values ($1,$2,true,'{}','SEED-Teste local') on conflict (agency_id,feature) do update set enabled=true",[state.agencyId,feature]);
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
 });
 await step('permissoes individuais e pessoal',async()=>{
  const team=(await get('/settings/team')).team;
  const agent=team.find(u=>u.email==='seed-agent@alpha.test');
  await put(`/settings/team/${agent.id}/permission-overrides`,{overrides:[{resource:'financial',action:'receivables.read',effect:'GRANT',reason:'SEED-Teste concessao individual'},{resource:'financial',action:'cash.read',effect:'REVOKE',reason:'SEED-Teste revogacao individual'}]});
  const restrictions=(await get('/settings/permission-restrictions')).restrictions;
  if(!restrictions.some(r=>r.role==='MANAGER'&&r.resource==='employees'&&r.action==='view'))await post('/settings/permission-restrictions',{role:'MANAGER',resource:'employees',action:'view'});
 });
 await step('dependentes e documentos',async()=>{
  for(let i=1;i<=3;i++){
   await ensure(`dependent${i}`,`/customers/${id(`customer${i}`)}/dependents`,{name:`SEED-Dependente ${i}`,relationshipType:'CHILD',birthDate:'2015-01-01'},'dependent');
   await ensure(`document${i}`,`/customers/${id(`customer${i}`)}/documents`,{documentType:'PASSAPORTE',documentNumber:`SEED0000${i}`,holderName:`SEED-Cliente ${i}`,expiryDate:'2026-11-01',notes:`SEED-Documento ${i}`},'document',r=>r.documentNumber===`SEED0000${i}`);
  }
 });
 await step('segmentacao',()=>ensure('segment','/customer-segments',{name:'SEED-Todos clientes',scope:'SHARED',filterDefinition:{operator:'AND',conditions:[{field:'customer.name',operator:'CONTAINS',value:'SEED'}]}},'segment'));
 await step('pipeline e oportunidades',async()=>{
  const p=await ensure('pipeline','/commercial/pipelines',{name:'SEED-Pipeline Viagens',description:'SEED-Funil ficticio'},'pipeline');
  const s=await ensure('stage',`/commercial/pipelines/${p.id}/stages`,{name:'SEED-Qualificacao',sequence:1,colorKey:'BLUE'},'stage');
  for(let i=1;i<=3;i++)await ensure(`opportunity${i}`,'/commercial/opportunities',{customerId:id(`customer${i}`),pipelineId:p.id,stageId:s.id,destination:`SEED-Oportunidade ${i}`,expectedValue:3000,nextActionAt:`${today}T12:00:00Z`},'opportunity',r=>r.destination===`SEED-Oportunidade ${i}`);
 });
 await step('cadastro remoto',()=>ensure('enrollment','/enrollment-links',{label:'SEED-Cadastro remoto',ttlDays:30,maxSubmissions:20},'link',r=>r.label==='SEED-Cadastro remoto'));
 await step('excursao aerea e terrestre',async()=>{
  for(const [i,transportType] of ['AEREO','TERRESTRE'].entries()){
   const ex=await ensure(`excursion${i}`,'/excursions',{name:`SEED-Excursao ${transportType}`,destination:'Destino Ficticio',transportType,origin:'Sao Paulo',airline:'SEED-Air',flightNumber:'SD100',landDescription:'SEED-Onibus',saleValue:1000,cost:600},'excursion');
   const detail=await get(`/excursions/${ex.id}`);
   let dep=detail.departures.find(d=>d.notes===`SEED-Saida ${i}`);
   if(!dep){const res=await post(`/excursions/${ex.id}/departures`,{startDate:future,endDate:'2026-12-27',notes:`SEED-Saida ${i}`,customerIds:[id(`customer${i+1}`),id(`customer${i+3}`)]});dep=res.departure||res;}
   state.ids[`excursionDeparture${i}`]=dep.id;
  }
 });
 await step('rotas saidas e reservas',async()=>{
  const route=await ensure('route','/transport/routes',{origin:'SEED-Sao Paulo',destination:'SEED-Destino',estimatedDuration:180,notes:'SEED-Rota'},'route',r=>r.origin==='SEED-Sao Paulo');
  const product=await ensure('transportProduct','/transport/products',{name:'SEED-Transporte Rodoviario',tripType:'ONE_WAY',outboundRouteId:route.id,price:1000,notes:'SEED-Transporte'},'product');
  const departure=await ensure('departure','/transport/departures',{productId:product.id,departureAt:`${future}T10:00:00Z`,capacity:40,supplierId:id('supplier1'),serviceType:'SUBCONTRACTED',notes:'SEED-Partida'},'departure',r=>r.notes==='SEED-Partida');
  await ensure('booking','/bookings',{bookerCustomerId:id('customer1'),tripType:'ONE_WAY',outboundDepartureId:departure.id,passengers:[{name:'SEED-Passageiro Adulto'},{name:'SEED-Passageiro Crianca'}],notes:'SEED-Reserva'},'booking',r=>r.notes==='SEED-Reserva');
 });
 await step('ocorrencias',async()=>{
  const team=(await get('/settings/team')).team;
  await ensure('occurrence','/operations/occurrences',{tripId:id('trip0'),type:'OUTRO',severity:'BAIXA',description:'SEED-Ocorrencia ficticia',reportedBy:team.find(u=>u.role==='OWNER').id,notes:'SEED-Ocorrencia'},'occurrence',r=>r.description==='SEED-Ocorrencia ficticia');
 });
 await step('pos viagem',async()=>{
  const trip=await ensure('pastTrip','/trips',{customerId:id('customer1'),name:'SEED-Viagem encerrada',destination:'SEED-Destino',startDate:'2026-10-01',endDate:'2026-10-05'},'trip');
  // Nao ha rota para transicao de status de viagem; fixture local historica.
  const c=await L.db();try{await c.query("update trips set status='COMPLETED' where agency_id=$1 and id=$2 and name='SEED-Viagem encerrada'",[state.agencyId,trip.id]);}finally{await c.end();}
  await L.http('PATCH',`/operations/post-trip/${trip.id}/SATISFACAO_ENVIADA`,{done:true,notes:'SEED-Checklist'},token);
 });
 await step('alertas documentais',()=>ensure('requirement',`/customers/${id('customer1')}/travel-requirements`,{tripId:id('trip0'),type:'PASSAPORTE_VALIDO',required:true,fulfilled:false,notes:'SEED-Documento pendente'},'requirement',r=>r.notes==='SEED-Documento pendente'));
 await step('seguro',async()=>{
  const p=await ensure('insuranceProduct','/insurance/products',{insurerName:'SEED-Seguradora',planName:'SEED-Plano Nacional',supplierId:id('supplier4'),costAmount:80,priceAmount:120},'product',r=>r.planName==='SEED-Plano Nacional');
  await ensure('policy','/insurance/policies',{insuranceProductId:p.id,customerId:id('customer1'),coverageStart:future,coverageEnd:'2026-12-27',costAmount:80,saleAmount:120,policyNumber:'SEED-APOLICE-1',notes:'SEED-Seguro'},'policy',r=>r.policyNumber==='SEED-APOLICE-1');
 });
 await step('campanhas cupons comunicacao',async()=>{
  await ensure('campaign','/campaigns',{name:'SEED-Campanha Ferias',description:'SEED-Campanha ficticia',startsAt:today,endsAt:'2027-01-01'},'campaign');
  await ensure('coupon','/coupons',{name:'SEED-Cupom Ferias',code:'SEED-FERIAS',type:'PERCENTAGE',value:10,startsAt:today,expiresAt:'2027-01-01',campaignId:id('campaign')},'coupon');
  await ensure('communication','/agency-communications',{title:'SEED-Comunicado de Ferias',type:'NOTICE',body:'Dados ficticios para homologacao local',placement:'AGENCY_DASHBOARD'},'communication');
 });
 await step('biblioteca midia',async()=>{
  const rows=L.arrays(await get('/media-assets'));
  if(!rows.some(r=>r.title==='SEED-Imagem teste')){
   const form=new FormData();form.append('title','SEED-Imagem teste');form.append('altText','SEED-Imagem ficticia');
   const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
   form.append('file',new Blob([bytes],{type:'image/png'}),'SEED-imagem.png');
   const r=await fetch(L.API+'/media-assets',{method:'POST',headers:{authorization:`Bearer ${token}`},body:form});if(!r.ok)throw Error(`Upload HTTP ${r.status}`);
  }
 });
 await step('pescador captura manual sem rede externa',()=>ensure('capture','/pescador/captures',{sourceUrl:'http://127.0.0.1:5183/SEED-oferta',sourceName:'SEED-Fonte local',rawContent:'SEED-Oferta ficticia manual sem busca externa',normalizedTitle:'SEED-Captura manual',foundPrice:1000},'capture',r=>r.normalizedTitle==='SEED-Captura manual'));
 await step('pescador fonte local',()=>ensure('source','/pescador/sources',{name:'SEED-Fonte local',urlTemplate:'http://127.0.0.1:5183/SEED-oferta?q={query}'},'source'));
 await step('agencia B para isolamento',async()=>{
  const file=L.path.join(L.TMP,'full-teste-usuarios.json');
  if(!users.agencyB){users.agencyB={email:'seed-owner@beta.test',password:'B!9a'+require('node:crypto').randomBytes(18).toString('base64url')};L.save(file,users);}
  if(!users.agencyB.slug){
   // A chave natural da agencia criada e o email; nao cria novamente apos queda.
   const c=await L.db();let previous;try{previous=(await c.query('select a.slug from agencies a join users u on u.agency_id=a.id where u.email=$1',[users.agencyB.email])).rows[0];}finally{await c.end();}
   if(previous)users.agencyB.slug=previous.slug;
   else{const r=await L.http('POST','/agencies/signup',{agencyName:'SEED-Beta Ficticia',contactName:'SEED-Owner Beta',contactEmail:users.agencyB.email,password:users.agencyB.password,country:'BR'});users.agencyB.slug=r.data.agencySlug;}
   L.save(file,users);
  }
  const betaToken=await L.login(users.agencyB.email,users.agencyB.password,users.agencyB.slug);
  if(!L.arrays((await L.http('GET','/customers',undefined,betaToken)).data).some(c=>c.name==='SEED-Cliente Beta'))await L.http('POST','/customers',{name:'SEED-Cliente Beta',email:'seed-cliente@beta.test'},betaToken);
 });
 await step('financeiro categorias centros receitas despesas',async()=>{
  await ensure('financialIncome','/financial/categories',{name:'SEED-Receita turismo',type:'REVENUE'},'category');
  await ensure('financialExpense','/financial/categories',{name:'SEED-Despesas turismo',type:'EXPENSE'},'category');
  await ensure('costCenter','/cost-centers',{name:'SEED-Operacao',code:'SEED-OP'},'costCenter');
  await ensure('receivableLate','/financial/receivables',{customerId:id('customer1'),description:'SEED-Recebivel atrasado',amount:700,dueAt:'2026-10-01'},'receivable',r=>r.description==='SEED-Recebivel atrasado');
  await ensure('payable','/financial/payables',{supplierId:id('supplier1'),categoryId:id('financialExpense'),costCenterId:id('costCenter'),description:'SEED-Conta fornecedor',amount:600,dueAt:'2026-10-30'},'payable',r=>r.description==='SEED-Conta fornecedor');
  await ensure('cost','/financial/operational-costs',{supplierId:id('supplier1'),description:'SEED-Custo operacional',costType:'OTHER',expectedAmount:200,actualAmount:180,incurredAt:today},'operationalCost',r=>r.description==='SEED-Custo operacional');
  await ensure('revenue','/financial/revenues',{customerId:id('customer1'),categoryId:id('financialIncome'),description:'SEED-Receita operacional',amount:250,currency:'BRL',competencyDate:today,dueDate:today},'revenue',r=>r.description==='SEED-Receita operacional');
  await ensure('expense','/financial/expenses',{supplierId:id('supplier1'),categoryId:id('financialExpense'),costCenterId:id('costCenter'),description:'SEED-Despesa operacional',amount:180,currency:'BRL',competencyDate:today,dueDate:today,incurredAt:today},'expense',r=>r.description==='SEED-Despesa operacional');
  await ensure('cash','/financial/cash-transactions',{type:'ENTRY',amount:250,occurringAt:today,origin:'SEED-Caixa',notes:'SEED-Caixa'},'transaction',r=>r.origin==='SEED-Caixa');
  await ensure('reconciliation','/financial/reconciliations',{reconciliationDate:today,expectedAmount:250,actualAmount:250,notes:'SEED-Conciliacao'},'reconciliation',r=>r.notes==='SEED-Conciliacao');
 });
 await step('regras versionadas comissoes',async()=>{
  const versions=[{mode:'PERCENTAGE',value:5},{mode:'FIXED',value:30},{mode:'PERCENTAGE',value:10,applyOn:'EXCESS',excessThreshold:500},{mode:'PERCENTAGE',progressive:true,tierMode:'MARGINAL',tiers:[{fromAmount:0,toAmount:500,rate:5},{fromAmount:500,toAmount:null,rate:8}]},{mode:'PERCENTAGE',progressive:true,tierMode:'TOTAL',tiers:[{fromAmount:0,toAmount:500,rate:5},{fromAmount:500,toAmount:null,rate:8}]}];
  for(let i=0;i<5;i++){
   let scope=(await get('/commission-rule-scopes')).scopes.find(s=>s.employeeId===id(`employee${i%3}`)&&s.categoryId===id(`category${i}`));
   if(!scope){const r=await post('/commission-rule-scopes',{employeeId:id(`employee${i%3}`),categoryId:id(`category${i}`),version:{effectiveFrom:today,calculationMetric:'GROSS',reason:`SEED-Regra ${i}`,...versions[i]}});scope={id:r.scopeId};}
   state.ids[`scope${i}`]=scope.id;
  }
  const scope=(await get('/commission-rule-scopes')).scopes.find(s=>s.employeeId===id('employee0')&&s.categoryId===id('category0'));
  if(!scope.versions.some(v=>v.reason==='SEED-Revisao futura'))await post(`/commission-rule-scopes/${scope.id}/versions`,{effectiveFrom:'2026-11-01',mode:'PERCENTAGE',calculationMetric:'GROSS',value:6,reason:'SEED-Revisao futura'});
 });
 await step('politicas por fornecedor e data fixa',async()=>{
  const suppliers=id('supplier0'), employee=id('employee0');
  await put('/commission-cost-policy',{mode:'WARN'});
  let policies=(await get('/commission-payment-policies')).policies;
  if(!policies.some(p=>p.employeeId===null&&p.mode==='FIXED_DAY'&&p.day===10)) {
   await post('/commission-payment-policies',{mode:'FIXED_DAY',effectiveFrom:today,day:10,paymentDays:0,reason:'SEED-Pagamento unificado dia 10'});
   policies=(await get('/commission-payment-policies')).policies;
  }
  let scopes=(await get('/commission-rule-scopes')).scopes;
  let scope=scopes.find(s=>s.employeeId===employee&&s.supplierId===suppliers&&s.categoryId===null);
  if(!scope) {
   const created=await post('/commission-rule-scopes',{employeeId:employee,supplierId:suppliers,version:{effectiveFrom:today,mode:'PERCENTAGE',calculationMetric:'SUPPLIER_SOLD_TOTAL',value:1,releaseAfterSupplierPayment:true,reason:'SEED-Regra fornecedor aguardando repasse'}});
   scope={id:created.scopeId};
  }
  state.ids.supplierCommissionScope=scope.id;
  const warningScope=scopes.find(s=>s.employeeId===id('employee1')&&s.supplierId===id('supplier1')&&s.categoryId===null);
  if(warningScope) state.ids.supplierCommissionWarningScope=warningScope.id;
  else {
   const warning=await post('/commission-rule-scopes',{employeeId:id('employee1'),supplierId:id('supplier1'),version:{effectiveFrom:today,mode:'PERCENTAGE',calculationMetric:'SUPPLIER_SOLD_TOTAL',value:20,reason:'SEED-Cenario acima da receita'}});
   state.ids.supplierCommissionWarningScope=warning.scopeId;
  }
 });
 await step('parceiro comercial',()=>ensure('partner','/partners',{partnerType:'PF',name:'SEED-Parceiro ficticio',email:'seed-parceiro@example.test',notes:'SEED-Parceiro'},'partner'));
 await step('comissoes atribuidas',async()=>{
  for(const i of [1,2,5,6,8,9,10]){
   const employeeId=id(`employee${(i%5)%3}`),saleId=id(`sale${i}`);
   if(i===8&&(await get(`/sales/${saleId}`)).sale.status==='PENDING')await post(`/sales/${saleId}/confirm`);
   const existing=(await get(`/commissions?saleId=${saleId}`)).commissions;
   if(!existing.some(e=>e.employeeId===employeeId)){
    await post(`/sales/${saleId}/commission-attributions`,{employeeId,categoryId:id(`category${i%5}`),recognitionDate:today});
    await post(`/sales/${saleId}/commission-entries/versioned`,{employeeId});
   }
  }
  // Funcionario sem regra correspondente: fila PENDING_RULE real.
  const saleId=id('sale1'),employeeId=id('employee2');
  if(!(await get(`/commissions?saleId=${saleId}`)).commissions.some(e=>e.employeeId===employeeId)){
   await post(`/sales/${saleId}/commission-attributions`,{employeeId,recognitionDate:today});
   await post(`/sales/${saleId}/commission-entries/versioned`,{employeeId});
  }
 });
 await step('comissoes estados e canais',async()=>{
  for(const i of [1,2,5,6]){
   let entry=(await get(`/commissions?saleId=${id(`sale${i}`)}`)).commissions.find(e=>e.employeeId===id(`employee${(i%5)%3}`));
   if(entry.status==='PENDING')entry=(await L.http('PATCH',`/commissions/${entry.id}/approve`,{},token)).data.commission;
   if(i===6)continue;
   let payable=L.arrays(await get('/financial/payables')).find(p=>p.commissionEntryId===entry.id);
   if(!payable&&entry.status==='APPROVED'){const r=await post(`/commissions/${entry.id}/create-payable`);payable={id:r.payableId};}
   if((i===1||i===2)&&payable){
    const amount=i===1?5:Number(entry.amount),reference=`SEED-Comissao paga ${i}`;
    let payment=L.arrays(await get('/financial/payments')).find(p=>p.reference===reference);
    if(!payment)payment=(await post('/financial/payments',{direction:'OUT',amount,occurredAt:today,method:'PIX',reference})).payment;
    if(!L.arrays(await get(`/financial/payments/${payment.id}/allocations`)).length)await post(`/financial/payments/${payment.id}/allocations`,{allocations:[{payableId:payable.id,amount}]});
   }
  }
 });
 await step('receita regras e calculos',async()=>{
  for(let i=0;i<5;i++){
   const modes=['PERCENTAGE','FIXED_PER_PASSENGER','FIXED_PER_SALE','FIXED_PER_ITEM','NONE'];
   if(!(await get('/agency-revenue/rules')).rules.some(r=>r.reason===`SEED-Receita ${i}`&&r.supplier_id===id(`supplier${i}`)))await post('/agency-revenue/rules',{supplierId:id(`supplier${i}`),categoryId:id(`category${i}`),mode:modes[i],...(i===0?{baseSelector:'LINE_TOTAL'}:{}),value:i===0?7:20,entitlementEvent:'ON_FULL_SETTLEMENT',collectionModel:'AGENCY_COLLECTS',effectiveFrom:today,reason:`SEED-Receita ${i}`});
  }
  for(let i=0;i<12;i++)if((await get(`/sales/${id(`sale${i}`)}`)).sale.status!=='CANCELLED')await post(`/sales/${id(`sale${i}`)}/agency-revenue/calculate`);
  const waiting=await ensure('pendingRevenueSale','/sales',{customerId:id('customer1'),amount:0,categoryId:id('category0'),notes:'SEED-Venda receita pendente',saleDate:today,destinationText:'SEED-Destino'},'sale',r=>r.notes==='SEED-Venda receita pendente');
  await ensure('pendingRevenueItem',`/sales/${waiting.id}/items`,{description:'SEED-Item sem fornecedor a completar',qty:1,unitPrice:400,travelers:[{name:'SEED-Passageiro pendente'}]},'saleItem',r=>r.description==='SEED-Item sem fornecedor a completar');
  await post(`/sales/${waiting.id}/agency-revenue/calculate`);
 });
 await step('passageiros dos itens sem rota de edicao',async()=>{
  // POST suporta travelers, mas nao existe PATCH de item. Enriquecer somente
  // fixtures SEED ja criadas sem alterar fornecedor, valores ou obrigacoes.
  const c=await L.db();try{await c.query("update sale_items set travelers=$2::jsonb where agency_id=$1 and description like 'SEED-Item %' and (travelers is null or travelers='[]'::jsonb)",[state.agencyId,JSON.stringify([{name:'SEED-Passageiro adulto',type:'ADULT'},{name:'SEED-Passageiro crianca',type:'CHILD'}])]);}finally{await c.end();}
 });
 await step('receita lotes fechado e recebido',async()=>{
  await put('/agency-revenue/settlement-policy',{settlementMode:'BATCH_WINDOW',closingDay:20,paymentDays:5});
  for(const [i,month,receive] of [[2,'2026-08',true],[6,'2026-09',false]]){
   const batches=(await get('/agency-revenue/batches')).batches;
   // Datas historicas de entitlement nao sao expostas por rota. Nao altera status/valores por SQL.
   const c=await L.db();let exists;
   try{
    exists=(await c.query('select id from agency_revenue_batches where agency_id=$1 and window_month=$2::date',[state.agencyId,month+'-01'])).rows[0];
    if(!exists)await c.query("update agency_revenue_entries set entitled_at=$3::timestamptz where agency_id=$1 and sale_id=$2 and status='ENTITLED'",[state.agencyId,id(`sale${i}`),month+'-15T12:00:00Z']);
   }finally{await c.end();}
   const batch=exists||await post('/agency-revenue/batches/close',{month});
   if(receive)await post(`/agency-revenue/batches/${batch.id}/receive`,{reference:'SEED-Recebimento lote agosto'});
   state.ids[`batch${i}`]=batch.id;
  }
  const entry=(await get(`/agency-revenue/entries?saleId=${id('sale9')}`)).entries.find(e=>e.status==='FORECAST');
  if(entry)await post(`/agency-revenue/entries/${entry.id}/cancel`);
 });
 await step('estornos de teste',async()=>{
  for(const i of [0,4]){
   const saleId=id(`sale${i}`);
   const c=await L.db();let payment;try{payment=(await c.query(`select p.id,exists(select 1 from sale_payment_reversals r where r.agency_id=p.agency_id and r.original_payment_id=p.id) reversed
     from sale_payment_requests q join payments p on p.agency_id=q.agency_id and p.id=q.payment_id
     where q.agency_id=$1 and q.sale_id=$2 and q.idempotency_key=$3`,[state.agencyId,saleId,`SEED-reverse-${i}`])).rows[0];}finally{await c.end();}
   if(!payment)payment=await post(`/sales/${saleId}/payments`,{amount:100,idempotency_key:`SEED-reverse-${i}`,method:'PIX',paid_at:`${today}T12:00:00Z`,reference:`SEED-reverse-${i}`});
   const paymentId=payment.paymentId||payment.id;
   if(!payment.reversed)await post(`/sales/${saleId}/payments/${paymentId}/reverse`,{reason:'SEED-Recebimento duplicado ficticio'});
  }
 });
 await step('folha gerada e paga',async()=>{
  const employeeId=id('employee2');
  let payroll=L.arrays(await get('/payroll-entries')).find(p=>p.employeeId===employeeId&&String(p.competence).startsWith('2026-10'));
  if(!payroll)payroll=(await post('/payroll-entries/generate',{employeeId,competence:'2026-10-01',benefits:100,notes:'SEED-Folha'})).payrollEntry;
  if(payroll.status==='OPEN')await L.http('PATCH',`/payroll-entries/${payroll.id}/approve`,{},token);
  let payableId=payroll.payableId;
  if(payroll.status!=='PAID'&&!payableId)payableId=(await post(`/payroll-entries/${payroll.id}/pay`)).payableId;
  if(payableId){
   const ref='SEED-Pagamento folha';
   let payment=L.arrays(await get('/financial/payments')).find(p=>p.reference===ref);
   if(!payment)payment=(await post('/financial/payments',{direction:'OUT',amount:Number(payroll.netAmount),occurredAt:today,method:'PIX',reference:ref})).payment;
   if(!L.arrays(await get(`/financial/payments/${payment.id}/allocations`)).length)await post(`/financial/payments/${payment.id}/allocations`,{allocations:[{payableId,amount:Number(payroll.netAmount)}]});
  }
 });
 await step('dashboard configurado',async()=>{
  const config=await get('/settings/dashboard');state.dashboardConfig=config;
  const widgets=config.widgets.map(w=>({key:w.key,enabled:true})).reverse();
  if(widgets.length&&!state.steps['dashboard configurado']?.ok)await put('/settings/dashboard',{version:config.version,widgets});
 });
 await step('backup criptografado e verificacao',async()=>{
  if(L.fs.existsSync(L.path.join(L.OUT,'backup-verificacao.json'))&&!process.argv.includes('--refresh-backup'))return;
  const currentPassword=users.users.find(u=>u.role==='OWNER').password;
  const backupPath=L.path.join(L.TMP,'full-teste-backup.encrypted.json');
  let envelope;
  if(L.fs.existsSync(backupPath)&&!process.argv.includes('--refresh-backup'))envelope=L.read(backupPath);
  else{const exported=await post('/settings/backup/export',{currentPassword,archivePassword:users.archivePassword});envelope=exported.envelope||exported;}
  L.save(L.path.join(L.TMP,'full-teste-backup.encrypted.json'),envelope);
  const verified=await post('/settings/backup/verify',{currentPassword,archivePassword:users.archivePassword,envelope});
  L.save(L.path.join(L.OUT,'backup-verificacao.json'),verified);
 });
 checkpoint();
};
