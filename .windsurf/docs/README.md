# Family Games II — AI Agent Guidelines

> **MANDATORY**: Read these docs before modifying the codebase or adding new features/games. Update them after significant changes.

## Documents

| # | File | Contents |
|---|------|----------|
| 1 | [01-architecture.md](01-architecture.md) | Tech stack, directory structure, data flow, DB schema, security model, design patterns |
| 2 | [02-user-journey.md](02-user-journey.md) | End-to-end user flow: home → create/join → lobby → gameplay → end |
| 3 | [03-game-workflows.md](03-game-workflows.md) | Per-game rules, validations, scoring, state shapes, flow diagrams |
| 4 | [04-adding-a-new-game.md](04-adding-a-new-game.md) | Step-by-step checklist to create and embed a new game |
| 5 | [05-data-content-pipeline.md](05-data-content-pipeline.md) | JSON → Convex seeding, anti-repetition, Arabic text handling |

## Quick Reference

- **9 games** (8 active + 1 disabled): charades, trivia, rapid_fire, twenty_questions, riddles, bus_complete, who_am_i, meen_yazood, pictionary (disabled)
- **Flask** = HTTP only (templates + static). **Convex** = all game logic + real-time state.
- **All timers are server-side** via `ctx.scheduler.runAfter()`.
- **State version** (`stateVersion`) must be bumped on every mutation that changes visible state.
- **Renderers** follow pattern: `window.<gameType>Renderer.render(state, playerName, roomId)`.

## When to Update These Docs

- After adding a new game → update `03-game-workflows.md`
- After changing architecture or adding new tables → update `01-architecture.md`
- After changing user flows → update `02-user-journey.md`
- After changing content pipeline → update `05-data-content-pipeline.md`
