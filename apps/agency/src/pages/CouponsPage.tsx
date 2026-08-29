import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { LoadingState } from '../components/ui/loading-state';
import { ErrorState } from '../components/ui/error-state';
import { Modal } from '../components/ui/modal';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { StatusBadge } from '../components/ui/status-badge';
import { formatDateBR } from '../lib/formatDateBR';
import { formatBRL } from '../lib/formatCurrency';
import { ApiError, listCoupons, createCoupon, type CreateCouponInput } from '../lib/api';
import type { Coupon, CouponType } from '../types/coupon';

const COUPON_TYPE_LABELS: Record<CouponType, string> = {
  FIXED: 'Valor Fixo',
  PERCENTAGE: 'Percentual',
  BOGO: 'Compre um leve dois',
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; coupons: Coupon[] };

const emptyForm: CreateCouponInput = {
  code: '',
  name: '',
  type: 'PERCENTAGE',
  value: 0,
  benefitDescription: '',
  expiresAt: '',
};

export function CouponsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [showNewCoupon, setShowNewCoupon] = useState(false);
  const [form, setForm] = useState<CreateCouponInput>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setState({ status: 'loading' });

    listCoupons()
      .then((coupons) => {
        setState({ status: 'success', coupons });
      })
      .catch((error: unknown) => {
        const message = error instanceof ApiError ? error.message : 'Não foi possível carregar os cupons.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    if (!form.code.trim()) {
      setFormError('Informe o código do cupom.');
      return;
    }
    if (!form.name.trim()) {
      setFormError('Informe o nome do cupom.');
      return;
    }
    if (form.value !== undefined && form.value < 0) {
      setFormError('O valor não pode ser negativo.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const input: CreateCouponInput = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        type: form.type,
        ...(form.value ? { value: form.value } : {}),
        ...(form.benefitDescription?.trim() ? { benefitDescription: form.benefitDescription.trim() } : {}),
        ...(form.expiresAt ? { expiresAt: form.expiresAt } : {}),
      };
      await createCoupon(input);
      setShowNewCoupon(false);
      setForm(emptyForm);
      load();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar o cupom.');
    } finally {
      setSaving(false);
    }
  }

  if (state.status === 'error') {
    return <ErrorState description={state.message} onRetry={load} />;
  }

  const coupons = state.status === 'success' ? state.coupons : null;

  return (
    <div>
      <PageHeader
        title="Cupons"
        description="Crie e gerencie cupons promocionais."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Cupons' }]}
        actions={
          <Button size="sm" onClick={() => setShowNewCoupon(true)}>
            <Plus className="h-4 w-4" />
            Novo
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Cupons</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {state.status === 'loading' && <LoadingState label="Carregando cupons…" />}

          {coupons && (
            coupons.length === 0 ? (
              <EmptyState
                title="Nenhum cupom registrado"
                description="Quando houver dados, eles aparecerão aqui."
                action={<Button size="sm" onClick={() => setShowNewCoupon(true)}>Criar</Button>}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coupons.map((coupon) => (
                    <TableRow key={coupon.id}>
                      <TableCell className="font-mono font-semibold text-slate-900">{coupon.code}</TableCell>
                      <TableCell>{coupon.name}</TableCell>
                      <TableCell className="text-sm text-slate-600">{COUPON_TYPE_LABELS[coupon.type]}</TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {coupon.value !== undefined
                          ? coupon.type === 'PERCENTAGE'
                            ? `${coupon.value}%`
                            : formatBRL(coupon.value)
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={coupon.active ? 'positive' : 'inactive'}>
                          {coupon.active ? 'Ativo' : 'Inativo'}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link to={`/coupons/${coupon.id}`} className="text-sm text-blue-600 hover:text-blue-700">
                          Detalhe
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          )}
        </CardContent>
      </Card>

      <Modal
        open={showNewCoupon}
        onClose={() => {
          setShowNewCoupon(false);
          setForm(emptyForm);
          setFormError(null);
        }}
        title="Novo Cupom"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Código *
            </label>
            <Input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="Ex: VERAO2026"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Nome do Cupom *
            </label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Desconto Verão"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Tipo *
              </label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as CouponType })}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="PERCENTAGE">Percentual</option>
                <option value="FIXED">Valor Fixo</option>
                <option value="BOGO">Compre um leve dois</option>
              </select>
            </div>
            {form.type !== 'BOGO' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Valor
                </label>
                <Input
                  type="number"
                  value={form.value || 0}
                  onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
                  placeholder={form.type === 'PERCENTAGE' ? '10' : '0,00'}
                  min="0"
                  step={form.type === 'PERCENTAGE' ? '1' : '0.01'}
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Descrição do Benefício
            </label>
            <Textarea
              value={form.benefitDescription || ''}
              onChange={(e) => setForm({ ...form, benefitDescription: e.target.value })}
              placeholder="Descreva o benefício do cupom"
              rows={2}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Expira em
            </label>
            <Input
              type="date"
              value={form.expiresAt || ''}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
            />
          </div>

          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {formError}
            </div>
          )}
        </div>
        <div className="flex gap-3 justify-end border-t border-slate-200 p-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowNewCoupon(false);
              setForm(emptyForm);
              setFormError(null);
            }}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={saving}>
            {saving ? 'Salvando…' : 'Criar'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
