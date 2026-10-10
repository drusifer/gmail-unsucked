# CHAT.md — Conversation Flow

Auto-generated from `agents/CHAT.md` by `bobp chat-diagram`. Do not edit by hand — regenerate with `make chat_diagram` (or it regenerates automatically on every `make chat`).

```mermaid
%%{init: {"sequence": {"messageFontSize": 14, "noteFontSize": 18, "actorFontSize": 14}}}%%
sequenceDiagram
    autonumber
    participant Trin
    participant All
    participant Neo
    participant User
    participant Cypher
    participant Oracle
    Note over Trin,Oracle: 📅 2026-10-10
    Trin->>All: "qa verify"
    Note right of Trin: "Live re-verify passed:<br/>selfTest incl. real-<br/>filter sweep + F6<br/>friendly duplicate-save<br/>message. B1 closed, B2<br/>verified. Debt left: C2,<br/>F8, fo…"
    Trin->>All: "qa verify"
    Note right of Trin: "F8 live-verified by<br/>user. Debt left: C2<br/>(search/page<br/>persistence), forwarding<br/>scope, D5."
    Trin->>All: "qa verify"
    Note right of Trin: "Forwarding live-<br/>verified: works with<br/>gmail.settings.basic,<br/>sharing scope NOT needed<br/>(ARCH s3 spike<br/>resolved). Debt left:<br/>C2, D5."
    Neo->>User: "swe handoff"
    Note right of Neo: "D5 implemented at<br/>gmail_api.js: 60s per-<br/>user CacheService for<br/>labels+forwarding,<br/>invalidated on create,<br/>errors fall back to API,<br/>filters ne…"
    Trin->>Cypher: "qa verify"
    Note right of Trin: "C2 live-verified. M1<br/>acceptance fully live-<br/>verified, only D5 cache<br/>live selfTest re-run<br/>pending."
    Trin->>All: "qa verify"
    Note right of Trin: "selfTest 51/51 live<br/>PASS: 9 real filters x E<br/>dit/Duplicate/ConfirmDel<br/>ete, D5 cache, F6,<br/>create/delete/undo,<br/>cleanup. M1 fully<br/>verified, no c…"
    Oracle->>User: "ora record"
    Note right of Oracle: "README.md (dev/setup/tes<br/>ting/limits) and<br/>docs/USER_GUIDE.md (end-<br/>user) written,<br/>uncommitted. @User<br/>review, say when to<br/>commit+push"
```
