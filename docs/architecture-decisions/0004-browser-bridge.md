# ADR 0004: Native Messaging as the browser bridge

## Status

Accepted and partially implemented.

## Decision

The Chromium extension uses the existing packaged Native Messaging host as its primary transport:

```text
content script -> MV3 service worker -> Native Messaging host -> Omakase inbox/database
```

Messages use protocol version 1, request timestamps, and the capture id as an idempotency key. The native host verifies the caller extension origin against the locally registered allowlist before accepting a request. The extension retains pending captures indefinitely and retries them without changing the request ID.

`omakase://capture/<request-id>` is only a wake/focus signal. It never carries HTML, article text, credentials, or permanent tokens.

## Consequences

- The browser does not receive a general Omakase database or localhost API.
- Page extraction remains isolated from privileged desktop operations.
- The current inbox polling path remains compatible with the packaged Python host while the next slice can move acknowledgement/status handling into a durable capture-request state machine.
- Windows registry installation and a native non-Python launcher remain release work; the current installer paths are complete only for the supported development platforms.
