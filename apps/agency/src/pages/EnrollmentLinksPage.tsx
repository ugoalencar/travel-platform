import { useCallback, useEffect, useState } from 'react';
import { Plus, Copy, Ban } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { LoadingState } from '../components/ui/loading-state';
import { EmptyState } from '../components/ui/empty-state';
import { ErrorState } from '../components/ui/error-state';
import {
  ApiError,
  approveEnrollmentSubmission,
  createEnrollmentLink,
  listEnrollmentLinks,
  listEnrollmentSubmissions,
  requestEnrollmentChanges,
  revokeEnrollmentLink,
  type EnrollmentLink,
  type EnrollmentSubmission,
} from '../lib/api';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; links: EnrollmentLink[]; submissions: EnrollmentSubmission[] };

const SUBMISSION_STATUS_LABEL: Record<string, string> = {
  SUBMITTED: 'Enviado',
  CHANGES_REQUESTED: 'Alterações solicitadas',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
};

export function EnrollmentLinksPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState('');
  const [ttlDays, setTtlDays] = useState('7');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<{ link: EnrollmentLink; token: string } | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);

  const load = useCallback(() => {
    setState({ status: 'loading' });
    Promise.all([listEnrollmentLinks(), listEnrollmentSubmissions()])
      .then(([links, submissions]) => {
        setState({ status: 'success', links, submissions });
      })
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : 'Não foi possível carregar os links de cadastro.';
        setState({ status: 'error', message });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    createEnrollmentLink({
      ...(label.trim() ? { label: label.trim() } : {}),
      ...(ttlDays ? { ttlDays: Number(ttlDays) } : {}),
    })
      .then((result) => {
        setCreatedToken(result);
        setShowForm(false);
        setLabel('');
        setTtlDays('7');
        load();
      })
      .catch((err: unknown) => {
        setFormError(err instanceof ApiError ? err.message : 'Não foi possível criar o link.');
      })
      .finally(() => setSaving(false));
  };

  const handleRevoke = (id: string) => {
    revokeEnrollmentLink(id).then(load).catch(() => undefined);
  };

  // apps/customer (which hosts the public /enroll/:token form) runs on a
  // different Vite dev port than this app -- see apps/customer/vite.config.ts.
  // In production these are typically the same origin/subdomain-routed
  // deployment, at which point VITE_CUSTOMER_APP_URL should be set to
  // override this dev-only guess.
  const publicUrl = (token: string) => {
    const base: string =
      (import.meta.env.VITE_CUSTOMER_APP_URL as string | undefined) ??
      window.location.origin.replace(/:\d+$/, ':5176');
    return `${base}/enroll/${token}`;
  };

  const handleApprove = (id: string) => {
    setReviewError(null);
    approveEnrollmentSubmission(id, reviewNotes.trim() || undefined)
      .then(() => {
        setReviewingId(null);
        setReviewNotes('');
        load();
      })
      .catch((err: unknown) => {
        setReviewError(err instanceof ApiError ? err.message : 'Não foi possível aprovar o cadastro.');
      });
  };

  const handleRequestChanges = (id: string) => {
    if (!reviewNotes.trim()) {
      setReviewError('Descreva o que precisa ser corrigido.');
      return;
    }
    setReviewError(null);
    requestEnrollmentChanges(id, reviewNotes.trim())
      .then(() => {
        setReviewingId(null);
        setReviewNotes('');
        load();
      })
      .catch((err: unknown) => {
        setReviewError(err instanceof ApiError ? err.message : 'Não foi possível solicitar alterações.');
      });
  };

  if (state.status === 'loading') {
    return (
      <div>
        <PageHeader title="Cadastro Remoto" description="Links seguros para o cliente se cadastrar à distância." />
        <LoadingState label="Carregando…" />
      </div>
    );
  }

  if (state.status === 'error') {
    return <ErrorState description={state.message} onRetry={load} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cadastro Remoto"
        description="Gere um link seguro para o prospect preencher os próprios dados; revise e aprove para virar Cliente."
        breadcrumbs={[{ label: 'Painel', to: '/' }, { label: 'Cadastro Remoto' }]}
      />

      {createdToken ? (
        <Card className="border-emerald-300 bg-emerald-50">
          <CardContent className="space-y-2 pt-4">
            <p className="text-sm font-medium text-emerald-900">
              Link criado. Copie e envie ao cliente agora — o token não será exibido novamente.
            </p>
            <div className="flex items-center gap-2">
              <Input readOnly value={publicUrl(createdToken.token)} className="font-mono text-xs" />
              <Button
                size="sm"
                variant="outline"
                onClick={() => void navigator.clipboard.writeText(publicUrl(createdToken.token))}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copiar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCreatedToken(null)}>
                Fechar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Links Ativos</CardTitle>
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="mr-2 h-4 w-4" />
            {showForm ? 'Cancelar' : 'Novo link'}
          </Button>
        </CardHeader>
        {showForm ? (
          <CardContent className="space-y-3 border-b pb-6">
            <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="link-label">Rótulo (opcional)</label>
                <Input id="link-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex: Feira de Turismo" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="link-ttl">Validade (dias)</label>
                <Input id="link-ttl" type="number" min={1} max={60} value={ttlDays} onChange={(e) => setTtlDays(e.target.value)} />
              </div>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? 'Gerando…' : 'Gerar link'}
              </Button>
              {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            </form>
          </CardContent>
        ) : null}
        <CardContent className="p-0">
          {state.links.length === 0 ? (
            <EmptyState title="Nenhum link criado" description="Gere um novo link de cadastro remoto para começar." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rótulo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expira em</TableHead>
                  <TableHead>Último uso</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.links.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell className="font-medium">{link.label || '-'}</TableCell>
                    <TableCell>{link.status === 'ACTIVE' ? 'Ativo' : 'Revogado'}</TableCell>
                    <TableCell>{new Date(link.expiresAt).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell>{link.lastUsedAt ? new Date(link.lastUsedAt).toLocaleString('pt-BR') : 'Nunca'}</TableCell>
                    <TableCell className="text-right">
                      {link.status === 'ACTIVE' ? (
                        <Button size="sm" variant="outline" onClick={() => handleRevoke(link.id)}>
                          <Ban className="mr-2 h-4 w-4" />
                          Revogar
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cadastros Recebidos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {state.submissions.length === 0 ? (
            <EmptyState title="Nenhum cadastro recebido" description="Assim que um prospect enviar o formulário, ele aparece aqui." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Enviado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.submissions.map((submission) => (
                  <TableRow key={submission.id}>
                    <TableCell className="font-medium">{submission.fullName}</TableCell>
                    <TableCell>{submission.email || submission.phone || '-'}</TableCell>
                    <TableCell>{SUBMISSION_STATUS_LABEL[submission.status] ?? submission.status}</TableCell>
                    <TableCell>{new Date(submission.submittedAt).toLocaleString('pt-BR')}</TableCell>
                    <TableCell className="text-right">
                      {submission.status === 'SUBMITTED' || submission.status === 'CHANGES_REQUESTED' ? (
                        reviewingId === submission.id ? (
                          <div className="flex flex-col items-end gap-2">
                            <Input
                              placeholder="Observações da revisão"
                              value={reviewNotes}
                              onChange={(e) => setReviewNotes(e.target.value)}
                              className="w-64"
                            />
                            {reviewError ? <p className="text-xs text-destructive">{reviewError}</p> : null}
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => handleApprove(submission.id)}>Aprovar</Button>
                              <Button size="sm" variant="outline" onClick={() => handleRequestChanges(submission.id)}>
                                Solicitar alteração
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { setReviewingId(null); setReviewError(null); }}>
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => { setReviewingId(submission.id); setReviewNotes(''); setReviewError(null); }}>
                            Revisar
                          </Button>
                        )
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
