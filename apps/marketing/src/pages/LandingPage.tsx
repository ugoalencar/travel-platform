import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
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
import { ImageSlot } from '../components/ImageSlot';
import { LiteDashboardShot, LiteSalesShot } from '../components/ProductShots';
import { Logo } from '../components/Logo';
import { Reveal } from '../components/Reveal';

const PRODUCT_AREAS = [
  { title: 'CRM / Cliente 360', desc: 'Todo o histórico, documentos e viagens do cliente em um só lugar.' },
  { title: 'Pipeline comercial', desc: 'Do primeiro contato à venda, com etapas configuráveis por agência.' },
  { title: 'Viagens e operação', desc: 'Terrestre, aéreo e excursões com visão operacional real.' },
  { title: 'Financeiro', desc: 'Contas a receber, a pagar, fluxo de caixa e margem em tempo real.' },
  { title: 'Equipe', desc: 'Papéis, permissões e convites para sua equipe comercial e operacional.' },
  { title: 'Portal do cliente', desc: 'Seus clientes acompanham viagens, documentos e ofertas direto do celular.' },
];

const SECURITY_ITEMS = [
  { title: 'Isolamento por agência', desc: 'Cada agência opera em seu próprio espaço de dados, sem acesso cruzado.' },
  { title: 'Controle de acesso por papel', desc: 'Permissões específicas para donos, gerentes, agentes e equipe de operação.' },
  { title: 'Autenticação em duas etapas', desc: 'Proteção adicional de login para contas da equipe.' },
  { title: 'Trilha de auditoria', desc: 'Ações relevantes ficam registradas para consulta posterior.' },
  { title: 'Sessões seguras', desc: 'Sessões com expiração e revogação, sem tokens expostos no navegador.' },
];

const LITE_CAPABILITIES = ['Clientes', 'Vendas', 'Comissões', 'Financeiro básico', 'Importação de planilhas CSV/XLSX'];

// Fotos licenciadas (Adobe Stock, uso comercial) para o hero e a vitrine de
// destinos -- não são clientes nem dados reais da plataforma, só ilustram o
// mercado em que a agência atua. Arquivos em public/photos (servidos da raiz).
const DESTINATIONS = [
  { name: 'Paris', src: '/photos/paris.jpg' },
  { name: 'Itália', src: '/photos/italy.jpg' },
  { name: 'Espanha', src: '/photos/spain.jpg' },
  { name: 'Grécia', src: '/photos/greece.jpg' },
  { name: 'Brasil', src: '/photos/brazil.jpg' },
];

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent';
const EYEBROW = 'text-xs font-semibold uppercase tracking-[0.18em] text-accent';
const SECTION_WIDTH = 'mx-auto max-w-7xl px-6 sm:px-10';

function pad(index: number): string {
  return String(index + 1).padStart(2, '0');
}

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
    'A Travel Plataforma centraliza clientes, comercial, viagens, financeiro, equipe e o portal do seu cliente em um único lugar — para agências de viagens que querem operar com clareza.';
  const ctaPrimaryLabel = landing?.page.ctaPrimaryLabel || 'Criar conta';
  const ctaPrimaryUrl = isSafeHref(landing?.page.ctaPrimaryUrl) ? landing?.page.ctaPrimaryUrl : agencySignupUrl();
  const ctaSecondaryLabel = landing?.page.ctaSecondaryLabel || 'Entrar';
  const ctaSecondaryUrl = isSafeHref(landing?.page.ctaSecondaryUrl) ? landing?.page.ctaSecondaryUrl : agencyLoginUrl();

  const faqSections = (landing?.sections ?? []).filter((s) => s.type === 'FAQ' && s.enabled);
  const testimonialSections = (landing?.sections ?? []).filter((s) => s.type === 'TESTIMONIALS' && s.enabled);

  return (
    <div className="bg-paper">
      {/* Banners ativos (placement LANDING) -- gerenciados em Platform
          Admin > Conteúdo > Banners. Ausentes por padrão: nenhum banner
          publicado ainda não altera o layout. */}
      {banners.length > 0 && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-950">
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
      <nav className={`${SECTION_WIDTH} flex flex-wrap items-center justify-between gap-4 py-6`}>
        <Link to="/" aria-label="Travel Plataforma, página inicial" className={FOCUS_RING}>
          <Logo className="h-10" />
        </Link>
        <div className="flex flex-wrap items-center gap-5 sm:gap-8">
          <Link to="/pricing" className={`text-sm font-medium hover:text-accent ${FOCUS_RING}`}>
            Preços
          </Link>
          <Link to="/demo" className={`text-sm font-medium hover:text-accent ${FOCUS_RING}`}>
            Solicitar acesso
          </Link>
          <a href={agencyLoginUrl()} className={`text-sm font-medium hover:text-accent ${FOCUS_RING}`}>
            Entrar
          </a>
          <a
            href={agencySignupUrl()}
            className={`rounded-sm bg-travel-navy px-5 py-2 text-sm font-semibold text-paper hover:bg-travel-navy/85 ${FOCUS_RING}`}
          >
            Criar conta
          </a>
        </div>
      </nav>

      {/* Hero */}
      <header className={`${SECTION_WIDTH} grid items-center gap-16 pb-28 pt-10 lg:grid-cols-12 lg:pt-16`}>
        <div className="lg:col-span-7">
          <p className={EYEBROW}>Para agências de viagem</p>
          <h1 className="mt-5 font-serif text-5xl leading-[1.05] font-normal tracking-tight sm:text-6xl lg:text-7xl">
            {heroTitle}
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-slate-700">{heroSubtitle}</p>
          <div className="mt-10 flex flex-wrap items-center gap-6">
            <a
              href={ctaPrimaryUrl}
              className={`inline-flex items-center gap-2 rounded-sm bg-accent px-7 py-3.5 font-semibold text-white hover:bg-[#1043a8] ${FOCUS_RING}`}
            >
              {ctaPrimaryLabel}
              <ArrowRight size={18} aria-hidden="true" />
            </a>
            <a
              href={ctaSecondaryUrl}
              className={`font-semibold underline decoration-travel-navy/30 underline-offset-8 hover:decoration-accent ${FOCUS_RING}`}
            >
              {ctaSecondaryLabel}
            </a>
          </div>
        </div>

        <div className="relative lg:col-span-5">
          <div className="aspect-[4/5] overflow-hidden rounded-none bg-travel-navy">
            <ImageSlot src="/photos/hero-coast.jpg" alt="" />
          </div>
          <LiteSalesShot className="absolute -bottom-10 -left-2 w-64 sm:w-80 lg:-left-20" />
        </div>
      </header>

      {/* Destinos -- fotografia editorial, reforça "agência de viagem" antes
          de entrar no produto. Puramente ilustrativo: não é inventário real
          de destinos nem promessa comercial. */}
      <section className={`${SECTION_WIDTH} pb-24`}>
        <Reveal>
          <p className={EYEBROW}>Destinos</p>
          <h2 className="mt-4 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
            Para onde sua agência leva os clientes
          </h2>
        </Reveal>
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {DESTINATIONS.map((destination, index) => (
            <Reveal key={destination.name} delayMs={index * 60}>
              <div className="aspect-[4/5] overflow-hidden bg-travel-navy">
                <img
                  src={destination.src}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                />
              </div>
              <p className="mt-3 text-sm font-semibold">{destination.name}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Veja na prática -- vídeo mais recente do produto (pipeline, app do
          cliente, equipe e segurança). preload="metadata" para não baixar o
          arquivo inteiro antes do clique em play. */}
      <section className={`${SECTION_WIDTH} pb-28`}>
        <Reveal>
          <p className={EYEBROW}>Veja na prática</p>
          <h2 className="mt-4 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
            Dois minutos para conhecer a Travel Plataforma
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-700">
            Pipeline comercial, app do cliente, equipe e segurança — direto do produto.
          </p>
        </Reveal>
        <Reveal delayMs={100} className="mt-10">
          <video
            className="w-full bg-travel-navy"
            controls
            preload="metadata"
            playsInline
            poster="/video/travel-plataforma.jpg"
          >
            <source src="/video/travel-plataforma.mp4" type="video/mp4" />
          </video>
        </Reveal>
      </section>

      {/* Áreas do produto */}
      <section className={`${SECTION_WIDTH} grid gap-12 pb-28 lg:grid-cols-12`}>
        <Reveal className="self-start lg:sticky lg:top-24 lg:col-span-4">
          <p className={EYEBROW}>O produto</p>
          <h2 className="mt-4 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
            Tudo que a sua agência precisa
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-700">
            Um único produto para o time comercial, operacional, financeiro — e para o seu cliente.
          </p>
        </Reveal>
        <ol className="lg:col-span-8">
          {PRODUCT_AREAS.map((area, index) => (
            <li key={area.title} className="border-t border-travel-navy/20 last:border-b">
              <Reveal className="grid gap-2 py-8 sm:grid-cols-[4rem_1fr_1.2fr] sm:gap-6" delayMs={index * 40}>
                <span className="font-serif text-2xl text-accent">{pad(index)}</span>
                <h3 className="font-serif text-2xl">{area.title}</h3>
                <p className="leading-relaxed text-slate-700">{area.desc}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      {/* Módulo Travel Lite */}
      <section className="bg-travel-navy py-28 text-paper">
        <div className={`${SECTION_WIDTH} grid items-center gap-16 lg:grid-cols-12`}>
          <Reveal className="lg:col-span-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-travel-cyan">Módulo Travel Lite</p>
            <h2 className="mt-4 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
              Comece pelo Travel Lite.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-paper/85">
              A operação do dia a dia da agência, pronta para trabalhar: cadastra o cliente, registra a venda,
              controla o que entrou e o que saiu e paga a comissão. Roda no navegador e pode ser instalado no
              celular.
            </p>
            <ul className="mt-8 flex flex-wrap gap-2">
              {LITE_CAPABILITIES.map((item) => (
                <li key={item} className="rounded-sm border border-paper/30 px-4 py-1.5 text-sm">
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-8 leading-relaxed text-paper/85">
              Quando a agência crescer, a migração para a Travel Plataforma completa já está preparada.
            </p>
            <Link
              to="/demo"
              className={`mt-8 inline-flex items-center gap-2 rounded-sm bg-paper px-7 py-3.5 font-semibold text-travel-navy hover:bg-white ${FOCUS_RING}`}
            >
              Solicitar acesso
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </Reveal>
          <Reveal className="relative min-h-[28rem] lg:col-span-7" delayMs={120}>
            <LiteDashboardShot className="w-full max-w-md sm:ml-auto" />
            <LiteSalesShot className="mt-6 w-full max-w-sm sm:absolute sm:bottom-0 sm:left-0 sm:mt-0 sm:w-72" />
            <p className="mt-6 text-xs text-paper/70 sm:absolute sm:-bottom-8 sm:right-0">
              Telas ilustrativas, com dados fictícios.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Segurança / multi-tenancy */}
      <section className="bg-paper-deep py-28">
        <div className={`${SECTION_WIDTH} grid gap-12 lg:grid-cols-12`}>
          <Reveal className="lg:col-span-5">
            <p className={EYEBROW}>Confiança</p>
            <h2 className="mt-4 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
              Segurança por padrão
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-slate-700">
              Cada agência opera isolada, com controle de acesso e trilha de auditoria desde o primeiro dia.
            </p>
          </Reveal>
          <ul className="lg:col-span-7">
            {SECURITY_ITEMS.map((item, index) => (
              <li key={item.title} className="border-t border-travel-navy/20 last:border-b">
                <Reveal className="grid gap-1 py-6 sm:grid-cols-[3rem_1fr] sm:gap-4" delayMs={index * 40}>
                  <span className="font-serif text-lg text-accent">{pad(index)}</span>
                  <div>
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="mt-1 leading-relaxed text-slate-700">{item.desc}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Parceiros públicos -- gerenciados em Platform Admin > Parcerias >
          Parceiros. Só renderiza se houver ao menos um parceiro público
          publicado; nunca exibe internal_notes/contato (a API pública já
          nunca retorna esses campos). */}
      {partners.length > 0 && (
        <section className={`${SECTION_WIDTH} py-24`}>
          <p className={EYEBROW}>Nossos parceiros</p>
          <div className="mt-8 flex flex-wrap items-center gap-x-12 gap-y-4">
            {partners.map((partner) =>
              isSafeHref(partner.websiteUrl) ? (
                <a
                  key={partner.id}
                  href={partner.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`font-serif text-2xl hover:text-accent ${FOCUS_RING}`}
                >
                  {partner.name}
                </a>
              ) : (
                <span key={partner.id} className="font-serif text-2xl">
                  {partner.name}
                </span>
              ),
            )}
          </div>
        </section>
      )}

      {/* Depoimentos publicados (seções type=TESTIMONIALS habilitadas) */}
      {testimonialSections.length > 0 && (
        <section className={`${SECTION_WIDTH} py-24`}>
          <p className={EYEBROW}>O que dizem sobre nós</p>
          <div className="mt-8 grid gap-10 sm:grid-cols-2">
            {testimonialSections.map((section) => (
              <figure key={section.id} className="border-t border-travel-navy/20 pt-6">
                {section.content && (
                  <blockquote className="font-serif text-2xl leading-snug">{section.content}</blockquote>
                )}
                {section.title && <figcaption className="mt-4 text-sm font-semibold">{section.title}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* FAQ publicado (seções type=FAQ habilitadas, gerenciadas em
          Platform Admin > Conteúdo > FAQ) */}
      {faqSections.length > 0 && (
        <section className={`${SECTION_WIDTH} grid gap-12 py-24 lg:grid-cols-12`}>
          <h2 className="font-serif text-4xl leading-tight tracking-tight lg:col-span-4">Perguntas frequentes</h2>
          <div className="lg:col-span-8">
            {[...faqSections]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((section) => (
                <details key={section.id} className="group border-t border-travel-navy/20 py-5 last:border-b">
                  <summary className={`cursor-pointer list-none text-lg font-semibold ${FOCUS_RING}`}>
                    {section.title}
                  </summary>
                  {section.content && <p className="mt-3 leading-relaxed text-slate-700">{section.content}</p>}
                </details>
              ))}
          </div>
        </section>
      )}

      {/* Chamada final */}
      <section className={`${SECTION_WIDTH} pb-24 pt-8`}>
        <div className="relative overflow-hidden rounded-none bg-travel-navy text-paper">
          <div className="absolute inset-y-0 right-0 hidden w-2/5 lg:block">
            <ImageSlot />
          </div>
          <div className="relative max-w-2xl px-8 py-16 sm:px-14 sm:py-20">
            <h2 className="font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
              Pronto para transformar sua agência?
            </h2>
            <p className="mt-5 text-lg text-paper/85">
              Junte-se às agências de viagens que já usam a Travel Plataforma.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-6">
              <a
                href={agencySignupUrl()}
                className={`rounded-sm bg-paper px-8 py-4 font-semibold text-travel-navy hover:bg-white ${FOCUS_RING}`}
              >
                Criar conta
              </a>
              <Link
                to="/demo"
                className={`font-semibold underline decoration-paper/40 underline-offset-8 hover:decoration-paper ${FOCUS_RING}`}
              >
                Solicitar acesso
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Rodapé */}
      <footer className="bg-paper-deep">
        <div className={`${SECTION_WIDTH} flex flex-wrap items-center justify-between gap-4 py-8`}>
          <Logo className="h-8" />
          <p className="text-sm text-slate-700">
            &copy; {new Date().getFullYear()} Travel Plataforma. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
