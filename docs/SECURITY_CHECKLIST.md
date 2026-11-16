# Security checklist

| Control | Status | Notes |
|---------|--------|-------|
| **Authentication** | | |
| Supabase Auth for live users | PASS | Password via mapped email |
| Session refresh via SSR middleware | PASS | `@supabase/ssr` |
| Login rate limiting | PASS | In-memory; see rate limit note |
| Generic login errors (no enumeration) | PASS | |
| Demo workspace session | BY DESIGN | Demo brands only (BR-1/BR-2), no live data. Login is a row in `data/sessions.csv` keyed by a random 32-char token; only its SHA-256 is stored, rows expire after 30 days and sign-out deletes the row. Writes land in the CSVs, so a public deployment should not leave demo entry open if anonymous writes matter. |
| **Authorization** | | |
| Server actions require live session | PASS | |
| Brand scoping in queries | PASS | App layer |
| RBAC for settings | PASS | After fix |
| RBAC for financial ops | PASS | Manager+ |
| RBAC for product catalog | PASS | Existing + centralized helpers |
| Order status transition rules | PASS | After fix |
| **Supabase RLS** | | |
| RLS enabled all tables | NEEDS REVIEW | Not in repo |
| Tenant isolation policies | NEEDS REVIEW | Apply `docs/SUPABASE_RLS_RECOMMENDED.sql` |
| SECURITY DEFINER RPC review | NEEDS REVIEW | `accept_quote_by_token`, `analytics_*` |
| Service role key absent from client | PASS | Publishable key only |
| **Storage** | NOT APPLICABLE | No Storage SDK usage found |
| **API / server actions** | | |
| Input validation on orders | PASS | `validateCreateOrderInput` |
| Input validation on products | PASS | |
| IDOR protection | NEEDS REVIEW | Depends on RLS |
| CSRF on server actions | PASS | Next.js Server Actions origin check; `OB_ACTION_ALLOWED_ORIGINS` only adds the listed public origins (proxy/preview deployments) and stays unset otherwise |
| Open redirect protection | PASS | `safeInternalPath` |
| **Input validation** | PASS | ILIKE escape, phone, URLs HTTPS |
| **Secrets** | | |
| `.env.local` gitignored | PASS | |
| No service_role in source | PASS | |
| `NEXT_PUBLIC_*` only publishable key | PASS | |
| **Dependencies** | | |
| npm audit clean (high+) | FAIL | jspdf/dompurify chain |
| **Security headers** | PASS | Middleware + next.config partial |
| CSP | PASS | Baseline added |
| **Logging / monitoring** | NEEDS REVIEW | No centralized audit log to SIEM |
| **Backup / recovery** | NEEDS REVIEW | Supabase project settings |
| **Deployment** | NEEDS REVIEW | Railway/env separation per README |
| **CI security** | PASS | `security-audit.yml` added |
