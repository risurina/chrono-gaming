# @chrono/gaming-web

Next.js (App Router) web app for Chrono — the tenant dashboard, member portal, and
apex marketing site. See `apps/gaming-api/AGENTS.md` for product/domain context and the
repo root `AGENTS.md` for workspace conventions.

## Local development

From the repo root:

```bash
pnpm dev        # runs gaming-api (:8787) + gaming-web (:3000)
```

## Deployment

Deploys to Vercel (project `chrono.izur.app`) with **Root Directory `apps/gaming-web`**.
Install and build are driven from the repo root so the `agora` foundation (the
`packages/agora` submodule) resolves — see `apps/gaming-web/vercel.json` (`installCommand`
→ `scripts/vercel-install.sh`, which fetches the private submodule with
`AGORA_SUBMODULE_TOKEN`) and the root `turbo.json`.
