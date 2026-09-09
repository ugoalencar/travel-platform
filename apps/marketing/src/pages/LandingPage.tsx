import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle } from 'lucide-react';

export function LandingPage() {
  return (
    <div className="bg-white">
      {/* Navegação */}
      <nav className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-8 border-b">
        <h1 className="text-2xl font-bold text-blue-600">Travel Platform</h1>
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <Link to="/pricing" className="text-gray-700 hover:text-blue-600">Preços</Link>
          <button className="bg-blue-600 text-white px-4 py-2 sm:px-6 rounded-lg hover:bg-blue-700">
            Começar agora
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-4 py-16 text-center sm:px-8 sm:py-20">
        <h2 className="text-4xl font-bold mb-6 text-gray-900 sm:text-5xl">
          Gerencie sua agência de viagens com facilidade
        </h2>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Uma plataforma SaaS completa para agências controlarem reservas, clientes e operações em um só lugar.
        </p>
        <button className="bg-blue-600 text-white px-8 py-4 rounded-lg hover:bg-blue-700 flex items-center gap-2 mx-auto">
          Iniciar teste grátis
          <ArrowRight size={20} />
        </button>
      </section>

      {/* Recursos */}
      <section className="px-4 py-16 bg-gray-50 sm:px-8 sm:py-20">
        <h2 className="text-3xl font-bold mb-10 text-center sm:text-4xl sm:mb-12">Recursos poderosos</h2>
        <div className="grid gap-6 max-w-6xl mx-auto md:grid-cols-3 md:gap-8">
          <FeatureCard title="Gestão de clientes" desc="Organize e acompanhe todos os clientes em um só lugar" />
          <FeatureCard title="Sistema de reservas" desc="Simplifique reservas de viagem com uma interface intuitiva" />
          <FeatureCard title="Relatórios financeiros" desc="Veja detalhes de receitas, despesas e desempenho" />
        </div>
      </section>

      {/* Chamada final */}
      <section className="px-4 py-16 text-center bg-blue-600 text-white sm:px-8 sm:py-20">
        <h2 className="text-3xl font-bold mb-6 sm:text-4xl">Pronto para transformar sua agência?</h2>
        <p className="text-lg mb-8">Junte-se a agências de viagens que já usam nossa plataforma.</p>
        <button className="bg-white text-blue-600 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100">
          Comece seu teste grátis hoje
        </button>
      </section>

      {/* Rodapé */}
      <footer className="bg-gray-900 text-white px-8 py-8 text-center">
        <p>&copy; 2025 Travel Platform. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}

function FeatureCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <div className="flex items-center gap-3 mb-4">
        <CheckCircle className="text-blue-600" size={24} />
        <h3 className="text-lg font-bold">{title}</h3>
      </div>
      <p className="text-gray-600">{desc}</p>
    </div>
  );
}
