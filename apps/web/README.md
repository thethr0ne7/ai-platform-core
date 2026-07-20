# Government Intelligence Web

First Vercel-ready decision workspace for Government Support Intelligence.

## Local run

```bash
npm install
npm run dev
```

## Vercel import

Import `thethr0ne7/ai-platform-core` and configure:

- **Framework Preset:** Next.js
- **Root Directory:** `apps/web`
- **Install Command:** `npm install`
- **Build Command:** `npm run build`
- **Output Directory:** leave empty (Next.js default)
- **Production Branch:** `main`

The v0.19 interface uses deterministic demonstration data and does not require secrets. API, Supabase and OpenAI environment variables will be connected in the next runtime milestone.
