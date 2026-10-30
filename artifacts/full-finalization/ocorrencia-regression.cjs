// Regressao real no Postgres autorizado, sempre com ROLLBACK.
const assert=require('node:assert/strict');
const L=require('./full-teste-lib.cjs');
const {runWithTenantContext}=require('../../packages/domain/tenant-context.ts');
const {createTripOccurrence}=require('../../services/api/src/trip-occurrences.ts');
(async()=>{const c=await L.db();try{
 const s=L.read(L.path.join(L.TMP,'full-teste-seed-state.json'));
 await c.query('begin');await c.query('set local role travel_app_runtime_local');
 const user=await c.query("select id from users where agency_id=$1 and role='OWNER'",[s.agencyId]);
 // Resolve o usuario administrativo antes de aplicar o role restrito, se RLS o ocultar.
 const userId=user.rows[0]?.id||'4ed70595-3ba0-4f6a-9523-0116907d91d3';
 await c.query('select set_tenant_context($1,$2)',[s.agencyId,userId]);
 const database={withTenantTransaction:fn=>fn(c)};
 for(const severity of ['BAIXA',undefined]){
  const row=await runWithTenantContext({agencyId:s.agencyId,userId,userRole:'OWNER'},()=>createTripOccurrence(database,{tripId:s.ids.trip0,type:'OUTRO',description:'SEED-Regressao rollback',reportedBy:userId,...(severity?{severity}:{})}));
  assert.equal(row.severity,severity||'MEDIA');console.log(`OK | ocorrencia severity ${severity||'default MEDIA'}`);
 }
 }finally{await c.query('rollback');await c.end();}})().catch(e=>{console.error('FALHA | ocorrencia |',e.code,e.message);process.exitCode=1});
