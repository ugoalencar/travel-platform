import { StubPage } from './StubPage';

export function OffersPage() {
  return (
    <StubPage
      title="Ofertas"
      description="Ofertas e pacotes publicados pela agência."
      breadcrumbLabel="Ofertas"
      rows={[
        { name: 'Portugal em família', status: 'Ativa', tone: 'positive', detail: 'Válida até 30/11' },
        { name: 'Grécia — lua de mel', status: 'Ativa', tone: 'positive', detail: 'Válida até 15/10' },
        { name: 'Inverno em Bariloche', status: 'Expirada', tone: 'attention', detail: 'Encerrada em 15/08' },
      ]}
    />
  );
}
