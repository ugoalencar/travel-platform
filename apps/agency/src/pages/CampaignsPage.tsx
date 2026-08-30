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
import { StatusBadge, type StatusTone } from '../components/ui/status-badge';
import { formatDateBR } from '../lib/formatDateBR';
import { ApiError, listCampaigns, createCampaign, type CreateCampaignInput } from '../lib/api';
import type { Campaign, CampaignStatus } from '../types/campaign';

const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: 'Rascunho',
  SCHEDULED: 'Agendada',
  ACTIVE: 'Ativa',
  PAUSED: 'Pausada',
  FINISHED: 'Finalizada',
  CANCELLED: 'Cancelada',
};

const CAMPAIGN_STATUS_TONES: Record<CampaignStatus, StatusTone> = {
  DRAFT: 'neutral',
  SCHEDULED: 'attention',
  ACTIVE: 'positive',
  PAUSED: 'attention',
  FINISHED: 'neutral',
  CANCELLED: 'attention',
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; campaigns: Campaign[] };

const emptyForm: CreateCampaignInput = {
  name: '',
  description: '',
  timezone: 'America/Sao_Paulo',
  startsAt: '',
  endsAt: '',
  publicationStartsAt: '',
  publicationEndsAt: '',
};

export function CampaignsPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [form, setForm] = useState<CreateCampaignInput>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setState({ status: 'loading' });

    listCampaigns()
      .then((campaigns) => {
        setState({ status: 'success', campaigns });
      })
      .catch((error: unknown) => {
        const message = error instanceof ApiError ? error.message : 'Não foi possível carregar as campanhas.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    if (!form.name.trim()) {
      setFormError('Informe o nome da campanha.');
      return;
    }
    if (form.startsAt && form.endsAt && form.startsAt > form.endsAt) {
      setFormError('A data inicial não pode ser posterior à data final.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const input: CreateCampaignInput = {
        name: form.name.trim(),
        timezone: form.timezone || 'America/Sao_Paulo',
        ...(form.description?.trim() ? { description: form.description.trim() } : {}),
        ...(form.startsAt ? { startsAt: form.startsAt } : {}),
        ...(form.endsAt ? { endsAt: form.endsAt } : {}),
        ...(form.publicationStartsAt ? { publicationStartsAt: form.publicationStartsAt } : {}),
        ...(form.publicationEndsAt ? { publicationEndsAt: form.publicationEndsAt } : {}),
      };
      await createCampaign(input);
      setShowNewCampaign(false);
      setForm(emptyForm);
      load();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar a campanha.');
    } finally {
      setSaving(false);
    }
  }

  if (state.status === 'error') {
    return <ErrorState description={state.message} onRetry={load} />;
  }

  const campaigns = state.status === 'success' ? state.campaigns : null;

  return (
    <div>
      <PageHeader
        title="Campanhas"
        description="Crie e gerencie campanhas de marketing."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Campanhas' }]}
        actions={
          <Button size="sm" onClick={() => setShowNewCampaign(true)}>
            <Plus className="h-4 w-4" />
            Nova
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Campanhas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {state.status === 'loading' && <LoadingState label="Carregando campanhas…" />}

          {campaigns && (
            campaigns.length === 0 ? (
              <EmptyState
                title="Nenhuma campanha registrada"
                description="Quando houver dados, eles aparecerão aqui."
                action={<Button size="sm" onClick={() => setShowNewCampaign(true)}>Criar</Button>}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((campaign) => (
                    <TableRow key={campaign.id}>
                      <TableCell className="font-medium text-slate-900">{campaign.name}</TableCell>
                      <TableCell>
                        <StatusBadge tone={CAMPAIGN_STATUS_TONES[campaign.status]}>
                          {CAMPAIGN_STATUS_LABELS[campaign.status]}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {campaign.startsAt && campaign.endsAt
                          ? `${formatDateBR(campaign.startsAt, { assumeDateOnly: true })} a ${formatDateBR(campaign.endsAt, { assumeDateOnly: true })}`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link to={`/campaigns/${campaign.id}`} className="text-sm text-blue-600 hover:text-blue-700">
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
        open={showNewCampaign}
        onClose={() => {
          setShowNewCampaign(false);
          setForm(emptyForm);
          setFormError(null);
        }}
        title="Nova Campanha"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Nome da Campanha *
            </label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Verão 2026"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Descrição
            </label>
            <Textarea
              value={form.description || ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Descreva brevemente a campanha"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Timezone
            </label>
            <select
              value={form.timezone || 'America/Sao_Paulo'}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="America/Sao_Paulo">São Paulo (UTC-3/-2)</option>
              <option value="America/Fortaleza">Fortaleza (UTC-3)</option>
              <option value="America/Manaus">Manaus (UTC-4)</option>
              <option value="America/Anchorage">Outro timezone</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Início
              </label>
              <Input
                type="date"
                value={form.startsAt || ''}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Término
              </label>
              <Input
                type="date"
                value={form.endsAt || ''}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              />
            </div>
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
              setShowNewCampaign(false);
              setForm(emptyForm);
              setFormError(null);
            }}
            disabled={saving}
          >
            Cancelar
          </Button>
          {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
          <Button size="sm" onClick={handleCreate} disabled={saving}>
            {saving ? 'Salvando…' : 'Criar'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
