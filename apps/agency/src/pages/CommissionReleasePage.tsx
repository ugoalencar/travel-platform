import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { LoadingState } from '../components/ui/loading-state';
import {
  ApiError,
  createCommissionFinancialProfile,
  getCommissionReleaseConfig,
  setReceiptRule,
  type CommissionReleaseConfig,
} from '../lib/api';

const MISSING_LABEL: Record<string, string> = {
  PAYMENT_METHOD_RECEIPT_RULE_UNSET: 'Defina, para cada forma de pagamento, se a venda exige o valor recebido.',
  FINANCIAL_PROFILE_NOT_ACTIVE: 'Cadastre o perfil financeiro da agência com vigência já iniciada.',
};

const EFFECT_LABEL = {
  META_E_LIBERACAO: 'Recebimento conta para a meta e para a liberação',
  SOMENTE_LIBERACAO: 'Recebimento conta só para a liberação',
} as const;

export function CommissionReleasePage({ section = 'all' }: { section?: 'all' | 'methods' | 'profile' } = {}) {
  const [config, setConfig] = useState<CommissionReleaseConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState('');
  const [requiresReceipt, setRequiresReceipt] = useState('true');
  const [effect, setEffect] = useState<'META_E_LIBERACAO' | 'SOMENTE_LIBERACAO'>('SOMENTE_LIBERACAO');
  const [effectiveFrom, setEffectiveFrom] = useState('');

  const load = useCallback(() => {
    getCommissionReleaseConfig()
      .then(setConfig)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar a política.'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    }
  }

  function submitRule(event: FormEvent) {
    event.preventDefault();
    void run(() => setReceiptRule(method.trim(), requiresReceipt === 'true'));
  }

  function submitProfile(event: FormEvent) {
    event.preventDefault();
    void run(() => createCommissionFinancialProfile({ effect, effectiveFrom }));
  }

  if (config === null && error === null) return <LoadingState label="Carregando política…" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={section === 'methods' ? 'Formas de pagamento' : 'Liberação de comissões'}
        description="A forma de pagamento define se a venda exige o valor recebido; o perfil financeiro define como isso afeta a liberação."
        breadcrumbs={[{ label: 'Pessoal' }, { label: 'Liberação de comissões' }]}
      />
      {error !== null && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {config?.blocked === true && (
        <Card>
          <CardHeader><CardTitle>Configuração ausente: liberação bloqueada</CardTitle></CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {config.missing.map((item) => <li key={item}>{MISSING_LABEL[item] ?? item}</li>)}
            </ul>
            <p className="mt-2 text-sm text-slate-600">Enquanto isso, comissões novas não geram contas a pagar nem entram na folha.</p>
          </CardContent>
        </Card>
      )}
      {section !== 'profile' && <Card>
        <CardHeader><CardTitle>Formas de pagamento</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-1 text-sm">
            {(config?.receiptRules ?? []).map((rule) => (
              <li key={rule.method}>{rule.method}: {rule.requiresReceipt ? 'exige recebimento' : 'não exige recebimento'}</li>
            ))}
          </ul>
          <form onSubmit={submitRule} className="grid gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="cp-method" className="text-xs font-medium text-slate-700">Forma de pagamento</label>
              <Input id="cp-method" value={method} onChange={(e) => setMethod(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="cp-requires" className="text-xs font-medium text-slate-700">Exige recebimento?</label>
              <Select id="cp-requires" value={requiresReceipt} onChange={(e) => setRequiresReceipt(e.target.value)}>
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </Select>
            </div>
            <div className="flex items-end"><Button type="submit">Salvar regra</Button></div>
          </form>
        </CardContent>
      </Card>}
      {section !== 'methods' && <Card>
        <CardHeader><CardTitle>Perfil financeiro da agência</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-1 text-sm">
            {(config?.profiles ?? []).map((profile) => (
              <li key={profile.id}>{profile.effectiveFrom} · {EFFECT_LABEL[profile.effect]}{profile.active ? ' · em vigor' : ''}</li>
            ))}
          </ul>
          <form onSubmit={submitProfile} className="grid gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="cp-effect" className="text-xs font-medium text-slate-700">Efeito</label>
              <Select id="cp-effect" value={effect} onChange={(e) => setEffect(e.target.value as typeof effect)}>
                <option value="SOMENTE_LIBERACAO">{EFFECT_LABEL.SOMENTE_LIBERACAO}</option>
                <option value="META_E_LIBERACAO">{EFFECT_LABEL.META_E_LIBERACAO}</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="cp-from" className="text-xs font-medium text-slate-700">Vigência a partir de</label>
              <Input id="cp-from" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </div>
            <div className="flex items-end"><Button type="submit">Criar perfil</Button></div>
          </form>
        </CardContent>
      </Card>}
    </div>
  );
}
