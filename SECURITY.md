# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |
| < 0.1 | No |

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report privately by emailing **security@omakase.app**, or by using
[GitHub Security Advisories](https://github.com/djordjeivanovic11/omakase/security/advisories/new)
if that repository feature is enabled.

Please include:

1. A clear description of the issue and impact
2. Steps to reproduce (or a proof of concept)
3. Affected version / commit if known
4. Whether you are available for follow-up questions

You should receive an acknowledgement within **72 hours**. We will keep you
updated as we investigate and fix the issue.

## What not to put in issues

Never include in public issues, pull requests, or discussions:

- API keys, tokens, or passwords
- Contents of diagnostic bundles that may contain private source text
- Full private learning library exports
- Personally identifiable information from your local library

If you accidentally commit a secret, rotate it immediately and tell maintainers
privately.

## Security model (summary)

Omakase is local-first:

- API keys are stored with OS-backed encryption in the main process
- The renderer is sandboxed (`contextIsolation`, no Node integration)
- Imported sources are treated as untrusted data
- There is no required cloud backend in version one

See [`docs/threat-model.md`](docs/threat-model.md) for more detail.

## Safe harbor

We welcome good-faith security research. Avoid privacy violations, destruction
of data, and disruption of others' systems. Research against your own local
install is preferred.
