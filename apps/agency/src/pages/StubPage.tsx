import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { StatusBadge } from '../components/ui/status-badge';

export interface StubRow {
  name: string;
  status: string;
  tone: 'positive' | 'attention' | 'neutral' | 'inactive';
  detail: string;
}

export interface StubPageProps {
  title: string;
  description: string;
  breadcrumbLabel: string;
  rows: StubRow[];
}

export function StubPage({ title, description, breadcrumbLabel, rows }: StubPageProps) {
  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        breadcrumbs={[{ label: 'Dashboard', to: '/' }, { label: breadcrumbLabel }]}
        actions={<Button size="sm">Novo</Button>}
      />
      <Card>
        <CardHeader>
          <CardTitle>{breadcrumbLabel}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              title={`Nenhum registro em ${breadcrumbLabel.toLowerCase()}`}
              description="Quando houver dados, eles aparecerão aqui."
              action={<Button size="sm">Adicionar</Button>}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Detalhe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell className="font-medium text-slate-900">{row.name}</TableCell>
                    <TableCell>
                      <StatusBadge tone={row.tone}>{row.status}</StatusBadge>
                    </TableCell>
                    <TableCell>{row.detail}</TableCell>
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
