# Security Policy

## Supported Versions

DuoAsk is currently pre-1.0. Security fixes land on the `main` branch.

## Reporting A Vulnerability

Please avoid posting secrets, cookies, browser profile data, or account-specific screenshots in public issues.

If you find a vulnerability, open a private report through GitHub Security Advisories if available on the repository. If advisories are not enabled, contact the maintainer privately and include:

- affected commit or release
- reproduction steps
- expected impact
- whether any local session, token, or credential data may be exposed

## Secret Handling

Provider sessions, local app settings, task history, browser snapshots, API tokens, and SMTP credentials are local user data. They should never be committed to Git.
