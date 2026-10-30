import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { runWithTenantContext } from '../../packages/domain/tenant-context';
import { UserRole } from '../../packages/domain/types';
import { createTripOccurrence } from '../../services/api/src/trip-occurrences';
let client:Client;
const state=JSON.parse(readFileSync('.tmp/full-teste-seed-state.json','utf8')) as {agencyId:string;ids:Record<string,string>};
let userId:string;
beforeEach(async()=>{
 client=new Client({host:'127.0.0.1',port:55644,database:'travel_platform_teste',user:'teste_admin',password:'teste_admin_local'});
 await client.connect();
 expect((await client.query('select current_database() db')).rows[0].db).toBe('travel_platform_teste');
 userId=(await client.query("select id from users where agency_id=$1 and role='OWNER'",[state.agencyId])).rows[0].id;
 await client.query('begin');await client.query('set local role travel_app_runtime_local');
 await client.query('select set_tenant_context($1,$2)',[state.agencyId,userId]);
});
afterEach(async()=>{await client.query('rollback');await client.end();});
it.each(['BAIXA',undefined] as const)('persiste a gravidade %s no enum real sem conversao para text',async severity=>{
 const database={withTenantTransaction:async<T>(fn:(c:Client)=>Promise<T>)=>fn(client),withPlatformTransaction:async()=>{throw Error('fora do escopo');}};
 const row=await runWithTenantContext({agencyId:state.agencyId,userId,userRole:UserRole.OWNER},()=>createTripOccurrence(database,{tripId:state.ids.trip0!,type:'OUTRO',description:'SEED-Regressao rollback',reportedBy:userId,...(severity?{severity}:{})}));
 expect(row.severity).toBe(severity??'MEDIA');
 expect(row.agencyId).toBe(state.agencyId);
});
