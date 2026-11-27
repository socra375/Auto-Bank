# Auto-Bank: security notes and operator actions (stage 10)

## What the app enforces
- Single owner: every page, server action and route handler calls `requireOwner()`. The first claim needs `OWNER_EMAIL` **and** a verified email.
- Login, sign-up, code verification and code resend are throttled in the DB (`auth_attempts`, 15-minute windows, hashed keys): 5 per IP+email, 20 per IP, 30 per email.
- Idempotency keys are bound to the request payload (`request_hash`); a reused key with other data is rejected (`KEY_REUSED`).
- Headers: nonce-based CSP (`src/proxy.ts`), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS, `frame-ancestors 'none'`, `no-store` on pages and `/api/export/*`.
- CSV export is capped at 10,000 rows; a capped file ends with an `ARCHIVO TRUNCADO` row and the response carries `X-Export-Truncated: true`.

## Neon Auth settings (operator)
- Email verification ON (method OTP, 6-digit code emailed). The app has `/verificar` for it. Links do not work with the shared email provider.
- Close sign-up at the provider once the owner exists (the app already refuses `/registro` after the claim, but the public Neon Auth endpoint stays open otherwise).
- Session cache (`session_data` cookie): 5 minutes. A session revoked upstream can keep working here for up to 5 minutes.
- TOTP/2FA is not available in Neon Auth. Mitigations: strong unique password, verified email, the throttles above.

## Residual risks
- Throttle IP: taken from the first hop of `x-forwarded-for`. On Vercel the platform sets it. Behind another proxy that does not overwrite it, an attacker can forge it and dodge the ip and ip+email counters; the per-email cap (30/15 min) still bounds guessing. The reverse is also true: an attacker who knows the owner's email can lock the owner out for up to 15 minutes with 30 failed tries.
- Neon Auth itself is called server-to-server, so its own upstream limits see the platform egress IP, not the visitor.
- The market and Eddie limiters (`createLimiter`) are in memory, per instance: the effective limit grows with the number of instances. Only the owner can reach them (cost risk only).
- Unknown URLs: the prerendered 404 page has no nonce, so the browser logs CSP errors for its (unneeded) scripts. No data is involved.
- `style-src` allows `'unsafe-inline'`: server-rendered `style=""` attributes (progress bars, category colors) cannot carry a nonce. Scripts are strict (`nonce` + `strict-dynamic`).
- The 5-minute session cache applies to every request, including writes.

## Run the app with a non-owner DB role (operator, NOT applied)
Migrations run as the owner role; the app should connect as a limited role so it cannot `DISABLE TRIGGER`, `ALTER` or `DROP`. Run in the Neon SQL editor as the project owner, then put the new role's pooled connection string in `DATABASE_URL` and keep the owner string only for migrations:

```sql
create role app_runtime login password '<generate in the Neon console>';
grant connect on database neondb to app_runtime;            -- use your database name
grant usage on schema public to app_runtime;
grant select, insert, update, delete on all tables in schema public to app_runtime;
grant usage, select on all sequences in schema public to app_runtime;
grant execute on all functions in schema public to app_runtime;
alter default privileges in schema public grant select, insert, update, delete on tables to app_runtime;
alter default privileges in schema public grant usage, select on sequences to app_runtime;
-- It needs NO access to neon_auth (the app reads sessions through the Neon Auth API) and must not own any table.
```
Ledger tables already reject UPDATE/DELETE through triggers, so the broad DML grant does not weaken them. Re-run the two `grant ... on all` lines after each migration that adds tables if default privileges were not set by the migrating role.

## Backups and restore
- Neon point-in-time restore: 6 hours on this plan (restore to a branch, verify, then promote or copy back).
- Self-service copy: the CSV exports (movements and reports) in the app.
- Optional logical backup (run from a trusted machine, never commit the file): `pg_dump "$DATABASE_URL_OWNER" --format=custom --no-owner --file=autobank-$(date +%F).dump`; restore with `pg_restore --no-owner -d "<new database url>" autobank-YYYY-MM-DD.dump`.

## Pre-launch checklist (names only)
- [ ] `DATABASE_URL` (pooled, `app_runtime` role)
- [ ] `NEON_AUTH_BASE_URL`
- [ ] `NEON_AUTH_COOKIE_SECRET` (32+ random characters)
- [ ] `OWNER_EMAIL`
- [ ] `MARKET_PROVIDER`, `MARKET_API_KEY`, `MARKET_REALTIME` (optional)
- [ ] `AI_GATEWAY_API_KEY`, `EDDIE_MODEL` (optional)
- [ ] Migrations 0001-0010 applied; Neon Auth: email verification ON, sign-up closed after the owner exists
- [ ] Owner registered and verified; `/registro` shows "Registro cerrado"
- [ ] Custom domain: HSTS present in the response, no sibling subdomain that you do not control
