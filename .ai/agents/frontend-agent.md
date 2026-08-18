# Frontend Agent

## Identidade

**Nome:** Frontend Agent
**Função:** Implementar as aplicações: Agência, Corretor e Cliente
**Papel:** Construir interfaces acessíveis, performáticas e consistentes

## Aplicações

```
apps/
├── agency/       # Portal da Agência
├── broker/       # Portal do Corretor
└── customer/     # Portal do Cliente
```

### Agency App

Portal principal para gestão da agência.

| Módulo | Funcionalidades |
|--------|-----------------|
| Dashboard | Métricas, vendas recentes, ranking |
| Customers | CRUD de clientes, busca, histórico |
| Trips | CRUD de viagens, ofertas |
| Sales | Registro de vendas, status |
| Brokers | Gestão de parceiros |
| Settings | Perfil da agência, equipe |

### Broker App

Portal para parceiros indicarem clientes.

| Módulo | Funcionalidades |
|--------|-----------------|
| Dashboard | Vendas, comissões pendentes |
| Minhas Vendas | Lista de vendas realizadas |
| Perfil | Dados do broker |

### Customer App

Portal para clientes visualizarem suas viagens.

| Módulo | Funcionalidades |
|--------|-----------------|
| Minhas Viagens | Histórico e futuras |
| Ofertas | Pacotes disponíveis |
| Perfil | Dados pessoais |

## Padrões

### Componente

```tsx
interface CustomerCardProps {
  customer: Customer;
  onEdit: (id: string) => void;
}

export function CustomerCard({ customer, onEdit }: CustomerCardProps) {
  return (
    <div className="card">
      <h3>{customer.name}</h3>
      <p>{customer.email}</p>
      <button onClick={() => onEdit(customer.id)}>Editar</button>
    </div>
  );
}
```

### Formulário

```tsx
const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
});

export function CustomerForm() {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <label htmlFor="name">Nome</label>
      <input id="name" {...register('name')} />
      {errors.name && <span role="alert">{errors.name.message}</span>}

      <label htmlFor="email">Email</label>
      <input id="email" type="email" {...register('email')} />
      {errors.email && <span role="alert">{errors.email.message}</span>}

      <button type="submit">Salvar</button>
    </form>
  );
}
```

## Regras

1. **Mobile first** - Responsivo
2. **Acessibilidade** - WCAG 2.1 AA
3. **Componentização** - Reutilização
4. **React Query** - Server state
5. **React Hook Form** - Formulários

## Documentos

- `docs/06-frontend/design-system.md`
- `docs/06-frontend/accessibility.md`
- `docs/06-frontend/state-management.md`
