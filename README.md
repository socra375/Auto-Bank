# Auto-Bank

Finanzas personales en DOP y USD (Next.js 15, TypeScript estricto, Tailwind v4). Estado: Etapa 2 (shell y sistema de diseño); sin base de datos, autenticación ni datos de ejemplo.

## Requisitos
Node 22 (`.nvmrc`) y npm.

## Comandos
```
npm install
npm run dev        # http://localhost:3000
npm run lint
npm run typecheck
npm test
npm run build
```

## Estructura
- `src/app/(app)/*`: una ruta por sección, con `EmptyState` honesto.
- `src/components/shell`: sidebar, navegación móvil, botón/panel de Eddie.
- `src/components/states`: `EmptyState`, `LoadingState`, `ErrorState`.
- `src/lib/money`: dinero en centavos (`bigint`), por moneda (DOP/USD), nunca suma monedas distintas.
- `src/styles/globals.css`: tokens de diseño (claro y `.dark`).

Variables de entorno: ver `.env.example` (solo nombres).
