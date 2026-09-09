import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PescadorPage } from './PescadorPage';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof api>('../lib/api');
  return {
    ...actual,
    listCaptures: vi.fn(),
    captureUrl: vi.fn(),
    reviewCapture: vi.fn(),
    approveCapture: vi.fn(),
    publishCapture: vi.fn(),
    updateCapture: vi.fn(),
  };
});

const capturedOffer: api.Capture = {
  id: 'capture-1',
  agencyId: 'agency-1',
  sourceUrl: 'https://fornecedor.example/oferta-rio',
  sourceName: 'fornecedor.example',
  capturedAt: '2026-09-01T10:00:00.000Z',
  rawContent: '{"hotel":"Praia Palace","destination":"Rio de Janeiro"}',
  normalizedTitle: 'Rio de Janeiro com Praia Palace',
  normalizedDescription: 'Pacote com hotel, aéreo e traslados.',
  foundPrice: 4890,
  currency: 'BRL',
  validUntil: '2026-10-15T00:00:00.000Z',
  status: 'CAPTURED',
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
};

beforeEach(() => {
  let captureState = capturedOffer;
  vi.mocked(api.listCaptures).mockImplementation(() => Promise.resolve([captureState]));
  vi.mocked(api.captureUrl).mockResolvedValue(capturedOffer);
  vi.mocked(api.updateCapture).mockImplementation((_id, patch) => {
    captureState = { ...captureState, ...patch, updatedAt: new Date().toISOString() } as api.Capture;
    return Promise.resolve(captureState);
  });
  vi.mocked(api.reviewCapture).mockImplementation(() => {
    captureState = { ...captureState, status: 'UNDER_REVIEW' };
    return Promise.resolve(captureState);
  });
  vi.mocked(api.approveCapture).mockImplementation(() => {
    captureState = { ...captureState, status: 'APPROVED' };
    return Promise.resolve(captureState);
  });
  vi.mocked(api.publishCapture).mockImplementation(() => {
    captureState = {
      ...captureState,
      status: 'PUBLISHED',
      publishedOfferId: 'offer-1',
    };
    return Promise.resolve({
      capture: captureState,
      offer: {
        id: 'offer-1',
        agencyId: 'agency-1',
        name: 'Rio de Janeiro com Praia Palace',
        description: 'Pacote com hotel, aéreo e traslados.',
        price: 4890,
        status: 'ACTIVE',
        createdAt: '2026-09-01T10:05:00.000Z',
        updatedAt: '2026-09-01T10:05:00.000Z',
      },
    });
  });
});

describe('PescadorPage', () => {
  it('moves a capture through review, approval and offer creation using persisted API transitions', async () => {
    render(
      <MemoryRouter>
        <PescadorPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Pescador' })).toBeInTheDocument();
    expect(screen.getAllByText('Rio de Janeiro com Praia Palace').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Aguardando revisão').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Enviar para revisão' }));
    await waitFor(() => expect(api.reviewCapture).toHaveBeenCalledWith('capture-1'));

    await screen.findAllByText('Em revisão');
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }));
    await waitFor(() => expect(api.approveCapture).toHaveBeenCalledWith('capture-1'));

    await screen.findAllByText('Aprovada');
    fireEvent.click(screen.getByRole('button', { name: 'Criar oferta' }));
    await waitFor(() => expect(api.publishCapture).toHaveBeenCalledWith('capture-1'));

    await screen.findByRole('link', { name: /Ver oferta/i });
  });

  it('shows an honest partial-extraction state and lets the reviewer fill missing fields manually', async () => {
    const { foundPrice: _foundPrice, validUntil: _validUntil, ...capturedOfferWithoutOptional } = capturedOffer;
    vi.mocked(api.listCaptures).mockResolvedValue([
      {
        ...capturedOfferWithoutOptional,
        id: 'capture-2',
        normalizedTitle: 'Falha ao capturar',
        normalizedDescription:
          'Não foi possível extrair os dados automaticamente: fetch failed. Edite manualmente antes de revisar.',
      },
    ]);

    render(
      <MemoryRouter>
        <PescadorPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/A extração automática desta URL falhou/)).toBeInTheDocument();
    expect(screen.getByText('Nenhuma imagem detectada')).toBeInTheDocument();
    expect(screen.getByText(/Campos faltantes antes de aprovar/)).toBeInTheDocument();
  });
});
