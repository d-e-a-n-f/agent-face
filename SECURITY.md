# Security policy

AgentFace mediates what AI agents can do inside applications, so security
reports get priority attention.

## Supported versions

The latest published 0.x release line.

## Reporting a vulnerability

**Do not open a public issue.** Use GitHub's private vulnerability
reporting ("Report a vulnerability" under the Security tab), or email
dean@syarahealth.com.

Include what you can: affected package(s), a reproduction, and the impact
you see (e.g. policy bypass, confirmation bypass, principal confusion,
prompt-injection path into an action).

You should hear back within a few days. Please allow a fix to ship before
public disclosure.

## Scope notes

Especially interested in:

- Any way a model/tool call executes an action **without** the enforced
  lifecycle (validation → policy → preview → confirmation).
- Confirmation binding breaks (executing against different input, entity,
  revision, or principals than confirmed).
- Policy-filtered discovery leaks (denied capability metadata reaching a
  model).
- The Next.js model endpoint (auth bypass, resource exhaustion beyond the
  documented limits).
