import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { CustomerCombobox } from '../components/customers/CustomerCombobox';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import {
  ApiError,
  createSale,
  getSaleCategoryForm,
  listSaleCategories,
  listSuppliers,
  type SaleCategory,
  type SaleCategoryForm,
  type Supplier,
} from '../lib/api';
import { buildSaleFormPayload, configurableFields, missingRequired } from '../lib/saleFormFields';
import { parseMoneyInput } from '../lib/parseMoneyInput';

type FormLoad =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; form: SaleCategoryForm };

type SaleItemDraft = {
  description: string;
  supplierId: string;
  qty: string;
  unitPrice: string;
  unitCost: string;
  taxes: string;
  fees: string;
  discount: string;
};

const emptySaleItem = (): SaleItemDraft => ({
  description: '', supplierId: '', qty: '1', unitPrice: '', unitCost: '', taxes: '', fees: '', discount: '',
});

export function NewSalePage() {
  const navigate = useNavigate();
  const [customerId, setCustomerId] = useState('');
  const [categories, setCategories] = useState<SaleCategory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<SaleItemDraft[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [formLoad, setFormLoad] = useState<FormLoad>({ status: 'none' });
  const [values, setValues] = useState<Record<string, string>>({});
  const [amount, setAmount] = useState('');
  const [discount, setDiscount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // only the response for the category currently selected may fill the form
  const categoryRequestRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    listSaleCategories()
      .then((list) => {
        if (!cancelled) setCategories(list);
      })
      .catch(() => {
        if (!cancelled) setError('Não foi possível carregar as categorias de venda.');
      });
    listSuppliers()
      .then((list) => {
        if (!cancelled) setSuppliers(list.filter((supplier) => supplier.active));
      })
      .catch(() => {
        if (!cancelled) setError('Não foi possível carregar os fornecedores.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function chooseCategory(id: string) {
    const requestId = ++categoryRequestRef.current;
    setCategoryId(id);
    setError(null);
    // category-specific values never leak into a different category's form
    setValues((current) => ({ sale_date: current.sale_date ?? '' }));
    if (id === '') {
      setFormLoad({ status: 'none' });
      return;
    }
    setFormLoad({ status: 'loading' });
    getSaleCategoryForm(id)
      .then((form) => {
        if (categoryRequestRef.current === requestId) setFormLoad({ status: 'ready', form });
      })
      .catch((err: unknown) => {
        if (categoryRequestRef.current !== requestId) return;
        setFormLoad({
          status: 'error',
          message: err instanceof ApiError ? err.message : 'Não foi possível carregar o formulário da categoria.',
        });
      });
  }

  function setValue(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function updateItem(index: number, key: keyof SaleItemDraft, value: string) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  }

  function itemMoney(value: string, label: string, allowEmpty = true): number | undefined | null {
    if (allowEmpty && value.trim() === '') return undefined;
    const parsed = parseMoneyInput(value);
    if (parsed === null) {
      setError(`${label} inválido.`);
      return null;
    }
    return parsed;
  }

  const itemTotals = items.map((item) => {
    const qty = Number(item.qty);
    const unitPrice = parseMoneyInput(item.unitPrice) ?? 0;
    const discountValue = parseMoneyInput(item.discount) ?? 0;
    const taxesValue = parseMoneyInput(item.taxes) ?? 0;
    const feesValue = parseMoneyInput(item.fees) ?? 0;
    return Math.round((qty * unitPrice - discountValue + taxesValue + feesValue) * 100) / 100;
  });
  const itemsTotal = Math.round(itemTotals.reduce((sum, value) => sum + value, 0) * 100) / 100;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (customerId === '') {
      setError('Selecione o cliente.');
      return;
    }
    const saleItems = [];
    if (items.length > 0) {
      for (const [index, item] of items.entries()) {
        const unitPrice = itemMoney(item.unitPrice, `Valor unitário do item ${index + 1}`, false);
        if (unitPrice === null || unitPrice === undefined) return;
        if (item.description.trim() === '') {
          setError(`Informe a descrição do item ${index + 1}.`);
          return;
        }
        const qty = Number(item.qty);
        if (!Number.isFinite(qty) || qty <= 0 || Number(qty.toFixed(2)) !== qty) {
          setError(`A quantidade do item ${index + 1} deve ser positiva e ter até duas casas decimais.`);
          return;
        }
        const unitCost = itemMoney(item.unitCost, `Custo unitário do item ${index + 1}`);
        const taxes = itemMoney(item.taxes, `Taxas do item ${index + 1}`);
        const fees = itemMoney(item.fees, `Tarifas extras do item ${index + 1}`);
        const itemDiscount = itemMoney(item.discount, `Desconto do item ${index + 1}`);
        if (unitCost === null || taxes === null || fees === null || itemDiscount === null) return;
        saleItems.push({
          description: item.description.trim(),
          ...(item.supplierId ? { supplierId: item.supplierId } : {}),
          qty,
          unitPrice,
          ...(unitCost !== undefined ? { unitCost } : {}),
          ...(taxes !== undefined ? { taxes } : {}),
          ...(fees !== undefined ? { fees } : {}),
          ...(itemDiscount !== undefined ? { discount: itemDiscount } : {}),
        });
      }
    }
    const gross = saleItems.length > 0 ? itemsTotal : parseMoneyInput(amount);
    if (gross === null) {
      setError('Informe o valor da venda (ex.: 2300,00).');
      return;
    }
    const discountValue = discount.trim() === '' ? undefined : parseMoneyInput(discount);
    if (discountValue === null) {
      setError('Desconto inválido (ex.: 150,00).');
      return;
    }

    const fields = formLoad.status === 'ready' ? formLoad.form.fields : [];
    if (categoryId !== '' && formLoad.status !== 'ready') {
      setError('Aguarde o formulário da categoria carregar.');
      return;
    }
    const missing = missingRequired(fields, values);
    if (missing.length > 0) {
      setError(`Preencha: ${missing.join(', ')}.`);
      return;
    }

    setSaving(true);
    try {
      const sale = await createSale({
        customerId,
        amount: gross,
        ...(discountValue !== undefined ? { discount: discountValue } : {}),
        ...(notes.trim() !== '' ? { notes: notes.trim() } : {}),
        ...(categoryId !== '' ? { categoryId } : {}),
        ...buildSaleFormPayload(fields, values),
        ...(saleItems.length > 0 ? { items: saleItems } : {}),
      });
      void navigate(`/sales/${sale.id}`);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível registrar a venda.');
    } finally {
      setSaving(false);
    }
  }

  const extraFields = formLoad.status === 'ready' ? configurableFields(formLoad.form.fields) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nova venda"
        description="Registre a venda. Os campos da viagem dependem da categoria escolhida."
        breadcrumbs={[{ label: 'Vendas', to: '/sales' }, { label: 'Nova venda' }]}
      />
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Venda</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <CustomerCombobox value={customerId} onSelect={(customer) => setCustomerId(customer?.id ?? '')} />
            <div className="flex flex-col gap-1">
              <label htmlFor="sale-category" className="text-xs font-medium text-slate-700">Categoria</label>
              <Select id="sale-category" value={categoryId} onChange={(e) => chooseCategory(e.target.value)}>
                <option value="">Sem categoria</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="sale-date" className="text-xs font-medium text-slate-700">Data da venda</label>
              <Input id="sale-date" type="date" value={values.sale_date ?? ''} onChange={(e) => setValue('sale_date', e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="sale-amount" className="text-xs font-medium text-slate-700">Valor bruto (R$)</label>
              <Input id="sale-amount" inputMode="decimal" value={items.length > 0 ? itemsTotal.toFixed(2).replace('.', ',') : amount} onChange={(e) => setAmount(e.target.value)} readOnly={items.length > 0} />
              {items.length > 0 && <span className="text-xs text-slate-500">Soma calculada dos itens; para alterar, edite os valores abaixo.</span>}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="sale-discount" className="text-xs font-medium text-slate-700">Desconto (R$)</label>
              <Input id="sale-discount" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <label htmlFor="sale-notes" className="text-xs font-medium text-slate-700">Observações</label>
              <Textarea id="sale-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Itens da venda</CardTitle>
              <p className="mt-1 text-sm text-slate-600">Adicione produtos e serviços de fornecedores diferentes. Todos os itens serão salvos junto com a venda.</p>
            </div>
            <Button type="button" variant="outline" onClick={() => setItems((current) => [...current, emptySaleItem()])}>Adicionar item</Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.length === 0 && <p className="text-sm text-slate-500">Nenhum item adicionado. O valor bruto pode ser informado acima para manter o fluxo simples.</p>}
            {items.map((item, index) => (
              <section key={index} aria-label={`Item ${index + 1}`} className="rounded-lg border border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-800">Item {index + 1}</h3>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remover</Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <label htmlFor={`sale-item-description-${index}`} className="text-xs font-medium text-slate-700">Descrição do item {index + 1}</label>
                    <Input id={`sale-item-description-${index}`} value={item.description} onChange={(event) => updateItem(index, 'description', event.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <label htmlFor={`sale-item-supplier-${index}`} className="text-xs font-medium text-slate-700">Fornecedor do item {index + 1}</label>
                    <Select id={`sale-item-supplier-${index}`} value={item.supplierId} onChange={(event) => updateItem(index, 'supplierId', event.target.value)}>
                      <option value="">Sem fornecedor vinculado</option>
                      {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`sale-item-qty-${index}`} className="text-xs font-medium text-slate-700">Quantidade</label>
                    <Input id={`sale-item-qty-${index}`} type="number" min="0.01" step="0.01" value={item.qty} onChange={(event) => updateItem(index, 'qty', event.target.value)} />
                  </div>
                  {([
                    ['unitPrice', 'Valor unitário'], ['unitCost', 'Custo unitário'], ['taxes', 'Taxas'], ['fees', 'Tarifas extras'], ['discount', 'Desconto do item'],
                  ] as const).map(([key, label]) => (
                    <div key={key} className="flex flex-col gap-1">
                      <label htmlFor={`sale-item-${key}-${index}`} className="text-xs font-medium text-slate-700">{label} do item {index + 1} (R$)</label>
                      <Input id={`sale-item-${key}-${index}`} inputMode="decimal" value={item[key]} onChange={(event) => updateItem(index, key, event.target.value)} />
                    </div>
                  ))}
                  <div className="flex flex-col justify-center rounded-md bg-slate-50 px-3 py-2 text-sm sm:col-span-2">
                    <span className="text-xs text-slate-500">Subtotal do item</span>
                    <strong>R$ {itemTotals[index]?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  </div>
                </div>
              </section>
            ))}
          </CardContent>
        </Card>

        {formLoad.status === 'loading' && <p className="text-sm text-slate-500">Carregando formulário da categoria…</p>}
        {formLoad.status === 'error' && <p role="alert" className="text-sm text-red-600">{formLoad.message}</p>}
        {extraFields.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Dados da categoria</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {extraFields.map((field) => {
                const id = `sale-field-${field.fieldKey}`;
                return (
                  <div key={field.fieldKey} className="flex flex-col gap-1">
                    <label htmlFor={id} className="text-xs font-medium text-slate-700">
                      {field.label}
                      {field.required ? ' *' : ''}
                    </label>
                    <Input
                      id={id}
                      type={field.type === 'date' ? 'date' : field.type === 'integer' ? 'number' : 'text'}
                      min={field.type === 'integer' ? 1 : undefined}
                      aria-required={field.required}
                      value={values[field.fieldKey] ?? ''}
                      onChange={(e) => setValue(field.fieldKey, e.target.value)}
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {error !== null && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>{saving ? 'Registrando…' : 'Registrar venda'}</Button>
        </div>
      </form>
    </div>
  );
}
