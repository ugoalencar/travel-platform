import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TasksPage } from './TasksPage';
import * as api from '../lib/api';
import * as useCurrentUserModule from '../hooks/useCurrentUser';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof api>('../lib/api');
  return {
    ...actual,
    listTasks: vi.fn(),
    updateTask: vi.fn(),
  };
});

vi.mock('../hooks/useCurrentUser', () => ({
  useCurrentUser: vi.fn(),
}));

const pendingTask: api.CommercialTask = {
  id: 'task-1',
  agencyId: 'agency-1',
  customerId: 'customer-1',
  customerName: 'Maria Silva',
  assignedUserId: 'user-1',
  type: 'FOLLOW_UP',
  title: 'Ligar sobre proposta Cancún',
  dueAt: new Date(Date.now() + 3600_000).toISOString(),
  createdBy: 'user-1',
  createdAt: '2026-09-01T10:00:00.000Z',
};

const completedTask: api.CommercialTask = {
  id: 'task-2',
  agencyId: 'agency-1',
  customerId: 'customer-2',
  customerName: 'João Souza',
  assignedUserId: 'user-1',
  type: 'CALL',
  title: 'Confirmar pagamento',
  dueAt: '2026-09-10T10:00:00.000Z',
  completedAt: '2026-09-10T12:00:00.000Z',
  createdBy: 'user-1',
  createdAt: '2026-09-01T10:00:00.000Z',
};

beforeEach(() => {
  vi.mocked(useCurrentUserModule.useCurrentUser).mockReturnValue({
    user: { userId: 'user-1', agencyId: 'agency-1', role: 'AGENT' },
    loading: false,
  });
  vi.mocked(api.listTasks).mockResolvedValue({ tasks: [pendingTask], total: 1 });
  vi.mocked(api.updateTask).mockResolvedValue({ ...pendingTask, completedAt: new Date().toISOString() });
});

function renderPage() {
  return render(
    <MemoryRouter>
      <TasksPage />
    </MemoryRouter>,
  );
}

describe('TasksPage', () => {
  it('lists tasks assigned to the current user', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Ligar sobre proposta Cancún')).toBeInTheDocument();
    });
    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
  });

  it('completes a pending task via the quick action', async () => {
    renderPage();
    await waitFor(() => screen.getByText('Ligar sobre proposta Cancún'));

    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }));

    await waitFor(() => {
      expect(api.updateTask).toHaveBeenCalledTimes(1);
    });
    const [taskId, input] = vi.mocked(api.updateTask).mock.calls[0] as [string, { completedAt?: string | null }];
    expect(taskId).toBe('task-1');
    expect(typeof input.completedAt).toBe('string');
  });

  it('shows an empty state when there are no tasks for the current filters', async () => {
    vi.mocked(api.listTasks).mockResolvedValue({ tasks: [], total: 0 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Nenhuma tarefa encontrada')).toBeInTheDocument();
    });
  });

  it('lists a reopen action for completed tasks', async () => {
    vi.mocked(api.listTasks).mockResolvedValue({ tasks: [completedTask], total: 1 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reabrir' })).toBeInTheDocument();
    });
  });
});
