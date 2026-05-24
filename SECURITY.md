# Security Policy

## Supported Versions

Steamroller is currently in pre-1.0 development. Security updates are applied to the latest
release on the `main` branch only.

| Version       | Supported |
| ------------- | --------- |
| latest / main | Yes       |
| < latest      | No        |

Once steamroller reaches 1.0, this table will be updated to reflect the supported version
range.

## Reporting a Vulnerability

If you discover a security vulnerability in steamroller, please report it responsibly.
**Do not open a public GitHub issue for security vulnerabilities.**

### How to Report

Send an email to **security@asymmetric-effort.com** with the following information:

- A description of the vulnerability
- Steps to reproduce the issue
- The affected version(s) or commit(s)
- Any potential impact or severity assessment
- Your suggested fix, if you have one

Please include "SECURITY" in the subject line to ensure prompt triage.

### What to Expect

| Step                  | Timeline                          |
| --------------------- | --------------------------------- |
| Acknowledgement       | Within 48 hours of report receipt |
| Triage and assessment | Within 7 days                     |
| Fix for Critical/High | Target within 30 days             |
| Fix for Medium/Low    | Target within 90 days             |

We will keep you informed of progress throughout the process. If a fix is released, we will
credit you in the advisory unless you prefer to remain anonymous.

## Scope

The following are considered in scope for security reports:

- Vulnerabilities in the steamroller bundler core
- Supply chain risks in the build or release process
- Issues that could allow arbitrary code execution during bundling
- Path traversal or file system access beyond intended scope
- Denial of service through crafted input

The following are **out of scope**:

- Vulnerabilities in third-party dependencies not shipped with steamroller (steamroller has
  zero runtime dependencies by design)
- Issues in the documentation website that do not affect the bundler itself
- Social engineering attacks against maintainers

## Disclosure Policy

We follow coordinated disclosure. We ask that reporters:

1. Allow us reasonable time to investigate and address the vulnerability before public
   disclosure.
2. Make a good faith effort to avoid privacy violations, data destruction, and disruption of
   service during research.
3. Do not exploit the vulnerability beyond what is necessary to demonstrate it.

We will coordinate with you on a disclosure timeline. Our goal is to release a fix before or
simultaneously with any public disclosure.

## Safe Harbor

Asymmetric Effort considers security research conducted in accordance with this policy to be
authorized, and we will not pursue legal action against researchers who:

- Act in good faith and follow this policy
- Avoid causing harm to users or systems
- Report findings promptly and do not disclose publicly before a fix is available
- Do not access, modify, or delete data belonging to others

## Contact

- **Security reports:** security@asymmetric-effort.com
- **General inquiries:** See [README.md](README.md)
