# Acessibilidade

## WCAG 2.1 Nível AA

### 1. Texto Alternativo

```tsx
// Imagens devem ter alt
<img src="photo.jpg" alt="Foto do cliente João Silva" />

// Ícones decorativos
<Icon aria-hidden="true" />

// Ícones com ação
<button aria-label="Excluir cliente">
  <TrashIcon />
</button>
```

### 2. Navegação por Teclado

```tsx
// Todos interativos acessíveis por Tab
<button>Botão</button>
<a href="#">Link</a>
<input type="text" />

// Focus visible
:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

// Skip link
<a href="#main-content" className="skip-link">
  Pular para conteúdo principal
</a>
```

### 3. Contraste

| Elemento | Contraste mínimo |
|----------|------------------|
| Texto normal | 4.5:1 |
| Texto grande | 3:1 |
| UI components | 3:1 |

### 4. Formulários

```tsx
// Labels associados
<label htmlFor="email">Email</label>
<input id="email" type="email" />

// Mensagens de erro
<input aria-describedby="email-error" />
<span id="email-error" role="alert">
  Email inválido
</span>

// Campos obrigatórios
<input aria-required="true" />
<label>Email <span aria-hidden="true">*</span></label>
```

### 5. Roles ARIA

```tsx
// Alertas
<div role="alert">Erro ao salvar</div>

// Modais
<div role="dialog" aria-modal="true" aria-labelledby="title">
  <h2 id="title">Título</h2>
</div>

// Loading
<div role="status" aria-live="polite">
  Carregando...
</div>

// Tabelas
<table aria-label="Lista de clientes">
  <caption>Clientes da agência</caption>
</table>
```

### 6. Cores

- Nunca usar cor como única indicação
- Texto sempre visível (contraste)
- Estados: hover, focus, disabled

### 7. Responsividade

- Mobile first
- Touch targets: mínimo 44x44px
- Zoom até 200% sem quebra

## Checklist

- [ ] Todas imagens com alt
- [ ] Navegação por teclado funciona
- [ ] Focus visible em todos interativos
- [ ] Contraste mínimo 4.5:1
- [ ] Labels associados a inputs
- [ ] Mensagens de erro acessíveis
- [ ] Modais com focus trap
- [ ] Skip link presente
- [ ] ARIA roles corretos
- [ ] Teste com screen reader
