import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Users,
  GitBranch,
  Map,
  Wallet,
  UserCog,
  Smartphone,
  ShieldCheck,
  Lock,
  KeyRound,
  FileClock,
  Server,
} from 'lucide-react';
import { agencyLoginUrl, agencySignupUrl } from '../lib/agencyAppUrl';
import {
  getPublicBanners,
  getPublicLanding,
  getPublicPartners,
  isSafeHref,
  type PublicBanner,
  type PublicLanding,
  type PublicPartner,
} from '../lib/publicCommercialApi';

const PRODUCT_AREAS = [
  { icon: Users, title: 'CRM / Cliente 360', desc: 'Todo o histórico, documentos e viagens do cliente em um só lugar.' },
  { icon: GitBranch, title: 'Pipeline comercial', desc: 'Do primeiro contato à venda, com etapas configuráveis por agência.' },
  { icon: Map, title: 'Viagens e operação', desc: 'Terrestre, aéreo e excursões com visão operacional real.' },
  { icon: Wallet, title: 'Financeiro', desc: 'Contas a receber, a pagar, fluxo de caixa e margem em tempo real.' },
  { icon: UserCog, title: 'Equipe', desc: 'Papéis, permissões e convites para sua equipe comercial e operacional.' },
  { icon: Smartphone, title: 'Portal do cliente', desc: 'Seus clientes acompanham viagens, documentos e ofertas direto do celular.' },
];

const SECURITY_ITEMS = [
  { icon: ShieldCheck, title: 'Isolamento por agência', desc: 'Cada agência opera em seu próprio espaço de dados, sem acesso cruzado.' },
  { icon: Lock, title: 'Controle de acesso por papel', desc: 'Permissões específicas para donos, gerentes, agentes e equipe de operação.' },
  { icon: KeyRound, title: 'Autenticação em duas etapas', desc: 'Proteção adicional de login para contas da equipe.' },
  { icon: FileClock, title: 'Trilha de auditoria', desc: 'Ações relevantes ficam registradas para consulta posterior.' },
  { icon: Server, title: 'Sessões seguras', desc: 'Sessões com expiração e revogação, sem tokens expostos no navegador.' },
];

export function LandingPage() {
  // Consome o Landing CMS público do Platform Admin (Conteúdo & Parcerias,
  // META PÓS-PILOTO 01/fechamento). Sempre lê /public/landing,
  // /public/partners, /public/banners -- nunca draft, nunca exige auth de
  // Platform Admin (ver docs/product/PLATFORM_ADMIN_COMERCIAL_PARCERIAS.md).
  // Falha suave: se nada foi publicado ainda, ou a chamada falhar, a
  // página inteira permanece no conteúdo estático abaixo -- nenhuma seção
  // desta página depende de os dados dinâmicos terem carregado.
  const [landing, setLanding] = useState<PublicLanding | null>(null);
  const [partners, setPartners] = useState<PublicPartner[]>([]);
  const [banners, setBanners] = useState<PublicBanner[]>([]);

  useEffect(() => {
    void getPublicLanding().then(setLanding);
    void getPublicPartners().then(setPartners);
    void getPublicBanners('LANDING').then(setBanners);
  }, []);

  const heroTitle = landing?.page.heroTitle || 'Transforme sua agência em uma operação mais inteligente.';
  const heroSubtitle =
    landing?.page.heroSubtitle ||
    'O Travel Platform centraliza clientes, comercial, viagens, financeiro, equipe e o portal do seu cliente em um único lugar — para agências de viagens que querem operar com clareza.';
  const ctaPrimaryLabel = landing?.page.ctaPrimaryLabel || 'Criar conta';
  const ctaPrimaryUrl = isSafeHref(landing?.page.ctaPrimaryUrl) ? landing?.page.ctaPrimaryUrl : agencySignupUrl();
  const ctaSecondaryLabel = landing?.page.ctaSecondaryLabel || 'Entrar';
  const ctaSecondaryUrl = isSafeHref(landing?.page.ctaSecondaryUrl) ? landing?.page.ctaSecondaryUrl : agencyLoginUrl();

  const faqSections = (landing?.sections ?? []).filter((s) => s.type === 'FAQ' && s.enabled);
  const testimonialSections = (landing?.sections ?? []).filter((s) => s.type === 'TESTIMONIALS' && s.enabled);

  return (
    <div className="bg-white">
      {/* Banners ativos (placement LANDING) -- gerenciados em Platform
          Admin > Conteúdo > Banners. Ausentes por padrão: nenhum banner
          publicado ainda não altera o layout. */}
      {banners.length > 0 && (
        <div className="bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
          {banners.map((banner) => (
            <div key={banner.id}>
              <strong>{banner.title}</strong>
              {banner.subtitle ? <span> — {banner.subtitle}</span> : null}
              {banner.ctaLabel && isSafeHref(banner.ctaUrl) ? (
                <a href={banner.ctaUrl ?? undefined} className="ml-2 underline">
                  {banner.ctaLabel}
                </a>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Navegação */}
      <nav className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-4 py-4 sm:px-8">
        <h1 className="text-xl font-bold text-(--color-travel-navy)">Travel Platform</h1>
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <Link to="/pricing" className="text-sm font-medium text-slate-600 hover:text-(--color-travel-navy)">Preços</Link>
          <Link to="/demo" className="text-sm font-medium text-slate-600 hover:text-(--color-travel-navy)">Solicitar acesso</Link>
          <a href={agencyLoginUrl()} className="text-sm font-medium text-slate-600 hover:text-(--color-travel-navy)">Entrar</a>
          <a
            href={agencySignupUrl()}
            className="rounded-lg bg-(--color-travel-navy) px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 sm:px-6"
          >
            Criar conta
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-(--color-travel-navy) via-slate-800 to-(--color-travel-cyan)/40 px-4 py-20 text-white sm:px-8 sm:py-28">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10" />
        <div className="relative mx-auto max-w-3xl text-center">
          <h2 className="text-4xl font-bold sm:text-5xl">{heroTitle}</h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/80">{heroSubtitle}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href={ctaPrimaryUrl}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 font-semibold text-(--color-travel-navy) hover:bg-slate-100"
            >
              {ctaPrimaryLabel}
              <ArrowRight size={18} />
            </a>
            <a
              href={ctaSecondaryUrl}
              className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-6 py-3 font-semibold text-white hover:bg-white/20"
            >
              {ctaSecondaryLabel}
            </a>
          </div>
        </div>

        {/* Representação visual do produto -- não são dados reais, apenas a
            linguagem visual (cores/ícones) do sistema real */}
        <div className="relative mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-3">
          {PRODUCT_AREAS.slice(0, 3).map((area) => (
            <div key={area.title} className="rounded-xl bg-white/10 p-4 backdrop-blur-sm">
              <area.icon className="h-5 w-5 text-white/90" />
              <p className="mt-2 text-sm font-semibold text-white">{area.title}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Áreas do produto */}
      <section className="px-4 py-16 sm:px-8 sm:py-20">
        <h2 className="text-center text-3xl font-bold text-slate-900 sm:text-4xl">Tudo que a sua agência precisa</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
          Um único produto para o time comercial, operacional, financeiro — e para o seu cliente.
        </p>
        <div className="mx-auto mt-12 grid max-w-6xl gap-6 md:grid-cols-3 md:gap-8">
          {PRODUCT_AREAS.map((area) => (
            <FeatureCard key={area.title} icon={area.icon} title={area.title} desc={area.desc} />
          ))}
        </div>
      </section>

      {/* Segurança / multi-tenancy */}
      <section className="bg-slate-50 px-4 py-16 sm:px-8 sm:py-20">
        <h2 className="text-center text-3xl font-bold text-slate-900 sm:text-4xl">Segurança por padrão</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
          Cada agência opera isolada, com controle de acesso e trilha de auditoria desde o primeiro dia.
        </p>
        <div className="mx-auto mt-12 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {SECURITY_ITEMS.map((item) => (
            <div key={item.title} className="rounded-xl border border-slate-200 bg-white p-5">
              <item.icon className="h-5 w-5 text-(--color-travel-navy)" />
              <h3 className="mt-3 text-sm font-bold text-slate-900">{item.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Parceiros públicos -- gerenciados em Platform Admin > Parcerias >
          Parceiros. Só renderiza se houver ao menos um parceiro público
          publicado; nunca exibe internal_notes/contato (a API pública já
          nunca retorna esses campos). */}
      {partners.length > 0 && (
        <section className="px-4 py-16 sm:px-8 sm:py-20">
          <h2 className="text-center text-3xl font-bold text-slate-900 sm:text-4xl">Nossos parceiros</h2>
          <div className="mx-auto mt-10 flex max-w-5xl flex-wrap items-center justify-center gap-8">
            {partners.map((partner) =>
              isSafeHref(partner.websiteUrl) ? (
                <a
                  key={partner.id}
                  href={partner.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-slate-700 hover:text-(--color-travel-navy)"
                >
                  {partner.name}
                </a>
              ) : (
                <span key={partner.id} className="text-sm font-semibold text-slate-700">
                  {partner.name}
                </span>
              )
            )}
          </div>
        </section>
      )}

      {/* Depoimentos publicados (seções type=TESTIMONIALS habilitadas) */}
      {testimonialSections.length > 0 && (
        <section className="bg-slate-50 px-4 py-16 sm:px-8 sm:py-20">
          <h2 className="text-center text-3xl font-bold text-slate-900 sm:text-4xl">O que dizem sobre nós</h2>
          <div className="mx-auto mt-10 grid max-w-5xl gap-6 sm:grid-cols-2">
            {testimonialSections.map((section) => (
              <div key={section.id} className="rounded-xl border border-slate-200 bg-white p-6">
                {section.title && <p className="font-semibold text-slate-900">{section.title}</p>}
                {section.content && <p className="mt-2 text-sm text-slate-600">{section.content}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* FAQ publicado (seções type=FAQ habilitadas, gerenciadas em
          Platform Admin > Conteúdo > FAQ) */}
      {faqSections.length > 0 && (
        <section className="px-4 py-16 sm:px-8 sm:py-20">
          <h2 className="text-center text-3xl font-bold text-slate-900 sm:text-4xl">Perguntas frequentes</h2>
          <div className="mx-auto mt-10 max-w-3xl space-y-4">
            {faqSections
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((section) => (
                <div key={section.id} className="rounded-xl border border-slate-200 p-5">
                  <p className="font-semibold text-slate-900">{section.title}</p>
                  {section.content && <p className="mt-2 text-sm text-slate-600">{section.content}</p>}
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Chamada final */}
      <section className="bg-gradient-to-br from-(--color-travel-navy) via-slate-800 to-(--color-travel-cyan)/40 px-4 py-16 text-center text-white sm:px-8 sm:py-20">
        <h2 className="text-3xl font-bold sm:text-4xl">Pronto para transformar sua agência?</h2>
        <p className="mt-4 text-lg text-white/80">Junte-se às agências de viagens que já usam o Travel Platform.</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href={agencySignupUrl()}
            className="inline-block rounded-lg bg-white px-8 py-4 font-semibold text-(--color-travel-navy) hover:bg-slate-100"
          >
            Criar conta
          </a>
          <Link
            to="/demo"
            className="inline-block rounded-lg border border-white/30 bg-white/10 px-8 py-4 font-semibold text-white hover:bg-white/20"
          >
            Solicitar acesso
          </Link>
        </div>
      </section>

      {/* Rodapé */}
      <footer className="bg-slate-900 px-8 py-8 text-center text-white">
        <p className="text-sm text-white/70">&copy; {new Date().getFullYear()} Travel Platform. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof Users;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-(--color-travel-navy)/10">
        <Icon className="h-5 w-5 text-(--color-travel-navy)" />
      </div>
      <h3 className="mt-4 text-lg font-bold text-slate-900">{title}</h3>
      <p className="mt-1 text-slate-600">{desc}</p>
    </div>
  );
}
