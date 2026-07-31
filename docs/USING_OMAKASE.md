# Using Omakase

Omakase is a local-first personal learning studio. Your library, sources, and learner evidence stay on this Mac. Frontier models use **your** API key (BYOK). No account is required.

## Install / run

**Development**

```bash
nvm use          # Node 24
corepack enable
pnpm install
pnpm run doctor
OMAKASE_MOCK_PROVIDER=1 pnpm dev   # mock models, no paid key
# or set a real key in You → Model provider
```

**Packaged app (macOS Apple Silicon)**

```bash
pnpm --filter @omakase/desktop package
open apps/desktop/out/Omakase-darwin-arm64/Omakase.app
```

DMG / zip distributables:

```bash
pnpm --filter @omakase/desktop make
# artifacts under apps/desktop/out/make/
```

## First session

1. Complete onboarding (display name optional).
2. Open **You → Model provider** and connect OpenAI (defaults to **Best teaching** / GPT-5.6), **or** use **Local mock (testing)** only in unpackaged `OMAKASE_MOCK_PROVIDER=1` builds.
3. Create a **Studio** with a clear objective.
4. Add material via **Inbox** or the studio’s **Add PDFs**.
5. Open a ready source → **Learn** (lesson starts automatically) or **Ask**.
6. Run **Probe** for adaptive questions; evidence updates your Learning Map / Today next action.

## Adding sources

| Kind | Where |
| --- | --- |
| Paste / note / markdown | Inbox → paste form |
| PDF (multi-select) | Inbox or Studio → Add PDFs — pick many files at once |
| Transcript (VTT/SRT/txt, multi-select) | Inbox or Studio → Add transcripts |
| Public URL | Inbox → URL field |
| Browser page | Extension → Save page (see below) |

Inbox items can be assigned to a Studio later. Processing status shows on the source; retry from the source page if something fails.

Up to **5 local workers** prepare sources in parallel on this Mac (extract → index). Agent retrieval budgets are raised for large personal libraries (dozens of PDFs in one Studio).

## Browser extension

See [`apps/extension/README.md`](../apps/extension/README.md). Short path:

1. Build and load unpacked Chrome/Edge MV3 build.
2. Start the desktop app (installs native host `com.omakase.desktop`).
3. **You → Browser capture** → paste the extension ID → **Connect extension**.
4. Capture pages into Inbox or a Studio.

## Citations

In Learn/Ask, citation chips open the source and scroll to the cited block (`#block-<id>`).

## Data & privacy

- Library: local SQLite + content-addressed assets under the app profile directory.
- API keys: OS-backed secret store (never written into SQLite).
- **You → Export library / Restore library** for backups.
- **Export diagnostics** redacts secrets before writing a bundle.

## Navigation

Primary nav only: **Today | Studios | Inbox | You**.

## Troubleshooting

| Symptom | What to try |
| --- | --- |
| Blank window in `pnpm dev` | Use Node 24 (`nvm use`), restart Vite (`rs`), confirm renderer URL loads |
| Provider errors | Re-save key in You; check network; try mock provider locally |
| Extension capture fails | Register ID in You; quit/reopen browser; keep desktop app running |
| Source stuck processing | Open source → Retry; check Logs under the profile directory |

More detail: [`TECHNICAL_SPEC.md`](./TECHNICAL_SPEC.md), [`release.md`](./release.md).
