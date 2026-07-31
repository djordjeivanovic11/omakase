# Omakase website

Minimal static landing page (Next.js App Router + Tailwind, `output: 'export'`).

```bash
pnpm --filter @omakase/website dev
pnpm --filter @omakase/website build   # writes website/out
```

Deploy `website/out` to any static host (Vercel, Netlify, GitHub Pages).

On Vercel: set the project root to `website`, build command `pnpm build`, output `out`.
