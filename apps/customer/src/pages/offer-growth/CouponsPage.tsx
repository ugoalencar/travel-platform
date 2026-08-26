import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '../../lib/api';
import { createCoupon, listCampaigns, listCoupons, listOffers } from '../../lib/offerGrowthApi';
import type { Campaign, Coupon, CouponType } from '../../types/offerGrowth';
import type { Offer } from '../../types/offer';
import { COUPON_TYPE_LABELS, labelFor } from '../../lib/offerGrowthLabels';
import { EntitlementNotice } from '../../components/offer-growth/EntitlementNotice';
import { Button } from '../../components/ui/button';

type LoadState =
  | { status: 'loading' }
  | { status: 'entitlement-disabled' }
  | { status: 'error'; message: string }
  | { status: 'ready'; coupons: Coupon[]; campaigns: Campaign[]; offers: Offer[] };

export function CouponsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<CouponType>('FIXED_AMOUNT');
  const [value, setValue] = useState('');
  const [benefitDescription, setBenefitDescription] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [maxUsesPerCustomer, setMaxUsesPerCustomer] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [offerId, setOfferId] = useState('');

  function load() {
    setState({ status: 'loading' });
    Promise.all([listCoupons(), listCampaigns().catch(() => []), listOffers().catch(() => [])])
      .then(([coupons, campaigns, offers]) => setState({ status: 'ready', coupons, campaigns, offers }))
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 403) {
          setState({ status: 'entitlement-disabled' });
          return;
        }
        setState({ status: 'error', message: 'Não foi possível carregar os cupons.' });
      });
  }

  useEffect(load, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!code.trim() || !name.trim()) {
      setFormError('Código e nome são obrigatórios.');
      return;
    }
    if (type !== 'BENEFIT' && !value.trim()) {
      setFormError('Valor é obrigatório para este tipo de cupom.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await createCoupon({
        code: code.trim(),
        name: name.trim(),
        type,
        ...(value.trim() ? { value: Number(value) } : {}),
        ...(benefitDescription.trim() ? { benefitDescription: benefitDescription.trim() } : {}),
        ...(maxUses.trim() ? { maxUses: Number(maxUses) } : {}),
        ...(maxUsesPerCustomer.trim() ? { maxUsesPerCustomer: Number(maxUsesPerCustomer) } : {}),
        ...(campaignId ? { campaignId } : {}),
        ...(offerId ? { offerId } : {}),
      });
      setShowForm(false);
      setCode('');
      setName('');
      setValue('');
      setBenefitDescription('');
      setMaxUses('');
      setMaxUsesPerCustomer('');
      setCampaignId('');
      setOfferId('');
      load();
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.status === 409
            ? 'Já existe um cupom com este código.'
            : error.message
          : 'Não foi possível criar o cupom.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Offer & Growth</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Cupons</h1>
        </div>
        {state.status === 'ready' && (
          <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Fechar' : 'Novo cupom'}</Button>
        )}
      </div>

      {state.status === 'loading' && <p className="text-sm text-slate-500">Carregando cupons...</p>}
      {state.status === 'entitlement-disabled' && <EntitlementNotice feature="CAMPAIGNS" />}
      {state.status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {state.message}
        </div>
      )}

      {state.status === 'ready' && showForm && (
        <form
          onSubmit={(event) => void handleCreate(event)}
          noValidate
          className="flex max-w-lg flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4"
        >
          {formError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {formError}
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor="coupon-code" className="text-sm font-medium text-slate-700">
              Código
            </label>
            <input
              id="coupon-code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="CANCUN300"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="coupon-name" className="text-sm font-medium text-slate-700">
              Nome
            </label>
            <input
              id="coupon-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="coupon-type" className="text-sm font-medium text-slate-700">
              Tipo
            </label>
            <select
              id="coupon-type"
              value={type}
              onChange={(event) => setType(event.target.value as CouponType)}
              className="h-9 rounded-md border border-slate-300 px-3 text-sm"
            >
              <option value="FIXED_AMOUNT">{COUPON_TYPE_LABELS.FIXED_AMOUNT}</option>
              <option value="PERCENTAGE">{COUPON_TYPE_LABELS.PERCENTAGE}</option>
              <option value="BENEFIT">{COUPON_TYPE_LABELS.BENEFIT}</option>
            </select>
          </div>
          {type !== 'BENEFIT' ? (
            <div className="flex flex-col gap-1">
              <label htmlFor="coupon-value" className="text-sm font-medium text-slate-700">
                Valor {type === 'PERCENTAGE' ? '(%)' : '(R$)'}
              </label>
              <input
                id="coupon-value"
                type="number"
                min="0"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <label htmlFor="coupon-benefit" className="text-sm font-medium text-slate-700">
                Descrição do benefício
              </label>
              <input
                id="coupon-benefit"
                value={benefitDescription}
                onChange={(event) => setBenefitDescription(event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          )}
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="coupon-max-uses" className="text-sm font-medium text-slate-700">
                Máximo de usos
              </label>
              <input
                id="coupon-max-uses"
                type="number"
                min="0"
                value={maxUses}
                onChange={(event) => setMaxUses(event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="coupon-max-uses-customer" className="text-sm font-medium text-slate-700">
                Máx. por cliente
              </label>
              <input
                id="coupon-max-uses-customer"
                type="number"
                min="0"
                value={maxUsesPerCustomer}
                onChange={(event) => setMaxUsesPerCustomer(event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="coupon-campaign" className="text-sm font-medium text-slate-700">
              Campanha vinculada
            </label>
            <select
              id="coupon-campaign"
              value={campaignId}
              onChange={(event) => setCampaignId(event.target.value)}
              className="h-9 rounded-md border border-slate-300 px-3 text-sm"
            >
              <option value="">Nenhuma</option>
              {state.campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="coupon-offer" className="text-sm font-medium text-slate-700">
              Oferta vinculada
            </label>
            <select
              id="coupon-offer"
              value={offerId}
              onChange={(event) => setOfferId(event.target.value)}
              className="h-9 rounded-md border border-slate-300 px-3 text-sm"
            >
              <option value="">Nenhuma</option>
              {state.offers.map((offer) => (
                <option key={offer.id} value={offer.id}>
                  {offer.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Salvando...' : 'Criar cupom'}
          </Button>
        </form>
      )}

      {state.status === 'ready' && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-2">Código</th>
                <th className="px-4 py-2">Nome</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Validade</th>
                <th className="px-4 py-2">Usos</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {state.coupons.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    Nenhum cupom criado ainda.
                  </td>
                </tr>
              )}
              {state.coupons.map((coupon) => (
                <tr key={coupon.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 font-medium text-slate-900">{coupon.code}</td>
                  <td className="px-4 py-2 text-slate-700">{coupon.name}</td>
                  <td className="px-4 py-2 text-slate-700">{labelFor(COUPON_TYPE_LABELS, coupon.type)}</td>
                  <td className="px-4 py-2 text-slate-700">—</td>
                  <td className="px-4 py-2 text-slate-700">
                    {coupon.maxUses ?? '∞'}
                    {coupon.maxUsesPerCustomer ? ` (máx ${coupon.maxUsesPerCustomer}/cliente)` : ''}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                        coupon.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {coupon.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
