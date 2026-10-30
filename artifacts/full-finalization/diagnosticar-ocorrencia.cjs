const L=require('./full-teste-lib.cjs');
(async()=>{const c=await L.db();try{
 const s=L.read(L.path.join(L.TMP,'full-teste-seed-state.json'));
 await c.query('begin');await c.query('set local role travel_app_runtime_local');
 await c.query('select set_tenant_context($1,$2)',[s.agencyId,'SEED-Diagnostico']);
 const user=await c.query("select id from users where agency_id=$1 and role='OWNER'",[s.agencyId]);
 try{await c.query("insert into trip_occurrences (agency_id,trip_id,type,description,severity,reported_by) values ($1,$2,$3,$4,coalesce($5,'MEDIA'),$6)",[s.agencyId,s.ids.trip0,'OUTRO','SEED-Diagnostico','BAIXA',user.rows[0].id]);console.log('SQL OK');}catch(e){console.log('SQL FALHA',e.code,e.message);}
 }finally{await c.query('rollback');await c.end();}})().catch(e=>{console.error(e.message);process.exitCode=1});
