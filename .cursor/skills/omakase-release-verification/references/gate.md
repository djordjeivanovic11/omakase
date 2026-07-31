# Release gate

```bash
pnpm run doctor
pnpm verify
pnpm verify:ai
pnpm verify:release   # when packaging artifacts
```

External blockers (signing/notarization/store IDs) must be documented, not silently ignored.
