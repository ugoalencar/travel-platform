'use strict';
const assert=require('node:assert/strict');
const L=require('./full-teste-lib.cjs');
const tables=['customers','suppliers','travel_products','commission_categories','sales','sale_items','payment_conditions','employees','commission_plans','commission_entries','agency_revenue_entries','agency_revenue_batches','sale_import_batches','sale_import_keys','campaigns','coupons','commercial_tasks','commercial_opportunities','commercial_pipelines','media_assets','payroll_entries','sale_payment_reversals'];
async function snapshot(){const c=await L.db();try{const s=L.read(L.path.join(L.TMP,'full-teste-seed-state.json'));const out={};for(const table of tables){if(!(await c.query('select to_regclass($1) t',[table])).rows[0].t)continue;out[table]=(await c.query(`select count(*)::int n from ${table} where agency_id=$1`,[s.agencyId])).rows[0].n;}return out;}finally{await c.end();}}
(async()=>{
 const before=await snapshot();
 await require('./seed-full-teste.cjs').main();
 const after=await snapshot();
 const changed=Object.keys(before).filter(t=>before[t]!==after[t]);
 L.save(L.path.join(L.OUT,'idempotencia-seed.json'),{at:new Date().toISOString(),before,after,changed,ok:!changed.length});
 assert.deepEqual(after,before,'Seed duplicou registros ou ainda criou fixtures ausentes');
 console.log(`OK | idempotencia seed | ${Object.keys(before).length} tabelas sem aumento de registros`);
 // Preserva exit code do seed: idempotencia nao transforma etapa falha em sucesso.
})().catch(e=>{console.error('FALHA | idempotencia seed |',e.message);process.exitCode=1});
