import { useEffect, useState } from 'react';
import { ApiError, getMyAgencyContact } from '../../lib/customerApi';
import type { CustomerAgencyContact } from '../../types/customer-portal';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; agency: CustomerAgencyContact };

// Minimal "Ajuda" page per the blueprint: agency contact info + a small
// FAQ stub. No ticketing/messaging system exists in this codebase, so
// this deliberately does not invent one -- it just makes it easy to find
// the agency's contact info and answers a few obvious questions.
const FAQ_ITEMS = [
  {
    question: 'Como faço para ver minha próxima viagem?',
    answer:
      'Acesse a aba Início para ver os detalhes da sua próxima viagem, incluindo contagem regressiva e situação da reserva.',
  },
  {
    question: 'Onde encontro meu voucher e itinerário?',
    answer:
      'Abra a viagem em Minhas Viagens e confira as seções Itinerário, Aéreo e Terrestre com todos os detalhes da sua reserva.',
  },
  {
    question: 'Como sei se meus documentos estão certos?',
    answer:
      'Na aba Documentos, cada documento mostra sua situação: aguardando verificação, verificado ou se precisa de atenção.',
  },
  {
    question: 'Como acompanho minhas parcelas?',
    answer:
      'A aba Pagamentos mostra cada parcela, o valor já pago e o quanto falta, sempre atualizado.',
  },
];

export function CustomerHelpPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    getMyAgencyContact()
      .then((agency) => {
        if (!cancelled) setState({ status: 'success', agency });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar os dados de contato.';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Ajuda</h1>
        <p className="mt-2 text-slate-600">Estamos aqui para tornar sua viagem mais tranquila.</p>
      </div>

      <section className="rounded-xl border-2 border-orange-100 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">📞 Fale com sua agência</h2>
        {state.status === 'loading' && <p className="text-sm text-slate-500">Carregando...</p>}
        {state.status === 'error' && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {state.message}
          </div>
        )}
        {state.status === 'success' && (
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-lg font-semibold text-slate-900">{state.agency.name}</p>
            {state.agency.email && (
              <a
                href={`mailto:${state.agency.email}`}
                className="text-[#f97362] hover:underline"
              >
                ✉️ {state.agency.email}
              </a>
            )}
            {state.agency.phone && (
              <a href={`tel:${state.agency.phone}`} className="text-[#f97362] hover:underline">
                📱 {state.agency.phone}
              </a>
            )}
            {!state.agency.email && !state.agency.phone && (
              <p className="text-slate-500">
                Sua agência ainda não cadastrou um contato direto.
              </p>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">💬 Perguntas frequentes</h2>
        <ul className="flex flex-col gap-3">
          {FAQ_ITEMS.map((item) => (
            <li
              key={item.question}
              className="rounded-xl border-2 border-orange-100 bg-white p-4 shadow-sm"
            >
              <p className="font-semibold text-slate-900">{item.question}</p>
              <p className="mt-1 text-sm text-slate-600">{item.answer}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
