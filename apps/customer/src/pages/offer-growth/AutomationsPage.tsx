import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '../../lib/api';
import {
  activateAutomation,
  listAutomations,
  createAutomation,
  listCoupons,
  pauseAutomation,
} from '../../lib/offerGrowthApi';
import type { Automation, AutomationAction, AutomationTrigger, Coupon } from '../../types/offerGrowth';
import {
  AUTOMATION_STATUS_LABELS,
  AUTOMATION_TRIGGER_LABELS,
  isTestChannel,
  labelFor,
} from '../../lib/offerGrowthLabels';
import { EntitlementNotice, TestChannelBadge } from '../../components/offer-growth/EntitlementNotice';
import { Button } from '../../components/ui/button';

type LoadState =
  | { status: 'loading' }
  | { status: 'entitlement-disabled' }
  | { status: 'error'; message: string }
  | { status: 'ready'; automations: Automation[]; coupons: Coupon[] };

type CouponMode = 'none' | 'existing' | 'new';

export function AutomationsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<AutomationTrigger>('COMMENT_KEYWORD');
  const [channel, setChannel] = useState('INTERNAL_TEST_INSTAGRAM');
  const [keyword, setKeyword] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [publicReply, setPublicReply] = useState('');
  const [privateMessage, setPrivateMessage] = useState('');
  const [couponMode, setCouponMode] = useState<CouponMode>('none');
  const [existingCouponId, setExistingCouponId] = useState('');
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponName, setNewCouponName] = useState('');
  const [newCouponValue, setNewCouponValue] = useState('');
  const [createOpportunity, setCreateOpportunity] = useState(false);
  const [cooldownMode, setCooldownMode] = useState<'none' | 'minutes'>('none');
  const [cooldownMinutes, setCooldownMinutes] = useState('5');

  function load() {
    setState({ status: 'loading' });
    Promise.all([listAutomations(), listCoupons().catch(() => [])])
      .then(([automations, coupons]) => setState({ status: 'ready', automations, coupons }))
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 403) {
          setState({ status: 'entitlement-disabled' });
          return;
        }
        setState({ status: 'error', message: 'Não foi possível carregar as automações.' });
      });
  }

  useEffect(load, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!name.trim()) {
      setFormError('Nome é obrigatório.');
      return;
    }
    if (!keyword.trim()) {
      setFormError('Palavra-chave é obrigatória para este tipo de gatilho.');
      return;
    }

    const actions: AutomationAction[] = [];
    if (publicReply.trim()) actions.push({ type: 'PUBLIC_REPLY', message: publicReply.trim() });
    if (privateMessage.trim()) actions.push({ type: 'PRIVATE_MESSAGE', message: privateMessage.trim() });

    if (couponMode === 'new') {
      if (!newCouponName.trim()) {
        setFormError('Nome do cupom é obrigatório.');
        return;
      }
      actions.push({
        type: 'CREATE_COUPON',
        couponTemplate: {
          name: newCouponName.trim(),
          type: 'FIXED_AMOUNT',
          ...(newCouponValue ? { value: Number(newCouponValue) } : {}),
        },
      });
      actions.push({ type: 'SEND_COUPON', deliveryChannel: channel });
    } else if (couponMode === 'existing') {
      if (!existingCouponId) {
        setFormError('Selecione um cupom existente.');
        return;
      }
      actions.push({ type: 'SEND_COUPON', couponId: existingCouponId, deliveryChannel: channel });
    }

    if (createOpportunity) actions.push({ type: 'CREATE_OPPORTUNITY' });

    if (actions.length === 0) {
      setFormError('Configure ao menos uma ação (resposta, mensagem, cupom ou oportunidade).');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      await createAutomation({
        name: name.trim(),
        trigger,
        channel,
        keyword: keyword.trim(),
        caseSensitive,
        cooldownSeconds: cooldownMode === 'minutes' ? Number(cooldownMinutes) * 60 : 0,
        actions,
      });
      setShowForm(false);
      resetForm();
      load();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Não foi possível criar a automação.');
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setName('');
    setKeyword('');
    setCaseSensitive(false);
    setPublicReply('');
    setPrivateMessage('');
    setCouponMode('none');
    setExistingCouponId('');
    setNewCouponCode('');
    setNewCouponName('');
    setNewCouponValue('');
    setCreateOpportunity(false);
    setCooldownMode('none');
    void newCouponCode;
  }

  async function toggleStatus(automation: Automation) {
    if (automation.status === 'ACTIVE') {
      await pauseAutomation(automation.id);
    } else {
      await activateAutomation(automation.id);
    }
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Offer & Growth</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Automações</h1>
          <p className="mt-1 text-sm text-slate-500">
            Configure uma resposta automática a comentários ou mensagens diretas — ex.: "Comente
            CANCUN e receba um cupom".
          </p>
        </div>
        {state.status === 'ready' && (
          <Button onClick={() => setShowForm((value) => !value)}>
            {showForm ? 'Fechar' : 'Nova automação'}
          </Button>
        )}
      </div>

      {state.status === 'loading' && <p className="text-sm text-slate-500">Carregando automações...</p>}
      {state.status === 'entitlement-disabled' && <EntitlementNotice feature="SOCIAL_AUTOMATION" />}
      {state.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === 'ready' && showForm && (
        <form
          onSubmit={(event) => void handleCreate(event)}
          noValidate
          className="flex max-w-xl flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4"
        >
          {formError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="automation-name" className="text-sm font-medium text-slate-700">
              Nome
            </label>
            <input
              id="automation-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Comente CANCUN"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="automation-trigger" className="text-sm font-medium text-slate-700">
              Quando (gatilho)
            </label>
            <select
              id="automation-trigger"
              value={trigger}
              onChange={(event) => setTrigger(event.target.value as AutomationTrigger)}
              className="h-9 rounded-md border border-slate-300 px-3 text-sm"
            >
              <option value="COMMENT_KEYWORD">{AUTOMATION_TRIGGER_LABELS.COMMENT_KEYWORD}</option>
              <option value="DIRECT_MESSAGE_KEYWORD">
                {AUTOMATION_TRIGGER_LABELS.DIRECT_MESSAGE_KEYWORD}
              </option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="automation-channel" className="text-sm font-medium text-slate-700">
              Canal
            </label>
            <select
              id="automation-channel"
              value={channel}
              onChange={(event) => setChannel(event.target.value)}
              className="h-9 rounded-md border border-slate-300 px-3 text-sm"
            >
              <option value="INTERNAL_TEST_INSTAGRAM">Instagram (canal de teste/demo interno)</option>
            </select>
            {isTestChannel(channel) && <TestChannelBadge />}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="automation-keyword" className="text-sm font-medium text-slate-700">
              Palavra-chave
            </label>
            <input
              id="automation-keyword"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="CANCUN"
            />
            <label className="mt-1 flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(event) => setCaseSensitive(event.target.checked)}
              />
              Diferenciar maiúsculas/minúsculas
            </label>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="automation-public-reply" className="text-sm font-medium text-slate-700">
              Resposta pública
            </label>
            <textarea
              id="automation-public-reply"
              value={publicReply}
              onChange={(event) => setPublicReply(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              rows={2}
              placeholder="Enviamos os detalhes no privado!"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="automation-private-message" className="text-sm font-medium text-slate-700">
              Mensagem privada
            </label>
            <textarea
              id="automation-private-message"
              value={privateMessage}
              onChange={(event) => setPrivateMessage(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              rows={2}
              placeholder="Use o cupom CANCUN300 para falar com um consultor."
            />
          </div>

          <fieldset className="flex flex-col gap-2 rounded-md border border-slate-200 p-3">
            <legend className="px-1 text-sm font-medium text-slate-700">Cupom</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="couponMode"
                checked={couponMode === 'none'}
                onChange={() => setCouponMode('none')}
              />
              Nenhum
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="couponMode"
                checked={couponMode === 'existing'}
                onChange={() => setCouponMode('existing')}
              />
              Usar cupom existente
            </label>
            {couponMode === 'existing' && (
              <select
                aria-label="Cupom existente"
                value={existingCouponId}
                onChange={(event) => setExistingCouponId(event.target.value)}
                className="ml-6 h-9 rounded-md border border-slate-300 px-3 text-sm"
              >
                <option value="">Selecione</option>
                {state.coupons.map((coupon) => (
                  <option key={coupon.id} value={coupon.id}>
                    {coupon.code} — {coupon.name}
                  </option>
                ))}
              </select>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="couponMode"
                checked={couponMode === 'new'}
                onChange={() => setCouponMode('new')}
              />
              Criar um novo cupom automaticamente
            </label>
            {couponMode === 'new' && (
              <div className="ml-6 flex flex-col gap-2">
                <input
                  aria-label="Nome do novo cupom"
                  placeholder="Nome do cupom"
                  value={newCouponName}
                  onChange={(event) => setNewCouponName(event.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  aria-label="Valor do novo cupom"
                  type="number"
                  min="0"
                  placeholder="Valor (R$)"
                  value={newCouponValue}
                  onChange={(event) => setNewCouponValue(event.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            )}
          </fieldset>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={createOpportunity}
              onChange={(event) => setCreateOpportunity(event.target.checked)}
            />
            Criar oportunidade comercial automaticamente
          </label>

          <fieldset className="flex flex-col gap-2 rounded-md border border-slate-200 p-3">
            <legend className="px-1 text-sm font-medium text-slate-700">Cooldown</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="cooldownMode"
                checked={cooldownMode === 'none'}
                onChange={() => setCooldownMode('none')}
              />
              Sem espera
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="cooldownMode"
                checked={cooldownMode === 'minutes'}
                onChange={() => setCooldownMode('minutes')}
              />
              Esperar
              <input
                aria-label="Minutos de cooldown"
                type="number"
                min="1"
                value={cooldownMinutes}
                onChange={(event) => setCooldownMinutes(event.target.value)}
                disabled={cooldownMode !== 'minutes'}
                className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
              minutos entre respostas para o mesmo usuário
            </label>
          </fieldset>

          <Button type="submit" disabled={submitting}>
            {submitting ? 'Salvando...' : 'Criar automação'}
          </Button>
        </form>
      )}

      {state.status === 'ready' && (
        <div className="flex flex-col gap-3">
          {state.automations.length === 0 && (
            <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">
              Nenhuma automação criada ainda.
            </div>
          )}
          {state.automations.map((automation) => (
            <article key={automation.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{automation.name}</h2>
                  <p className="text-xs text-slate-500">
                    {labelFor(AUTOMATION_TRIGGER_LABELS, automation.trigger)}
                    {automation.keyword ? ` · "${automation.keyword}"` : ''}
                    {automation.channel && isTestChannel(automation.channel) ? ' ' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {automation.channel && isTestChannel(automation.channel) && <TestChannelBadge />}
                  <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {labelFor(AUTOMATION_STATUS_LABELS, automation.status)}
                  </span>
                  {(automation.status === 'ACTIVE' || automation.status === 'DRAFT' || automation.status === 'PAUSED') && (
                    <Button size="sm" onClick={() => void toggleStatus(automation)}>
                      {automation.status === 'ACTIVE' ? 'Pausar' : 'Ativar'}
                    </Button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
