import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
      <h1 className="text-4xl font-bold mb-4">404</h1>
      <p className="text-gray-600 mb-8">Página não encontrada</p>
      <Link to="/" className="text-blue-600 hover:underline">Voltar para a página inicial</Link>
    </div>
  );
}
