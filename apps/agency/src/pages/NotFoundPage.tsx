import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../components/ui/empty-state';
import { Button } from '../components/ui/button';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <EmptyState
      title="Página não encontrada"
      description="O endereço acessado não existe neste protótipo."
      action={
        <Button
          size="sm"
          onClick={() => {
            void navigate('/');
          }}
        >
          Voltar ao Painel
        </Button>
      }
    />
  );
}
