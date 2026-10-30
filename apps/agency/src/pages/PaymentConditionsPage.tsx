import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { LoadingState } from '../components/ui/loading-state';
import { createPaymentCondition, deactivatePaymentCondition, listAllPaymentConditions, revisePaymentCondition } from '../lib/api';
import type { PaymentCondition } from '../lib/paymentSchedule';

type Draft = Omit<PaymentCondition, 'id' | 'version'>;
const blank: Draft = { name:'',scheduleKind:'SINGLE',maxInstallments:1,minInstallmentAmount:null,interestFree:true,
  downPaymentMode:'NONE',downPaymentValue:0,downPaymentRequired:false,balanceDeadlineAnchor:'SALE_DATE',
  balanceDeadlineOffsetDays:0,allowsPartialPayments:true,paymentMethods:[],categoryIds:[],productIds:[] };

export function PaymentConditionsPage() {
  const [rows,setRows]=useState<PaymentCondition[]>([]); const [draft,setDraft]=useState<Draft>(blank);
  const [editing,setEditing]=useState<PaymentCondition|null>(null); const [busy,setBusy]=useState(true); const [error,setError]=useState('');
  const load=useCallback(async()=>{setBusy(true);try{setRows(await listAllPaymentConditions());}catch(e){setError(e instanceof Error?e.message:'Falha ao carregar condições.');}finally{setBusy(false);}},[]);
  useEffect(()=>{void load();},[load]);
  const save=async(event:FormEvent)=>{event.preventDefault();setError('');try{const input=draft;
    if(editing) await revisePaymentCondition(editing.id,input); else await createPaymentCondition(input);
    setDraft(blank);setEditing(null);await load();}catch(e){setError(e instanceof Error?e.message:'Falha ao salvar condição.');}};
  const edit=(row:PaymentCondition)=>{setEditing(row);const {id,version,...rest}=row;void id;void version;setDraft(rest);};
  const deactivate=async(row:PaymentCondition)=>{try{await deactivatePaymentCondition(row.id);await load();}catch(e){setError(e instanceof Error?e.message:'Falha ao desativar condição.');}};
  const update=<K extends keyof Draft>(key:K,value:Draft[K])=>setDraft(current=>({...current,[key]:value}));
  return <div className="space-y-6"><PageHeader title="Condições de pagamento" description="Configure parcelamento e vencimentos para novas vendas." />
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    <form onSubmit={event=>{void save(event);}} className="grid gap-4 border-b pb-6 md:grid-cols-3">
      <label className="text-sm">Nome<Input required value={draft.name} onChange={e=>update('name',e.target.value)} /></label>
      <label className="text-sm">Tipo<Select value={draft.scheduleKind} onChange={e=>update('scheduleKind',e.target.value as Draft['scheduleKind'])}><option value="SINGLE">À vista</option><option value="EQUAL_INSTALLMENTS">Parcelas iguais</option><option value="DOWN_PAYMENT_PLUS_BALANCE">Entrada + saldo</option></Select></label>
      <label className="text-sm">Máximo de parcelas<Input type="number" min="1" max="999" value={draft.maxInstallments} onChange={e=>update('maxInstallments',Number(e.target.value))} /></label>
      <label className="text-sm">Parcela mínima (R$)<Input type="number" min="0" step="0.01" value={draft.minInstallmentAmount??''} onChange={e=>update('minInstallmentAmount',e.target.value===''?null:Number(e.target.value))} /></label>
      <label className="text-sm">Forma(s) de pagamento<Input required placeholder="Cartão, Pix, Boleto" value={draft.paymentMethods.join(', ')} onChange={e=>update('paymentMethods',e.target.value.split(',').map(s=>s.trim()).filter(Boolean))} /></label>
      {draft.scheduleKind==='DOWN_PAYMENT_PLUS_BALANCE'&&<>
        <label className="text-sm">Entrada<Select value={draft.downPaymentMode} onChange={e=>update('downPaymentMode',e.target.value as Draft['downPaymentMode'])}><option value="PERCENT">Percentual</option><option value="AMOUNT">Valor fixo</option></Select></label>
        <label className="text-sm">Valor da entrada<Input type="number" min="0" step="0.01" value={draft.downPaymentValue} onChange={e=>update('downPaymentValue',Number(e.target.value))} /></label>
        <label className="text-sm">Prazo do saldo baseado em<Select value={draft.balanceDeadlineAnchor} onChange={e=>update('balanceDeadlineAnchor',e.target.value as Draft['balanceDeadlineAnchor'])}><option value="SALE_DATE">Data da venda</option><option value="TRAVEL_START">Data de embarque</option></Select></label>
        <label className="text-sm">Dias após a data base (negativo = antes)<Input type="number" value={draft.balanceDeadlineOffsetDays} onChange={e=>update('balanceDeadlineOffsetDays',Number(e.target.value))} /></label>
      </>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.downPaymentRequired} disabled={draft.scheduleKind!=='DOWN_PAYMENT_PLUS_BALANCE'} onChange={e=>update('downPaymentRequired',e.target.checked)} /> Entrada obrigatória</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.allowsPartialPayments} onChange={e=>update('allowsPartialPayments',e.target.checked)} /> Aceita pagamentos parciais</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.interestFree} onChange={e=>update('interestFree',e.target.checked)} /> Sem juros</label>
      <div className="flex gap-2"><Button type="submit">{editing?'Salvar revisão':'Criar condição'}</Button>{editing&&<Button type="button" variant="outline" onClick={()=>{setEditing(null);setDraft(blank);}}>Cancelar</Button>}</div>
    </form>
    {busy?<LoadingState label="Carregando condições" />:<div className="divide-y">{rows.map(row=><div key={row.id} className="flex items-center justify-between gap-4 py-3"><div><p className="font-medium">{row.name} <span className="text-xs text-slate-500">v{row.version}{row.active===false?' · inativa':''}</span></p><p className="text-sm text-slate-600">{row.scheduleKind} · {row.paymentMethods.join(', ')} · até {row.maxInstallments} parcelas</p></div><div className="flex gap-2"><Button type="button" variant="outline" onClick={()=>edit(row)} disabled={row.active===false}>Revisar</Button>{row.active!==false&&<Button type="button" variant="outline" onClick={()=>void deactivate(row)}>Desativar</Button>}</div></div>)}</div>}
  </div>;
}
