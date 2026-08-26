import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AutomationsPage } from './AutomationsPage';
import * as api from '../../lib/offerGrowthApi';
import { ApiError } from '../../lib/api';

vi.mock('../../lib/offerGrowthApi');

function renderPage() {
  render(
    <MemoryRouter>
      <AutomationsPage />
    </MemoryRouter>,
  );
}

describe('AutomationsPage', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listAutomations).mockResolvedValue([]);
    vi.mocked(api.listCoupons).mockResolvedValue([]);
    vi.mocked(api.createAutomation).mockResolvedValue({
      id: 'auto-1',
      agencyId: 'agency-a',
      name: 'Comente CANCUN',
      trigger: 'COMMENT_KEYWORD',
      status: 'DRAFT',
      caseSensitive: false,
      actions: [],
      cooldownSeconds: 0,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    });
  });

  it('configures the "Comente CANCUN e receba um cupom" scenario end-to-end through the real business-language form', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Nova automação' }));

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Comente CANCUN' } });
    fireEvent.change(screen.getByLabelText('Palavra-chave'), { target: { value: 'CANCUN' } });
    fireEvent.change(screen.getByLabelText('Resposta pública'), {
      target: { value: 'Enviamos os detalhes no privado!' },
    });
    fireEvent.change(screen.getByLabelText('Mensagem privada'), {
      target: { value: 'Use o cupom CANCUN300.' },
    });
    fireEvent.click(screen.getByLabelText('Criar um novo cupom automaticamente'));
    fireEvent.change(screen.getByLabelText('Nome do novo cupom'), {
      target: { value: 'Desconto Cancun' },
    });
    fireEvent.change(screen.getByLabelText('Valor do novo cupom'), { target: { value: '300' } });
    fireEvent.click(screen.getByLabelText('Criar oportunidade comercial automaticamente'));

    fireEvent.click(screen.getByRole('button', { name: 'Criar automação' }));

    await vi.waitFor(() =>
      expect(api.createAutomation).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Comente CANCUN',
          trigger: 'COMMENT_KEYWORD',
          keyword: 'CANCUN',
          caseSensitive: false,
          cooldownSeconds: 0,
          actions: expect.arrayContaining([
            expect.objectContaining({ type: 'PUBLIC_REPLY', message: 'Enviamos os detalhes no privado!' }),
            expect.objectContaining({ type: 'PRIVATE_MESSAGE', message: 'Use o cupom CANCUN300.' }),
            expect.objectContaining({ type: 'CREATE_COUPON' }),
            expect.objectContaining({ type: 'SEND_COUPON' }),
            expect.objectContaining({ type: 'CREATE_OPPORTUNITY' }),
          ]) as unknown,
        }),
      ),
    );
  });

  it('shows the friendly entitlement-disabled message, not a generic error', async () => {
    vi.mocked(api.listAutomations).mockRejectedValue(new ApiError('Forbidden', 'FORBIDDEN', 403));
    renderPage();

    expect(await screen.findByRole('status')).toHaveTextContent(/não habilitado/i);
  });
});
