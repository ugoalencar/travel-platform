# Design System

## Cores

```css
:root {
  /* Primárias */
  --color-primary: #2563EB;
  --color-primary-hover: #1D4ED8;
  --color-primary-light: #DBEAFE;

  /* Neutras */
  --color-white: #FFFFFF;
  --color-gray-50: #F9FAFB;
  --color-gray-100: #F3F4F6;
  --color-gray-200: #E5E7EB;
  --color-gray-300: #D1D5DB;
  --color-gray-400: #9CA3AF;
  --color-gray-500: #6B7280;
  --color-gray-600: #4B5563;
  --color-gray-700: #374151;
  --color-gray-800: #1F2937;
  --color-gray-900: #111827;

  /* Status */
  --color-success: #10B981;
  --color-warning: #F59E0B;
  --color-error: #EF4444;
  --color-info: #3B82F6;
}
```

## Tipografia

```css
/* Fonte */
font-family: 'Inter', -apple-system, sans-serif;

/* Escala */
--text-xs: 0.75rem;    /* 12px */
--text-sm: 0.875rem;   /* 14px */
--text-base: 1rem;     /* 16px */
--text-lg: 1.125rem;   /* 18px */
--text-xl: 1.25rem;    /* 20px */
--text-2xl: 1.5rem;    /* 24px */
--text-3xl: 1.875rem;  /* 30px */

/* Pesos */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
```

## Espaçamento

```css
--space-1: 0.25rem;   /* 4px */
--space-2: 0.5rem;    /* 8px */
--space-3: 0.75rem;   /* 12px */
--space-4: 1rem;      /* 16px */
--space-5: 1.25rem;   /* 20px */
--space-6: 1.5rem;    /* 24px */
--space-8: 2rem;      /* 32px */
--space-10: 2.5rem;   /* 40px */
--space-12: 3rem;     /* 48px */
```

## Bordas

```css
--radius-sm: 0.25rem;  /* 4px */
--radius-md: 0.375rem; /* 6px */
--radius-lg: 0.5rem;   /* 8px */
--radius-xl: 0.75rem;  /* 12px */
--radius-full: 9999px;

--border: 1px solid var(--color-gray-200);
```

## Sombras

```css
--shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
--shadow-md: 0 4px 6px rgba(0,0,0,0.1);
--shadow-lg: 0 10px 15px rgba(0,0,0,0.1);
--shadow-xl: 0 20px 25px rgba(0,0,0,0.1);
```

## Componentes

### Botão

```tsx
<button className="btn btn-primary">Texto</button>
<button className="btn btn-secondary">Texto</button>
<button className="btn btn-danger">Texto</button>
<button className="btn btn-ghost">Texto</button>
```

### Input

```tsx
<div className="input-group">
  <label htmlFor="email">Email</label>
  <input type="email" id="email" className="input" />
  <span className="input-error">Email inválido</span>
</div>
```

### Card

```tsx
<div className="card">
  <div className="card-header">Título</div>
  <div className="card-body">Conteúdo</div>
  <div className="card-footer">Ações</div>
</div>
```

### Tabela

```tsx
<table className="table">
  <thead>
    <tr>
      <th>Nome</th>
      <th>Email</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>João</td>
      <td>joao@email.com</td>
    </tr>
  </tbody>
</table>
```

## Ícones

Usar Lucide React:

```tsx
import { User, Mail, Phone } from 'lucide-react';

<User size={20} />
<Mail size={20} className="text-gray-500" />
```
