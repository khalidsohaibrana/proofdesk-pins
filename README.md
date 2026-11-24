# ProofDesk Pins

Clients pin comments on a design and approve it: a small, real slice of [ProofDesk](https://github.com/khalidsohaibrana/proofdesk), **built end to end by a supervised team of AI agents**.

| Who | Does |
|---|---|
| 🧭 **Sage**, supervisor | Plans, files tickets, assigns and unblocks. Never writes code. |
| 🏛️ **Atlas**, architect | Drafts ADRs for the decisions the work depends on. |
| 🔨 **Bolt, Forge, Rivet, Weld, Spark**, builders | Five in parallel. One ticket, one worktree branch, one PR each. |
| 🔍 **Iris**, reviewer · 🛡️ **Aegis**, security | Independent review, max 3 rounds. |
| 🧪 **Quinn**, QA | Tests plus a recorded feature run before any merge. |
| 👤 **Human** | Accepts ADRs, approves and merges. |

- Decisions: [`docs/adr/`](docs/adr) · Delivery rules: [`docs/delivery/`](docs/delivery) · Agents: [`agent-system/`](agent-system)

## Run
```bash
npm ci
npm start        # http://127.0.0.1:3000
npm run check    # typecheck + unit tests
npm run e2e      # Playwright, video-recorded
```
