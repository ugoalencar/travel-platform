import { useEffect, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { LoadingState } from '../components/ui/loading-state';
import { EmptyState } from '../components/ui/empty-state';
import { StatusBadge } from '../components/ui/status-badge';

export function PescadorPage() {
  const [captures, setCaptures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => setLoading(false), 500);
  }, []);

  if (loading) {
    return (
      <div>
        <PageHeader title="Captura de Ofertas" description="Importar ofertas de URLs externas." />
        <LoadingState label="Carregando…" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Captura de Ofertas"
        description="Importar ofertas de URLs externas."
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Pescador' }]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Ofertas Capturadas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {captures.length === 0 ? (
            <EmptyState
              title="Nenhuma captura"
              description="Comece a capturar ofertas de URLs externas."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>Fonte</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Preço</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {captures.map((cap: any) => (
                  <TableRow key={cap.id}>
                    <TableCell className="text-xs">{cap.sourceUrl}</TableCell>
                    <TableCell>{cap.sourceName}</TableCell>
                    <TableCell>{cap.normalizedTitle || '-'}</TableCell>
                    <TableCell>{cap.foundPrice || '-'}</TableCell>
                    <TableCell>
                      <StatusBadge tone="neutral">{cap.status}</StatusBadge>
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
