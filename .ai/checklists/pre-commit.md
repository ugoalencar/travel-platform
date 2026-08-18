# Pre-Commit Checklist

Use this checklist before a local commit.

Do not stage or commit unless the user explicitly authorizes it.

## Required Checks

Run:

```powershell
npm run lint
npm run typecheck
npm run test
```

When a PowerShell wrapper is desired:

```powershell
.\pre-commit.ps1
```

## Review

- No secrets, credentials, private keys, tokens, dumps, or real `.env` files.
- No unrelated files included.
- No generated artifacts such as `dist/`, `.turbo/`, `coverage/`, or `node_modules/`.
- Documentation updated when behavior changes.
- ADR created when an architectural decision changes.

See `QUALITY-GATES.md` for the official quality policy.
