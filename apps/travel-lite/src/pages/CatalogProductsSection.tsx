import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { EmptyState, ErrorNote, StatusBadge, SuccessNote } from '../ui';

interface Product {
  id: string;
  name: string;
  category_id: string | null;
  default_supplier_id: string | null;
  active: boolean;
}

interface Option {
  id: string;
  name: string;
}

/** Cadastros › Produtos: a product belongs to a sale category and has a default supplier. */
export function CatalogProductsSection() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [suppliers, setSuppliers] = useState<Option[]>([]);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [productList, categoryList, partyList] = await Promise.all([
        api<{ items: Product[] }>('/catalog-products?include_inactive=true'),
        api<{ items: Option[] }>('/categories'),
        api<{ items: Array<Option & { type: string }> }>('/financial-parties?pageSize=100').catch(() => ({ items: [] })),
      ]);
      setProducts(productList.items);
      setCategories(categoryList.items);
      setSuppliers(partyList.items.filter((party) => party.type === 'SUPPLIER'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    try {
      await api('/catalog-products', {
        method: 'POST',
        body: {
          name: name.trim(),
          ...(categoryId ? { category_id: categoryId } : {}),
          ...(supplierId ? { default_supplier_id: supplierId } : {}),
        },
      });
      setName('');
      setCategoryId('');
      setSupplierId('');
      setNotice('Produto salvo.');
      await load();
    } catch (err) {
      setNotice(null);
      setError(err instanceof Error ? err.message : 'Falha ao salvar');
    }
  }

  async function toggleActive(product: Product): Promise<void> {
    try {
      await api(`/catalog-products/${product.id}`, { method: 'PATCH', body: { active: !product.active } });
      setNotice(product.active ? 'Produto desativado.' : 'Produto ativado.');
      await load();
    } catch (err) {
      setNotice(null);
      setError(err instanceof Error ? err.message : 'Falha ao atualizar');
    }
  }

  const nameOf = (list: Option[], id: string | null) => list.find((item) => item.id === id)?.name ?? '—';

  return (
    <section>
      <h2>Produtos</h2>
      <ErrorNote error={error} />
      <SuccessNote success={notice} />
      <form className="lite-form" onSubmit={(event) => void onSubmit(event)}>
        <label className="field">
          <span>Nome *</span>
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label className="field">
          <span>Categoria</span>
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">Sem categoria</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Fornecedor</span>
          <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
            <option value="">Sem fornecedor</option>
            {suppliers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary">
            Adicionar
          </button>
        </div>
      </form>
      <div className="lite-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Categoria</th>
              <th>Fornecedor</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>{product.name}</td>
                <td>{nameOf(categories, product.category_id)}</td>
                <td>{nameOf(suppliers, product.default_supplier_id)}</td>
                <td>
                  <StatusBadge status={product.active ? 'ACTIVE' : 'INACTIVE'} />
                </td>
                <td>
                  <button type="button" className="btn btn-small" onClick={() => void toggleActive(product)}>
                    {product.active ? 'Desativar' : 'Ativar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.length === 0 ? <EmptyState message="Nenhum produto." /> : null}
      </div>
    </section>
  );
}
