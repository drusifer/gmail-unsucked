# CHAT.md — Conversation Flow

Auto-generated from `agents/CHAT.md` by `bobp chat-diagram`. Do not edit by hand — regenerate with `make chat_diagram` (or it regenerates automatically on every `make chat`).

```mermaid
%%{init: {"sequence": {"messageFontSize": 14, "noteFontSize": 18, "actorFontSize": 14}}}%%
sequenceDiagram
    autonumber
    participant Mouse
    participant User
    participant Trin
    Note over Mouse,Trin: 📅 2026-10-10
    Mouse->>User: "init"
    Note right of Mouse: "Bob Protocol<br/>initialized. Chat read,<br/>state loaded: Sprints<br/>1-3 closed, 75 tests +<br/>tsc green, Sprint 3<br/>uncommitted/unpushed.<br/>Ready for next…"
    Trin->>User: "qa"
    Note right of Trin: "Sprint 3 UX live checks<br/>done: selfTest 62/62,<br/>icons+hint text moved to<br/>#757575 (contrast<br/>verified), U6 verified<br/>by user. Uncommitted."
```
