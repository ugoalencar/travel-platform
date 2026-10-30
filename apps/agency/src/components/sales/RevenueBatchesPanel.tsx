import {useCallback,useEffect,useState} from 'react';
import {Card,CardContent,CardHeader,CardTitle} from '../ui/card';
import {api} from '../../lib/api';
import {formatBRL} from '../../lib/formatCurrency';

interface Policy {settlementMode:'PER_SALE'|'BATCH_WINDOW';closingDay:number|null;paymentDays:number|null}
interface Batch {id:string;month:string;expected_payment_date:string;amount:number;count:number;received_at:string|null}

export function RevenueBatchesPanel() {
  const [policy,setPolicy]=useState<Policy|null>(null);
  const [batches,setBatches]=useState<Batch[]>([]);
  const [month,setMonth]=useState('');
  const [reference,setReference]=useState('');
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const load=useCallback(async()=>{
    const [p,b]=await Promise.all([api.get<Policy>('/agency-revenue/settlement-policy'),api.get<{batches:Batch[]}>('/agency-revenue/batches')]);
    setPolicy(p.data);setBatches(b.data.batches);
  },[]);
  useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:'Falha ao carregar lotes'));},[load]);
  async function act(operation:()=>Promise<unknown>,message:string) {
    setBusy(true);setError(null);setNotice('');
    try {await operation();await load();setNotice(message);}
    catch(e) {setError(e instanceof Error?e.message:'Não foi possível concluir a operação');}
    finally {setBusy(false);}
  }
  return <Card><CardHeader><CardTitle>Lotes de receita</CardTitle></CardHeader><CardContent className="space-y-4">
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {policy&&<>
      <div className="flex flex-wrap items-end gap-3">
        <label>Recebimento<select className="block rounded border p-2" value={policy.settlementMode} onChange={e=>setPolicy({...policy,settlementMode:e.target.value as Policy['settlementMode']})}><option value="PER_SALE">Por venda</option><option value="BATCH_WINDOW">Lotes por janela mensal</option></select></label>
        {policy.settlementMode==='BATCH_WINDOW'&&<>
          <label>Dia de fechamento<input className="block w-28 rounded border p-2" type="number" min="1" max="31" value={policy.closingDay??''} onChange={e=>setPolicy({...policy,closingDay:e.target.value===''?null:Number(e.target.value)})}/></label>
          <label>Dias até pagamento<input className="block w-28 rounded border p-2" type="number" min="0" max="365" value={policy.paymentDays??''} onChange={e=>setPolicy({...policy,paymentDays:e.target.value===''?null:Number(e.target.value)})}/></label>
        </>}
        <button className="rounded border px-3 py-2" disabled={busy} onClick={()=>void act(()=>api.put('/agency-revenue/settlement-policy',{...policy}),'Política salva.')}>Salvar política de recebimento</button>
      </div>
      <p className="text-sm text-slate-500">Janela: após o fechamento anterior até o dia de fechamento, inclusive. Dias 29–31 usam o último dia disponível do mês. Feche após o término desse dia.</p>
      <div className="flex flex-wrap items-end gap-3"><label>Mês da janela<input className="block rounded border p-2" type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><button className="rounded border px-3 py-2" disabled={busy||!month||policy.settlementMode!=='BATCH_WINDOW'} onClick={()=>void act(()=>api.post('/agency-revenue/batches/close',{month}),'Lote fechado.')}>Fechar lote</button></div>
      <label className="block">Referência do recebimento do lote<input className="block w-full rounded border p-2" maxLength={200} value={reference} onChange={e=>setReference(e.target.value)}/></label>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Janela</th><th>Pagamento previsto</th><th>Entradas</th><th>Valor</th><th>Recebimento</th></tr></thead><tbody>{batches.map(b=><tr key={b.id} className="border-t"><td>{b.month}</td><td>{b.expected_payment_date}</td><td>{b.count}</td><td>{formatBRL(b.amount)}</td><td>{b.received_at?'Recebido':<button className="my-2 rounded border p-2" disabled={busy} onClick={()=>void act(()=>api.post(`/agency-revenue/batches/${encodeURIComponent(b.id)}/receive`,{reference}),'Recebimento registrado.')}>Registrar recebimento do lote {b.month}</button>}</td></tr>)}</tbody></table></div>
      {!batches.length&&<p>Nenhum lote fechado.</p>}
    </>}
  </CardContent></Card>;
}
