# Gerenciamento de Estado

## Estratégia

| Estado | Solução |
|--------|---------|
| Server state | React Query (TanStack Query) |
| UI state | React useState/useReducer |
| Form state | React Hook Form + Zod |
| Global state | Context API (mínimo) |

## Server State (React Query)

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Listar clientes
function useCustomers() {
  return useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get('/customers'),
  });
}

// Criar cliente
function useCreateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => api.post('/customers', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}
```

## Form State (React Hook Form)

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
});

function CustomerForm() {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  const onSubmit = (data) => {
    console.log(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('name')} />
      {errors.name && <span>{errors.name.message}</span>}

      <input {...register('email')} />
      {errors.email && <span>{errors.email.message}</span>}

      <button type="submit">Salvar</button>
    </form>
  );
}
```

## UI State

```tsx
// Simple state
const [isOpen, setIsOpen] = useState(false);
const [selectedId, setSelectedId] = useState<string | null>(null);

// Complex state
const [state, dispatch] = useReducer(reducer, initialState);
```

## Context API

```tsx
// Apenas para estado global mínimo
const AuthContext = createContext<AuthContextType | null>(null);

function AuthProvider({ children }) {
  const [user, setUser] = useState<User | null>(null);

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
```

## Padrões

### Nunca

```tsx
// ❌ Estado derivado
const [filtered, setFiltered] = useState([]);

useEffect(() => {
  setFiltered(data.filter(item => item.active));
}, [data]);
```

### Sempre

```tsx
// ✅ Estado derivado
const filtered = useMemo(
  () => data.filter(item => item.active),
  [data]
);
```

### Cache

```tsx
// React Query gerencia cache automaticamente
// Stale time padrão: 30 segundos
// Garbage collection: 5 minutos
```
