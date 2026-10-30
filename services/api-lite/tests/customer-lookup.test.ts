import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLiteFixture, FIXTURE_PASSWORD, type LiteFixture } from './helpers/fixture';

const CPF_ANA = '529.982.247-25';
const CPF_BRUNO = '111.444.777-35';

interface LookupItem {
  id: string;
  name: string;
  cpf_masked: string | null;
  birth_date: string | null;
  status: string;
}

describe('Travel Lite customer lookup (Onda A, Frente 1)', () => {
  let lite: LiteFixture;
  let staffToken: string;
  let masterToken: string;
  let tenantBToken: string;

  beforeAll(async () => {
    lite = await createLiteFixture();
    staffToken = await lite.login('tenant-a', 'staff@a.test');
    masterToken = await lite.login('tenant-a', 'master@a.test');
    tenantBToken = await lite.login('tenant-b', 'staff@b.test');

    await create(staffToken, { name: 'Ana Souza', cpf: CPF_ANA });
    await create(staffToken, { name: 'Ana Lima' });
    await create(staffToken, { name: 'Bruno Costa', cpf: CPF_BRUNO });
    await create(tenantBToken, { name: 'Ana de Outra Agência' });
  });

  afterAll(async () => {
    await lite?.close();
  });

  function create(token: string, payload: Record<string, unknown>) {
    return lite.app.inject({ method: 'POST', url: '/customers', headers: lite.headers(token), payload });
  }

  function lookup(token: string, query: string) {
    return lite.app.inject({
      method: 'GET',
      url: `/customers/lookup?${query}`,
      headers: lite.headers(token),
    });
  }

  function names(items: LookupItem[]): string[] {
    return items.map((item) => item.name);
  }

  it('matches a partial name, ordered by name, and returns only the minimal shape', async () => {
    const response = await lookup(staffToken, 'q=ana');

    expect(response.statusCode).toBe(200);
    const { items } = response.json<{ items: LookupItem[] }>();
    expect(names(items)).toEqual(['Ana Lima', 'Ana Souza']);
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(['birth_date', 'cpf_masked', 'id', 'name', 'status']);
    }
    expect(response.body).not.toContain('52998224725');
    expect(items.find((item) => item.name === 'Ana Souza')?.cpf_masked).toBe('***.982.247-**');
  });

  it('finds a customer by a CPF typed with the mask', async () => {
    const { items } = (await lookup(staffToken, 'q=529.982.247-25')).json<{ items: LookupItem[] }>();

    expect(names(items)).toEqual(['Ana Souza']);
  });

  it('finds a customer by a CPF typed as plain digits', async () => {
    const { items } = (await lookup(staffToken, 'q=52998224725')).json<{ items: LookupItem[] }>();

    expect(names(items)).toEqual(['Ana Souza']);
  });

  it('finds a customer by a CPF pasted with spaces around and between the groups', async () => {
    const { items } = (await lookup(staffToken, 'q=%20%20529%20982%20247%2025%20%20')).json<{
      items: LookupItem[];
    }>();

    expect(names(items)).toEqual(['Ana Souza']);
  });

  it('matches a CPF prefix of at least four digits', async () => {
    const { items } = (await lookup(staffToken, 'q=5299')).json<{ items: LookupItem[] }>();

    expect(names(items)).toEqual(['Ana Souza']);
  });

  it('does not return customers of another tenant', async () => {
    const byName = (await lookup(staffToken, 'q=Outra')).json<{ items: LookupItem[] }>();
    expect(byName.items).toEqual([]);

    const reverse = (await lookup(tenantBToken, 'q=Souza')).json<{ items: LookupItem[] }>();
    expect(reverse.items).toEqual([]);

    const tenantBOwn = (await lookup(tenantBToken, 'q=Outra')).json<{ items: LookupItem[] }>();
    expect(names(tenantBOwn.items)).toEqual(['Ana de Outra Agência']);
  });

  it('rejects a query shorter than two characters with 400', async () => {
    expect((await lookup(staffToken, 'q=a')).statusCode).toBe(400);
    expect((await lookup(staffToken, 'q=%20%20')).statusCode).toBe(400);
  });

  it('rejects a missing q with 400', async () => {
    expect((await lookup(staffToken, 'limit=5')).statusCode).toBe(400);
  });

  it('rejects a repeated q with 400 instead of failing inside the handler', async () => {
    const response = await lookup(staffToken, 'q=Ana&q=Bruno');
    expect(response.statusCode).toBe(400);
  });

  it('clamps the limit to 20 and defaults it to 10', async () => {
    for (let index = 1; index <= 25; index += 1) {
      await create(staffToken, { name: `Lote ${String(index).padStart(2, '0')}` });
    }

    const capped = (await lookup(staffToken, 'q=Lote&limit=500')).json<{ items: LookupItem[] }>();
    expect(capped.items).toHaveLength(20);

    const defaulted = (await lookup(staffToken, 'q=Lote')).json<{ items: LookupItem[] }>();
    expect(defaulted.items).toHaveLength(10);
  });

  it('rejects a non-numeric limit with 400', async () => {
    expect((await lookup(staffToken, 'q=Ana&limit=muitos')).statusCode).toBe(400);
  });

  it('answers 403 to a user whose customer read permission was revoked', async () => {
    const email = 'sem-leitura@a.test';
    const created = await lite.app.inject({
      method: 'POST',
      url: '/users',
      headers: lite.headers(masterToken),
      payload: { name: 'Sem Leitura', email, password: FIXTURE_PASSWORD, role: 'SELLER' },
    });
    const userId = created.json<{ user: { id: string } }>().user.id;
    const revoked = await lite.app.inject({
      method: 'PUT',
      url: `/users/${userId}/permissions`,
      headers: lite.headers(masterToken),
      payload: { overrides: [{ permission: 'customers.read_own', effect: 'REVOKE' }] },
    });
    expect(revoked.statusCode).toBe(200);

    const token = await lite.login('tenant-a', email);
    expect((await lookup(token, 'q=Ana')).statusCode).toBe(403);
  });

  it('returns no customers, not an error, to a seller login without a linked seller', async () => {
    const email = 'vendedor-sem-vinculo@a.test';
    await lite.app.inject({
      method: 'POST',
      url: '/users',
      headers: lite.headers(masterToken),
      payload: { name: 'Sem Vínculo', email, password: FIXTURE_PASSWORD, role: 'SELLER' },
    });

    const token = await lite.login('tenant-a', email);
    const response = await lookup(token, 'q=Ana');
    expect(response.statusCode).toBe(200);
    expect(response.json<{ items: LookupItem[] }>().items).toEqual([]);
  });

  it('applies the same CPF normalization to the existing customer list search', async () => {
    const response = await lite.app.inject({
      method: 'GET',
      url: '/customers?search=529.982.247-25',
      headers: lite.headers(staffToken),
    });

    expect(response.statusCode).toBe(200);
    const { items } = response.json<{ items: Array<{ name: string }> }>();
    expect(items.map((item) => item.name)).toEqual(['Ana Souza']);
  });
});
