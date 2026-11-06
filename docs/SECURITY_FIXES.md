# Security fixes applied

## Summary

| Metric | Count |
|--------|------:|
| Vulnerabilities addressed in code | 11 |
| Files touched | 18+ |
| Typecheck after fixes | PASS |

## Changes by file

### `src/lib/supabase/middleware.ts`
- **OB-001:** When Supabase env is missing/invalid, still enforce login (or demo cookie) on workspace and `/print` routes instead of allowing anonymous access.

### `src/lib/auth/settings-actions.ts`
- **OB-003:** Require `canEditBrandSettings` before updating `quotation_builder_enabled` in live mode.

### `src/lib/security/authorization.ts` (new)
- Central RBAC helpers: settings, catalog, order operations, payments.

### `src/lib/security/public-token.ts` (new)
- **OB-004:** Cryptographic quote tokens + validation regex.

### `src/lib/orders/build-order-record.ts`
- Uses `createPublicQuoteToken()` for new quotes.

### `src/services/order-operations.ts`
- **OB-005:** Credit notes, refunds, stock adjustments require manager/owner/admin.

### `src/services/data.ts`
- **OB-008:** Order status transitions validated; manager+ only.
- **OB-009:** Server-side manual discount limits by role on `submitOrder`.
- **OB-010:** Payment method whitelist on `recordPayment`.
- **OB-005:** Payment recording role check (staff allowed for POS).
- **OB-011:** Public quote lookup via anon client; reduced columns; token normalization.

### `src/services/quote-actions.ts` / `src/services/quotes.ts`
- Rate limit public quote accept; normalize tokens before RPC.

### `src/lib/security/headers.ts`
- **OB-012:** Baseline Content-Security-Policy (Supabase connect-src, no frames).

### `src/app/print/order/[orderId]/page.tsx` + `src/components/print/auto-print.tsx`
- **OB-014:** Removed `dangerouslySetInnerHTML` print script.

### `src/lib/supabase/service.ts`
- **OB-017:** Documented that client uses publishable key only.

### `docs/SUPABASE_RLS_RECOMMENDED.sql` (new)
- Owner-facing RLS template and public-quote guidance.

### `.github/workflows/security-audit.yml` (new)
- CI: `npm audit --audit-level=high` + `tsc`.

## Testing

- `npx tsc --noEmit` after all changes.
- Manual browser smoke (demo login) — not repeated in CI here.

## Not fixed in code (see SECURITY_REMAINING_RISKS.md)

- Supabase RLS verification
- `jspdf` / `dompurify` dependency chain
- Distributed rate limiting
- Demo workspace on production deployments
