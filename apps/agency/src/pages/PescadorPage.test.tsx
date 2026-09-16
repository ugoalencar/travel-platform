import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PescadorPage } from './PescadorPage';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof api>('../lib/api');
  return {
    ...actual,
    listPescadorSources: vi.fn(),
    createPescadorSource: vi.fn(),
    deletePescadorSource: vi.fn(),
    listPescadorSearches: vi.fn(),
    runPescadorSearch: vi.fn(),
    deletePescadorSearch: vi.fn(),
    listPescadorSearchResults: vi.fn(),
    deletePescadorSearchResult: vi.fn(),
    publishPescadorSearchResult: vi.fn(),
  };
});

const sourceDecolar: api.PescadorSource = {
  id: 'source-1',
  agencyId: 'agency-1',
  name: 'Decolar',
  urlTemplate: 'https://decolar.example/busca?destino={destination}&ida={departureDate}',
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
};

const search1: api.PescadorSearch = {
  id: 'search-1',
  agencyId: 'agency-1',
  destination: 'Cancún, México',
  departureDate: '2026-11-10T00:00:00.000Z',
  resultsLimit: 5,
  createdAt: '2026-09-01T10:00:00.000Z',
};

const result1: api.PescadorSearchResult = {
  id: 'result-1',
  agencyId: 'agency-1',
  searchId: 'search-1',
  sourceId: 'source-1',
  sourceName: 'Decolar',
  targetUrl: 'https://decolar.example/busca?destino=Cancun&ida=2026-11-10',
  title: 'Cancún tudo incluído',
  description: 'Pacote aéreo + hotel',
  price: 3200,
  currency: 'BRL',
  createdAt: '2026-09-01T10:00:05.000Z',
};

beforeEach(() => {
  let results = [result1];
  vi.mocked(api.listPescadorSources).mockResolvedValue([sourceDecolar]);
  vi.mocked(api.createPescadorSource).mockResolvedValue(sourceDecolar);
  vi.mocked(api.deletePescadorSource).mockResolvedValue(undefined);
  vi.mocked(api.listPescadorSearches).mockImplementation(() => Promise.resolve([search1]));
  vi.mocked(api.runPescadorSearch).mockResolvedValue({ search: search1, results });
  vi.mocked(api.deletePescadorSearch).mockResolvedValue(undefined);
  vi.mocked(api.listPescadorSearchResults).mockImplementation(() => Promise.resolve(results));
  vi.mocked(api.deletePescadorSearchResult).mockImplementation((id) => {
    results = results.filter((r) => r.id !== id);
    return Promise.resolve(undefined);
  });
  vi.mocked(api.publishPescadorSearchResult).mockImplementation((id) => {
    const published = { ...results.find((r) => r.id === id)!, publishedOfferId: 'offer-1' };
    results = results.map((r) => (r.id === id ? published : r));
    return Promise.resolve({
      result: published,
      offer: {
        id: 'offer-1',
        agencyId: 'agency-1',
        name: 'Cancún tudo incluído',
        description: 'Pacote aéreo + hotel',
        price: 3200,
        status: 'ACTIVE',
        createdAt: '2026-09-01T10:05:00.000Z',
        updatedAt: '2026-09-01T10:05:00.000Z',
      },
    });
  });
});

describe('PescadorPage', () => {
  it('lists registered sources and lets the agent register a new one', async () => {
    render(
      <MemoryRouter>
        <PescadorPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Pescador' })).toBeInTheDocument();
    expect(await screen.findByText('Decolar')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Nome (ex: Decolar)'), { target: { value: 'CVC' } });
    fireEvent.change(
      screen.getByPlaceholderText('https://exemplo.com/busca?destino={destination}&ida={departureDate}'),
      { target: { value: 'https://cvc.example/busca?destino={destination}' } },
    );
    fireEvent.click(screen.getByRole('button', { name: /Adicionar/ }));

    await waitFor(() =>
      expect(api.createPescadorSource).toHaveBeenCalledWith({
        name: 'CVC',
        urlTemplate: 'https://cvc.example/busca?destino={destination}',
      }),
    );
  });

  it('runs a search and shows the resulting cards, allowing publish and delete', async () => {
    render(
      <MemoryRouter>
        <PescadorPage />
      </MemoryRouter>,
    );

    await screen.findByText('Decolar');

    fireEvent.change(screen.getByPlaceholderText('Ex: Cancún, México'), {
      target: { value: 'Cancún, México' },
    });
    const dateInputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0]!, { target: { value: '2026-11-10' } });
    fireEvent.click(screen.getByRole('button', { name: /Buscar/ }));

    await waitFor(() => expect(api.runPescadorSearch).toHaveBeenCalled());
    expect(await screen.findByText('Cancún tudo incluído')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Criar oferta' }));
    await waitFor(() => expect(api.publishPescadorSearchResult).toHaveBeenCalledWith('result-1'));
    await screen.findByRole('link', { name: /Ver oferta/i });
  });

  it('deletes a search result since results are not a repository', async () => {
    render(
      <MemoryRouter>
        <PescadorPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Cancún tudo incluído')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remover resultado' }));

    await waitFor(() => expect(api.deletePescadorSearchResult).toHaveBeenCalledWith('result-1'));
    await waitFor(() => expect(screen.queryByText('Cancún tudo incluído')).not.toBeInTheDocument());
  });
});
