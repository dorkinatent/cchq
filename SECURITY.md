# Security policy

CCHQ is a single-user local dev tool. It runs on your machine, talks to
your local Supabase, and (optionally) exposes itself over your tailnet
via Tailscale. There is no auth layer; if you expose it more broadly
than that, you do so at your own risk.

## Reporting a vulnerability

Open a [GitHub issue](../../issues) with the `security` label.
Include:

- A description of the issue and impact
- Reproduction steps
- The commit SHA you tested against
- Any suggested fix

For anything you'd rather not disclose publicly, use GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on the repo's Security tab instead.

## In scope

- Anything that lets a user on the local machine or tailnet read or
  write data they shouldn't (path traversal, privilege escalation,
  permission-bypass on tool calls)
- Anything that lets a remote (non-tailnet) attacker reach the app
  through misconfiguration of the documented setup
- Secret leakage in builds, logs, or HTTP responses
- Security implications of the Docker socket mount used by the
  optional one-click update feature (`/var/run/docker.sock`). The
  socket is mounted read-only and the update endpoint only pulls
  images — it does not execute containers or access host resources.
  Users who prefer not to mount the socket can update manually via
  `docker compose pull && docker compose up -d`.

## Out of scope

- Vulnerabilities that require physical access to the machine
- DoS via resource exhaustion (the app trusts the operator)
- Any issue that requires the operator to disable Tailscale auth or
  intentionally bind the dev server to a public network
- Issues in upstream dependencies (file those upstream)
