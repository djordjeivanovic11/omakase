# Release

## Versioning

Omakase uses [semantic versioning](https://semver.org/). The single source of truth for the app version is the root `package.json` `version` field (mirrored in `apps/desktop/package.json`). The desktop UI shows `app.getVersion()` on the **You** page.

Bump versions together before tagging:

```bash
# example: 0.1.0 → 0.2.0
# edit package.json + apps/desktop/package.json + apps/extension/package.json + website/package.json
# update CHANGELOG.md
git tag v0.2.0
git push origin v0.2.0
```

Pushing a `v*` tag runs [`.github/workflows/release.yml`](../.github/workflows/release.yml), which builds macOS/Windows artifacts and creates a GitHub Release.

## Artifacts

| Platform | Artifact | Maker |
|---|---|---|
| macOS | `.app`, `.zip`, `.dmg` | Forge package + `MakerZIP`; DMG via `scripts/make-macos-dmg.sh` (hdiutil) |
| Windows | Squirrel `.exe` / `.nupkg` | Electron Forge `MakerSquirrel` |

```bash
pnpm check-env
pnpm install
pnpm build          # contracts + extension + packaged .app
pnpm make           # Forge ZIP / Windows makers under apps/desktop/out/make/
pnpm make:dmg       # UDZO DMG (recommended on macOS; avoids brittle appdmg natives)
# or
./scripts/release.sh
./scripts/release.sh --publish   # requires gh auth
```

## External credentials required

These are the only expected external blockers for a **signed** public release:

1. **Apple Developer ID** Application certificate + notarization (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`).
2. **Windows code signing** certificate (EV or standard Authenticode).
3. **Chrome Web Store** / **Edge Add-ons** publisher accounts for extension IDs.
4. Optional paid provider keys for real-provider evals (not required for CI; mock provider covers the golden path).

Until credentials exist, ship **unsigned** development packages and state that clearly in release notes.

## Changelog

Maintain [`CHANGELOG.md`](../CHANGELOG.md). Release notes should summarize user-facing changes and link to the install steps in the README.

## Release checklist

1. CI green on macOS and Windows.
2. `pnpm test` with `OMAKASE_TEST=1 OMAKASE_MOCK_PROVIDER=1`.
3. Packaged app launches; first-run onboarding works.
4. SBOM / license report attached (`pnpm licenses`).
5. `docs/ACCEPTANCE_CHECKLIST.md` evidence filled for the release.
6. No production TODO/FIXME/stub markers in shipped code paths.
7. Website builds: `pnpm build:website`.
8. Tag `vX.Y.Z` and confirm GitHub Release assets upload.
