'use strict';
const L=require('./full-teste-lib.cjs');
const coverage=require('./cobertura-full-teste.cjs');
(async()=>{
 const conf=L.credentials(),token=await L.login(conf.owner,conf.password,conf.slug);
 const state=L.read(L.path.join(L.TMP,'full-teste-seed-state.json'));
 const users=L.read(L.path.join(L.TMP,'full-teste-usuarios.json'));
 const rows=[];
 for(const [area,route,endpoint,key] of coverage){
  try{const data=(await L.http('GET',endpoint,undefined,token)).data;const count=key&&Array.isArray(data[key])?data[key].length:null;rows.push({area,route,endpoint,count,status:key?(count>0?'COM DADOS':'VAZIO OU CONTRATO DIVERGENTE'):'INDICADORES/CONFIGURACAO',keys:Object.keys(data)});}
  catch(e){rows.push({area,route,endpoint,count:null,status:e.message.replaceAll('|','/'),keys:[]});}
 }
 const c=await L.db();const inventories={};
 try{
  for(const [table,column] of [['sales','status'],['commission_entries','status'],['agency_revenue_entries','status'],['payroll_entries','status'],['suppliers',null],['travel_products',null],['sale_payment_reversals',null],['sale_import_batches',null],['customers',null],['employee_commission_rule_versions',null],['commission_rule_versions',null]]){
   if(!(await c.query('select to_regclass($1) t',[table])).rows[0].t)continue;
   const query=column?`select ${column} status,count(*)::int n from ${table} where agency_id=$1 group by ${column} order by ${column}`:`select count(*)::int n from ${table} where agency_id=$1`;
   inventories[table]=(await c.query(query,[state.agencyId])).rows;
  }
 }finally{await c.end();}
 L.save(L.path.join(L.OUT,'cobertura-contagens.json'),rows);
 L.save(L.path.join(L.OUT,'inventario-dados.json'),inventories);
 let md='# Cobertura de dados Full — teste local\n\n';
 md+=`Verificado em ${new Date().toISOString()}. Destinos: API 4100, app 5183, PostgreSQL 55644, banco travel_platform_teste. Agencia alpha-viagens. Dados SEED ficticios.\n\n`;
 md+='| Area/tela | Rota no app | Quantidade | Como ver (API autenticada) | Observacao |\n|---|---|---:|---|---|\n';
 for(const r of rows)md+=`| ${r.area} | ${r.route} | ${r.count??'n/a'} | GET ${r.endpoint} | ${r.status} |\n`;
 const source=L.fs.readFileSync(L.path.join(L.ROOT,'apps/agency/src/App.tsx'),'utf8');
 const routes=[...source.matchAll(/<Route path="([^"]+)"/g)].map(m=>'/'+m[1]);
 const mapped=new Set(coverage.map(r=>r[1].split('?')[0]));
 md+='\nRotas adicionais do App (formularios, detalhes e acesso):\n\n';
 for(const route of routes.filter(r=>!mapped.has(r)))md+=`- \`${route}\`: ${route.includes(':')?'detalhe de registro SEED; verificacao em telas-resultado.json':/login|signup|password|onboarding|\*/.test(route)?'acesso/onboarding/fallback; nao representa cadastro a preencher':'formulario; sem lista propria'}.\n`;
 md+='\nUsuarios de teste (senhas somente em `.tmp/full-teste-usuarios.json`, arquivo ignorado pelo git):\n\n| Papel | Email | Agencia |\n|---|---|---|\n';
 for(const u of users.users)md+=`| ${u.role} | ${u.email} | alpha-viagens |\n`;
 if(users.agencyB?.slug)md+=`| OWNER | ${users.agencyB.email} | ${users.agencyB.slug} |\n`;
 md+='\nInventario por status:\n\n```json\n'+JSON.stringify(inventories,null,2)+'\n```\n';
 md+='\nEtapas de seed ainda abertas:\n\n';
 for(const [name,s] of Object.entries(state.steps).filter(([,s])=>!s.ok))md+=`- ${name}: ${s.error}\n`;
 md+='\nArquivos de prova: `seed-resultado.json`, `e2e-resultado.json`, `telas-resultado.json`, `inventario-dados.json`, `backup-verificacao.json` e capturas em `telas/`. Contagem de cadastro e renderizacao sem erro nao provam as transicoes financeiras; estas possuem asserts proprios no E2E.\n';
 md+='\nSQL restrito a provisionamento sem rota de agencia: habilitar CAMPAIGNS/PESCADOR/CREATIVE_STUDIO no tenant ficticio, marcar a viagem historica SEED como COMPLETED (nao existe rota de status) e datar a competencia historica do direito SEED para testar janelas encerradas. Nenhum status financeiro e inserido manualmente. Nenhum restore e executado.\n';
 L.fs.writeFileSync(L.path.join(L.OUT,'COBERTURA-DADOS-FULL-TESTE.md'),md);
 console.log('Matriz gerada:',rows.length,'areas;',rows.filter(r=>r.count===0).length,'colecoes vazias');
})().catch(e=>{console.error(e.message);process.exitCode=1});
