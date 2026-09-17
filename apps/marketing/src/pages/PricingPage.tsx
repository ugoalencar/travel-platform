import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { agencySignupUrl } from '../lib/agencyAppUrl';

export function PricingPage() {
  return (
    <div className="bg-white">
      {/* Navegação */}
      <nav className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-8">
        <h1 className="text-xl font-bold text-(--color-travel-navy)">Travel Platform</h1>
        <Link to="/" className="text-sm font-medium text-slate-600 hover:text-(--color-travel-navy)">
          Voltar
        </Link>
      </nav>

      {/* Preços */}
      <section className="px-4 py-16 sm:px-8 sm:py-20">
        <h2 className="mb-12 text-center text-3xl font-bold text-slate-900 sm:text-4xl">Preços simples e transparentes</h2>

        <div className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-3 sm:gap-8">
          <PlanCard
            name="Inicial"
            price="R$ 99"
            features={['10 usuários', '100 GB de armazenamento', 'Suporte básico', 'Recursos essenciais']}
            ctaLabel="Criar conta"
            ctaHref={agencySignupUrl()}
          />
          <PlanCard
            name="Profissional"
            price="R$ 299"
            featured
            features={[
              '50 usuários',
              '500 GB de armazenamento',
              'Suporte prioritário',
              'Todos os recursos',
              'Integrações personalizadas',
            ]}
            ctaLabel="Criar conta"
            ctaHref={agencySignupUrl()}
          />
          <PlanCard
            name="Empresarial"
            price="Sob consulta"
            features={[
              'Usuários ilimitados',
              'Armazenamento ilimitado',
              'Suporte 24/7',
              'Todos os recursos',
              'Gerente de conta dedicado',
            ]}
            ctaLabel="Fale com nosso time"
            ctaHref="/demo"
          />
        </div>
      </section>

      {/* Rodapé */}
      <footer className="bg-slate-900 px-8 py-8 text-center text-white">
        <p className="text-sm text-white/70">&copy; {new Date().getFullYear()} Travel Platform. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}

function PlanCard({
  name,
  price,
  features,
  featured,
  ctaLabel,
  ctaHref,
}: {
  name: string;
  price: string;
  features: string[];
  featured?: boolean;
  ctaLabel: string;
  ctaHref: string;
}) {
  const isExternal = ctaHref.startsWith('http');
  const ctaClassName = `mt-8 block w-full rounded-lg py-2 text-center font-semibold transition-colors ${
    featured ? 'bg-(--color-travel-navy) text-white hover:bg-slate-800' : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
  }`;

  return (
    <div className={`rounded-xl border p-8 ${featured ? 'border-(--color-travel-navy) shadow-lg' : 'border-slate-200'}`}>
      {featured && <span className="text-xs font-semibold uppercase tracking-wide text-(--color-travel-navy)">Recomendado</span>}
      <h3 className="mb-2 mt-2 text-2xl font-bold text-slate-900">{name}</h3>
      <p className="mb-6 text-3xl font-bold text-(--color-travel-navy)">{price}</p>
      <ul className="space-y-3">
        {features.map((feature) => (
          <li key={feature} className="flex items-center gap-2 text-slate-700">
            <Check size={20} className="text-green-600" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      {isExternal ? (
        <a href={ctaHref} className={ctaClassName}>{ctaLabel}</a>
      ) : (
        <Link to={ctaHref} className={ctaClassName}>{ctaLabel}</Link>
      )}
    </div>
  );
}
