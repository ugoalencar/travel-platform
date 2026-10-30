import {useEffect,useState,type ReactNode} from 'react';
import {api,type DashboardSummary} from '../lib/api';
import {Card,CardContent,CardHeader,CardTitle} from './ui/card';
import {LoadingState} from './ui/loading-state';
import {formatBRL} from '../lib/formatCurrency';

interface Widget {key:string;title:string;data:Record<string,unknown>}
const object=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const amount=(value:unknown)=>typeof value==='number'||typeof value==='string'?formatBRL(Number(value)):'—';
const monthLabel=(value:unknown)=>typeof value==='string'?value:value instanceof Date?value.toISOString().slice(0,7):'sem data';

function widgetRows(widget:Widget):Array<[string,string]> {
  const d=widget.data;
  switch(widget.key) {
    case 'financial_overview': return [['Saldo previsto',amount(object(d.projected).balance)],['Entradas realizadas',amount(object(d.realized).paymentsIn)],['Saídas realizadas',amount(object(d.realized).paymentsOut)],['Saldo realizado',amount(object(d.realized).balance)]];
    case 'receivables_projection': return [['Atrasado',amount(object(d.late).openBalance)],['Total em aberto',amount(d.totalOpen)]];
    case 'revenue_forecast': return [['Contratada',amount(object(d.contracted).total)],['Projetada',amount(object(d.projected).total)],['Sem data',amount(object(d.undefined).total)]];
    case 'commissions_projection': return [['Prevista',amount(d.forecast)],['Liberada',amount(d.released)],['Paga',amount(d.paid)],['Liberada e não paga',amount(d.releasedNotPaid)],...((Array.isArray(d.releasedNotPaidByExpectedPayMonth)?d.releasedNotPaidByExpectedPayMonth:[]).map((raw:unknown)=>{const row=object(raw);return [`Previsão ${monthLabel(row.month)}`,amount(row.amount)] as [string,string];}))];
    case 'supplier_balances': return [];
    default:return [];
  }
}

/** The response is already ordered and permission-filtered by the server. No client catalog restores omitted widgets. */
export function DashboardWidgets({commercial}:{commercial:(summary:DashboardSummary)=>ReactNode}) {
  const [widgets,setWidgets]=useState<Widget[]|null>(null);
  const [error,setError]=useState<string|null>(null);
  useEffect(()=>{
    let active=true;
    api.get<{widgets:Widget[]}>('/dashboard/widgets').then(({data})=>{if(active)setWidgets(data.widgets);}).catch((e:unknown)=>{if(active)setError(e instanceof Error?e.message:'Não foi possível carregar o painel.');});
    return ()=>{active=false;};
  },[]);
  if(error) return <p role="alert">{error}</p>;
  if(!widgets) return <LoadingState label="Carregando resumo da agência…"/>;
  return <div className="space-y-6">{!widgets.length&&<p>Nenhum widget habilitado para este usuário.</p>}{widgets.map(w=>{
    const unavailable=w.data?.unavailable;
    if(w.key==='commercial_overview'&&!unavailable) return <section key={w.key} aria-label={w.title}>{commercial(w.data as unknown as DashboardSummary)}</section>;
    return <Card key={w.key}><CardHeader><CardTitle>{w.title}</CardTitle></CardHeader><CardContent>
      {unavailable?<p>Refine os filtros nas projeções para consultar este volume de dados.</p>:w.key==='supplier_balances'?<>
        {Array.isArray(w.data)&&w.data.length===0&&<p>Nenhum saldo com fornecedores.</p>}
        {Array.isArray(w.data)&&w.data.map((raw:unknown,index:number)=>{const row=object(raw);const supplier=typeof row.supplierId==='string'?row.supplierId:null;return <p className="py-1" key={supplier??index}>{supplier??'Sem fornecedor'}: volume {amount(row.volumeSold)} · receita esperada {amount(row.expected)} · recebida {amount(row.received)} · em aberto {amount(row.difference)} · comissões pagas {amount(row.employeeCommissionsPaid)} · resultado {amount(row.result)}</p>;})}
      </>:<dl>{widgetRows(w).map(([label,value])=><div className="flex justify-between gap-4 py-1" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
    </CardContent></Card>;
  })}</div>;
}
