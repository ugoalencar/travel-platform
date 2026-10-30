import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, listEmployees, type Employee } from '../lib/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';

type Mode = 'PER_ENTRY' | 'FIXED_DAY' | 'WINDOW';
interface Policy { id: string; employeeId: string | null; mode: Mode; effectiveFrom: string; day: number | null; paymentDays: number; reason: string | null }
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const modeLabel: Record<Mode, string> = { PER_ENTRY: 'Cada comissão segue sua liberação', FIXED_DAY: 'Dia fixo do mês', WINDOW: 'Dia de fechamento + prazo para pagar' };

export function CommissionPaymentPolicyTab() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [costMode, setCostMode] = useState<'WARN' | 'BLOCK'>('WARN');
  const [scope, setScope] = useState('');
  const [mode, setMode] = useState<Mode>('PER_ENTRY');
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [day, setDay] = useState('10');
  const [paymentDays, setPaymentDays] = useState('0');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [policyResult, costResult, employeeResult] = await Promise.all([
        api.get<{ policies: Policy[] }>('/commission-payment-policies'),
        api.get<{ mode: 'WARN' | 'BLOCK' }>('/commission-cost-policy'),
        listEmployees(),
      ]);
      setPolicies(policyResult.data.policies);
      setCostMode(costResult.data.mode);
      setEmployees(employeeResult);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as políticas de comissão.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null); setNotice(null);
    try {
      await api.post('/commission-payment-policies', {
        employeeId: scope || null, mode, effectiveFrom,
        day: mode === 'PER_ENTRY' ? null : Number(day),
        paymentDays: mode === 'WINDOW' ? Number(paymentDays) : 0,
        reason: reason.trim(),
      });
      setReason(''); setNotice('Nova versão da política registrada.'); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a política.'); }
    finally { setBusy(false); }
  }

  async function saveCostMode(next: 'WARN' | 'BLOCK') {
    setBusy(true); setError(null); setNotice(null);
    try { await api.put('/commission-cost-policy', { mode: next }); setCostMode(next); setNotice('Política de limite de custo atualizada.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a política.'); }
    finally { setBusy(false); }
  }

  return <div className="space-y-5">
    {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <Card>
      <CardHeader><CardTitle>Data de pagamento das comissões</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600">A regra da agência vale por padrão. Uma regra de funcionário substitui a regra geral para novas liberações. O histórico é versionado e não apaga versões anteriores.</p>
        <form onSubmit={event => { void save(event); }} className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">Aplicar a
            <Select aria-label="Aplicar a" className="mt-1 w-full" value={scope} onChange={event => setScope(event.target.value)}>
              <option value="">Toda a agência</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
            </Select>
          </label>
          <label className="text-sm">Comportamento
            <Select aria-label="Comportamento" className="mt-1 w-full" value={mode} onChange={event => setMode(event.target.value as Mode)}>
              {Object.entries(modeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </label>
          <label className="text-sm">Vigência a partir de<Input className="mt-1" type="date" value={effectiveFrom} onChange={event => setEffectiveFrom(event.target.value)} /></label>
          {mode !== 'PER_ENTRY' && <label className="text-sm">Dia do mês (1 a 31)<Input className="mt-1" type="number" min="1" max="31" value={day} onChange={event => setDay(event.target.value)} /></label>}
          {mode === 'WINDOW' && <label className="text-sm">Dias após o fechamento<Input className="mt-1" type="number" min="0" max="365" value={paymentDays} onChange={event => setPaymentDays(event.target.value)} /></label>}
          <label className="text-sm md:col-span-2">Motivo da versão<Input className="mt-1" required maxLength={300} value={reason} onChange={event => setReason(event.target.value)} /></label>
          <div className="md:col-span-2"><Button type="submit" size="sm" disabled={busy}>{busy ? 'Salvando…' : 'Registrar nova versão'}</Button></div>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm"><thead><tr><th className="p-2">Escopo</th><th className="p-2">Regra</th><th className="p-2">Início</th><th className="p-2">Motivo</th></tr></thead>
            <tbody>{policies.map(policy => <tr key={policy.id} className="border-t"><td className="p-2">{policy.employeeId ? employees.find(employee => employee.id === policy.employeeId)?.name ?? policy.employeeId : 'Agência'}</td><td className="p-2">{modeLabel[policy.mode]}{policy.day ? ` — dia ${policy.day}` : ''}{policy.mode === 'WINDOW' ? ` + ${policy.paymentDays} dia(s)` : ''}</td><td className="p-2">{policy.effectiveFrom}</td><td className="p-2">{policy.reason ?? '—'}</td></tr>)}</tbody>
          </table>
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle>Limite da comissão em relação à receita do fornecedor</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-600">Compara o custo da comissão do funcionário com a receita cadastrada para o mesmo fornecedor e venda. WARN sinaliza; BLOCK impede a geração quando o custo excede a receita esperada.</p>
        <Select aria-label="Política de limite de custo" className="max-w-sm" value={costMode} disabled={busy} onChange={event => void saveCostMode(event.target.value as 'WARN' | 'BLOCK')}>
          <option value="WARN">Avisar e permitir (padrão)</option><option value="BLOCK">Bloquear quando exceder</option>
        </Select>
      </CardContent>
    </Card>
  </div>;
}
