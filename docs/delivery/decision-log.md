# Decision log

| # | Date | Decision | By |
|---|---|---|---|
| D-001 | 2026-11-24 | Repository seeded; ADR-0001 and ADR-0002 accepted | Human |
| D-002 | 2026-11-24 | Parallel builder cap is 5 in this repository | Human |
| D-003 | 2026-11-24 | ADR-0003 (access, guest links, immutability, pin coordinates) **Accepted** with all five defaults: decision finality is per asset version; guests may approve (`view`/`comment`/`decide`, never `manage`); link lifetime 7 days default / 30 max; guests named by member-supplied `label`, else `'Guest reviewer'` + `linkId`; cross-tenant requests answer `404`, not `403` | Human ("approved") |
| D-004 | 2026-11-24 | Delivery runs in three waves, not one parallel batch: T0 (core access seam) must merge before T1–T5; T6 (guest-journey E2E) after T2+T3+T4 merge. Five-way parallelism from a standing start would have put three builders in `src/core/auth.ts` at once | Supervisor, per ADR-0003 §F |
