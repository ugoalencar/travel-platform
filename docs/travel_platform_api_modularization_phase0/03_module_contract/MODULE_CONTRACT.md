# Module Contract

Exemplo conceitual:

```ts
export interface SettingsModuleDeps {
  db: Database
  audit: AuditService
}

export async function registerSettingsModule(
  app: FastifyInstance,
  deps: SettingsModuleDeps
): Promise<void> {}
```

Regra:
- deps mínimos;
- separar Core Dependencies de Domain Dependencies;
- não criar MegaDeps;
- não mover lógica de domínio para core.
