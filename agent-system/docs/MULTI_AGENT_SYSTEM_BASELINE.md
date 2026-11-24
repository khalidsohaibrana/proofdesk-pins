# Multi-Agent Software Delivery System

**Status:** Baseline agreed; implementation has not started.  
**Purpose:** Define the roles, workflow, and safety gates for AI-assisted software delivery through production.

## Goal and scope

Build a multi-agent system that handles as much of the software development lifecycle as practical, so the human can focus on product decisions and shipping. The human works primarily with the supervisor. The specific application, repository, and agent harness will be selected later; the human will provide or create the real repository.

## Roles and authority

### Human / product owner

- Provides product goals and priorities with the supervisor.
- Decides product behavior, UX, cost, security, and data-handling questions, and handles escalations.
- Gives final review and approval to every change intended for production.
- Can trigger a production rollback.
- Work stops at a human approval gate when approval is a hard blocker; agents do not proceed on an assumed approval.

### Supervisor / manager agent

- Plans work, creates and assigns tickets, tracks progress, and unblocks builders.
- May clarify, split, or rescope tickets and reassign work.
- May create plans, ADRs, release notes, and PR summaries.
- Makes technical decisions within agreed constraints; consults the human on product behavior, UX, cost, security, and data handling.
- Never writes or modifies application code.
- May approve PRs and owns technical readiness before merge. It may merge and deploy after the required approvals, or delegate deployment to a builder.

### Builder agents

- At least five builder sessions run in parallel when there are at least five independent tickets; do not create artificial work to meet the count.
- Each builder owns one ticket in an isolated branch or worktree. One ticket produces one PR.
- Builders may coordinate directly or through the supervisor.
- Builders follow repository conventions and raise sensitive or out-of-scope changes to the supervisor. Changes to lockfiles, schemas, or CI require special review/approval; the exact approval authority is an open decision below.

### Reviewer agent

- Is a separate agent/session from the builder.
- Reviews against the ticket and checks relevant correctness, tests, security, performance, accessibility, ADR alignment, and code quality.
- A review round means one review followed by a builder resubmission.
- May request changes when a ticket causes problems in related features. Other out-of-scope work goes to the supervisor for guidance or a separate/rescoped ticket.
- The review-fix loop is limited to three rounds. If blocking issues remain, do not merge; escalate to the human.

## Delivery workflow

1. The human and supervisor establish the product goal, constraints, and priority.
2. The supervisor records relevant architectural decisions, creates bounded tickets, resolves dependencies, and assigns work.
3. Builders implement independent tickets in isolated branches/worktrees and submit one PR per ticket.
4. A separate reviewer checks each PR. Builders fix issues for up to three review rounds; unresolved blockers are escalated and never waived by the round limit.
5. CI runs the existing test suite and tests added with the PR. Required checks include tests, linting, formatting, code correctness, reviewer approval, and QA approval.
6. The working feature is demonstrated locally. Attach a video or screenshots to the PR, choosing the format that fits the feature. QA or the reviewer checks the evidence against acceptance criteria, especially for UI/UX changes. For production-bound work, the human performs the final evidence review. If the feature cannot be demonstrated, escalate to the human.
7. The supervisor presents a green PR and QA package. Development/demo PRs can be handled by the supervisor and agents. For a production PR, the human gives final approval before the supervisor merges and deploys, or delegates deployment to a builder.
8. Production monitoring, incident handling, and follow-up work are recorded. The human can trigger rollback.

## Ticket, PR, and QA requirements

Every ticket should state the user outcome, scope, acceptance criteria, dependencies, affected areas where known, test expectations, and completion evidence. If it is too large for one PR, the supervisor splits or rescopes it before work continues.

The QA summary accompanying a green PR includes:

- Project metadata and release recommendation.
- Testing scope and execution results.
- Defect summaries.
- Remaining risks.
- Links to the ticket, PR, ADRs, and video/screenshots as applicable.

## Production and sensitive changes

- Human final approval is mandatory for anything going to production.
- After that approval, the supervisor merges and deploys, or delegates deployment to a builder.
- Database migrations, infrastructure, secrets/environment configuration, customer data, billing, and destructive changes must be explicitly identified and escalated. Production work involving them is subject to the human production approval gate.
- Agents must not claim a PR is green or ready when required checks or evidence are missing.

## Architecture Decision Records

- Use ADRs for consequential decisions, including architecture, interfaces, data, security, deployment, and choices that are costly to reverse.
- Builders may propose ADRs in coordination with the supervisor. The supervisor coordinates the decision and may accept technical decisions within the agreed constraints; decisions in the human-escalation areas go to the human.
- An ADR that governs implementation must be accepted before dependent implementation begins.
- Recommended canonical location: `docs/adr/` in the repository, using sequentially numbered Markdown files. Link ADRs from related tickets/PRs; ClickUp may be used for task tracking if selected, but should not replace the repository decision record.
- Accepted ADRs are preserved. Record rejected proposals with their disposition; mark replaced decisions as superseded and link to the replacement.
- Reference: [Martin Fowler on Architecture Decision Records](https://martinfowler.com/bliki/ArchitectureDecisionRecord.html).

## Operational defaults

These defaults fill gaps in the answers so far and can be revised when the project/tooling is selected:

- Follow the repository's branch, commit, and PR conventions. If none exist, the supervisor proposes a simple consistent convention before parallel work starts.
- Keep the PR as the evidence bundle: link the ticket and ADRs, report checks and QA, and attach or link the feature recording/screenshots. If the PR host cannot store video, use an approved project file store and link it from the PR.
- If an agent fails, contradicts another agent, or cannot verify a result, the supervisor pauses the affected ticket, preserves its state, and reports the blocker rather than treating it as complete.
- For production incidents, agents stop further rollout and alert the human; the human retains rollback authority.
- Recommended success measures: delivery lead time, escaped defects/rollbacks, review rounds, unresolved risks, and human escalations. Final measures have not yet been selected.

## Decisions still needing human attention

1. **Tooling and repository:** Select the application/repository, agent harness, source-control host, and PR platform. Confirm branch/worktree conventions if the repository does not already define them.
2. **Sensitive changes outside production:** Do migrations, infrastructure, secrets/environment settings, customer-data, billing, or destructive changes in development/demo also require your explicit approval, or only special supervisor review?
3. **Lockfiles, schemas, and CI:** Who gives the required special approval: the supervisor, the human, or both? Is approval required before editing or before merge?
4. **Environments and deployment access:** Confirm the environment sequence (suggested: local, CI, development/demo, production), who may deploy to each, and what credentials/secret material agents are never allowed to access. “env” was identified as restricted; the exact boundary is not yet specified.
5. **Release and monitoring:** Define post-deploy checks, monitoring signals and duration, and who detects and coordinates a production incident before you decide whether to roll back.
6. **Reporting and response time:** Choose where the supervisor reports status and blockers (PR plus a task tracker is the default; ClickUp is a candidate) and what it should do while waiting for your response. A hard approval blocker pauses the work.
7. **ADR acceptance:** Confirm the recommended authority: supervisor accepts technical ADRs within constraints; you accept ADRs that affect product behavior, UX, cost, security, or data handling.
8. **Success measures:** Choose which of the suggested measures matter and whether any target thresholds are needed.

## Presentation evidence

The screen recording should show the real repository, supervisor planning and ticket assignment, five or more independent builder sessions when available, isolated branches and one PR per ticket, the separate reviewer/fix loop, test and QA results, feature evidence, ADRs, and the human production approval gate. Do not present a production deployment as approved until the human approval is visible in the workflow.
