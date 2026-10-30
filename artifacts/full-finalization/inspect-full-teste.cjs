const L = require('./full-teste-lib.cjs');
(async()=>{
 const c=await L.db();
 try {
  if(process.argv[2]==='db') {
   const names=process.argv.slice(3);
   for(const name of names) {
    console.log(name, (await c.query('select column_name,data_type,column_default,is_nullable from information_schema.columns where table_schema=$1 and table_name=$2 order by ordinal_position',['public',name])).rows);
    console.log('constraints',(await c.query('select pg_get_constraintdef(oid) def from pg_constraint where conrelid=to_regclass($1)',[name])).rows);
   }
  } else {
   const conf=L.credentials(); console.log('credential keys',Object.keys(conf));
   const token=await L.login('joao@alpha.test',conf.password);
   for(const route of process.argv.slice(2)) {
    try{const r=await L.http('GET',route,undefined,token); console.log(route,JSON.stringify(r.data).slice(0,1700));}catch(e){console.log(e.message);}
   }
  }
 }finally{await c.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
