# QA summary template

Posted as a PR comment by the QA agent. The supervisor checks it at gate G3.

```markdown
## QA Summary — PR #<n> / Issue #<n>

**Release recommendation:** Ship to preview | Ready for production approval | Do not merge
**Environment tested:** local | preview URL | browsers/devices

### Scope tested
Acceptance criteria from the ticket, each marked ✅ / ❌ / ⚠️ with evidence.

### Execution results
| Suite | Result | Link/output |
|---|---|---|
| Unit | x passed / y failed | |
| Integration | | |
| E2E | | |
| Accessibility | | |
| Mobile (client-facing UI) | | |

### Defects found
| # | Severity | Summary | Status |
|---|---|---|---|

### Remaining risks
…

### Evidence
Screenshots / video links, ticket, PR, ADRs.
```
