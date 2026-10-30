# Marca: Travel Plataforma (logo Bússola)

Decisão do dono do produto em 2026-10-05: logo B (Bússola). Nome público: **Travel Plataforma** (igual ao domínio; mercado Brasil).

## Elementos
- Ícone: quadrado reto com agulha de bússola (triângulo superior claro, inferior azul-marinho).
- Nome: "TRAVEL / PLATAFORMA" em letras geométricas de traço único, desenhadas como caminhos SVG (não dependem de fonte instalada).
- Cores: cobalto `#1554d1`, azul-marinho `#0f2a4a`, branco. Cantos retos.

## Arquivos (`apps/marketing/public/brand/`)
| Arquivo | Uso |
| --- | --- |
| `logo-completa.svg` | Fundo claro |
| `logo-completa-escura.svg` | Fundo escuro (nome branco) |
| `icone.svg` / `icone-escuro.svg` | Só o ícone (claro / escuro) |
| `../favicon.svg` | Favicon do site (= `icone.svg`) |

No React: `apps/marketing/src/components/Logo.tsx` (`tone="light" | "dark"`, `iconOnly`).

## Limites
- Traço do nome é stroke; para impressão em gráfica, expandir contornos no editor vetorial.
- Ainda não aplicada em `apps/agency`, `apps/customer`, `apps/platform-admin`, e-mails e `apps/travel-lite`.
