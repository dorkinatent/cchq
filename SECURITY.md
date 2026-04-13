# Security policy

CCUI is a single-user local dev tool. It runs on your machine, talks to
your local Supabase, and (optionally) exposes itself over your tailnet
via Tailscale. There is no auth layer; if you expose it more broadly
than that, you do so at your own risk.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security-sensitive
findings.

Instead, email **<TODO: maintainer email>** with:

- A description of the issue and impact
- Reproduction steps
- The commit SHA you tested against
- Any suggested fix

You'll get an acknowledgement within 7 days. Coordinated disclosure
preferred — give the maintainer a reasonable window to ship a fix
before publishing.

## In scope

- Anything that lets a user on the local machine or tailnet read or
  write data they shouldn't (path traversal, privilege escalation,
  permission-bypass on tool calls)
- Anything that lets a remote (non-tailnet) attacker reach the app
  through misconfiguration of the documented setup
- Secret leakage in builds, logs, or HTTP responses

## Out of scope

- Vulnerabilities that require physical access to the machine
- DoS via resource exhaustion (the app trusts the operator)
- Any issue that requires the operator to disable Tailscale auth or
  intentionally bind the dev server to a public network
- Issues in upstream dependencies (file those upstream)
