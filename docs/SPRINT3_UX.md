# Sprint 3: UX Polish, Filter Cards and Editor (Tier 2: story + architecture in one doc)

**Owners:** Cypher (stories), Morpheus (design) · **Status:** planned; all section 6 questions answered 2026-10-10 (user); ready for Phase 1 · **Inputs:** user request 2026-10-10, Google docs checked same day

## 1. Request
Make the filter list feel like a stack of business cards in a Material style: one card per filter showing which labels it applies (in their color, when the label has one), the values of any criteria fields (truncated), and an expander for more. Polish the filter edit screens too.

## 2. What the platform allows (verified against Google docs)

| Wish | Platform reality | Consequence |
|---|---|---|
| A card per filter | No nested cards. A Card contains Sections; a section is a header plus widgets (max 100 widgets per section) | **One CardSection per filter**, with its own header, reads as a card. We cannot set background, border, radius or shadow |
| Expander | `CardSection.setCollapsible(true)` + `setNumUncollapsibleWidgets(n)`: the first *n* widgets stay visible, the rest collapse behind built-in controls | **Fully supported.** Visible widgets are always the *first* added, so order matters |
| Colored labels | Label resource has `color {textColor, backgroundColor}`, **user labels only**, from a fixed palette. The docs do not say whether `labels.list` returns it | **Spike:** confirm live. System labels (Inbox, Starred, ...) have no color |
| Show the color | Text supports only `<b> <i> <u> <s> <font color> <a> <br>`. No background fill except on text *buttons* | Show a colored dot `●` in the label's `backgroundColor` beside its name. A true filled chip is not possible |
| Truncate to N characters | We control text; widgets also wrap or truncate (`setWrapText`) | Truncate values ourselves (N=40), full text in the expanded part |
| Grid / chips | Grid exists (image/title/subtitle items); chips not available to Gmail add-ons | Not used: poor fit for variable text |
| Max lines / show-more | `TextParagraph.setMaxLines` is preview-only for add-ons | Not used |

## 3. Stories

| ID | Story | Acceptance criteria |
|----|-------|---------------------|
| U1 | As a user, each filter is one visually distinct card | Own section per filter with a header (the primary criterion, truncated); no JSON or ids; consistent order of lines; works with search and paging (C2 still holds) |
| U2 | As a user I see at a glance which labels a filter applies | Each applied user label is shown as `● Name`; the dot uses the label's color; a label with no color shows a neutral dot; name is always present, so color is never the only signal; system actions (Skip Inbox, Star, Forward...) shown as short plain lines |
| U3 | As a user I see the filter's criteria values without a wall of text | Each set field shown as `Label: value`, value cut at 40 characters with `...`; hidden fields are not shown; the full values appear when expanded |
| U4 | As a user I can expand a card for details | Collapsed shows the header, labels and key actions; expanded shows full, untruncated criteria and all actions; Edit/Duplicate/Delete reachable from the card |
| U5 | As a user the edit/create screen is easier to scan | Sections *When* and *Do this* kept; less-used fields (Has words, Doesn't have, size, attachment) behind a collapsible "More conditions" that is **open** when any of them is set; selected label shown with its color dot; header says what is being edited; Cancel/Back unchanged |

**Non-goals:** custom colors, real chips, card backgrounds, drag-and-drop, sort modes (BL-1) and names (BL-2) stay in the backlog, label creation.

## 4. Design

### 4.1 Layering (unchanged rule: logic is pure, `cards.js` only draws)
```
 format.js  cardModel(filter, labelsById, labelColorsById, {maxLen})  PURE, unit-tested
   -> { title, labels:[{name,color|null}], conditions:[{name,value,full}], actions:[text], hasMore }
 filters.js listView: items gain `model`; labels color map comes from api.listLabels() (already cached, D5)
 cards.js    listCard_: one CardSection per item built from the model
```

### 4.2 Card anatomy (collapsed, top to bottom; order is fixed because the first *n* widgets stay visible)
1. `DecoratedText` title: primary criterion (e.g. `boss@x.com`), top label = condition name (`From`)
2. `TextParagraph`: label dots `● Work   ● Receipts` (omitted when no labels)
3. `TextParagraph`: short action line (`Skip Inbox · Star · Forward`) (omitted when none)
   -> `numUncollapsibleWidgets` = number of widgets above (2 or 3)
4. *(always visible, fixed position)* action row: `⋮` menu, or the three icon buttons (Edit, Duplicate, Delete) if the menu spike fails. *(collapsed region)* each condition `Label: full value` and the remaining actions

### 4.3 Decisions
| # | Decision | Rationale |
|---|---|---|
| E1 | **User decision 2026-10-10 (amended):** try a ⋮ overflow menu (`OverflowMenu`) for Edit/Duplicate/Delete; **if it does not work, show small icon buttons (not word buttons)** | `OverflowMenu` is developer preview for add-ons (Google docs), so it may not render for a normal install. Spike first (T19b). Fallback = `ImageButton`s with `setIconUrl` (Google-hosted Material PNGs, HTTP 200 verified: `https://www.gstatic.com/images/icons/material/system/1x/{edit,content_copy,delete}_grey600_24dp.png`, same host as the manifest logo) and **required** `setAltText` ("Edit", "Duplicate", "Delete"). The built-in `Icon` enum has no edit/delete/copy icons and `MaterialIcon` is developer preview, so hosted URLs are the only GA route. Dark mode: the add-on cannot detect the theme, so black PNGs vanish on dark (measured 1.3:1). Use `_grey600_` (#757575): 4.6:1 on white, 3.5:1 on #202124, both above the 3:1 non-text minimum; computed with a WCAG script on the actual PNGs. Icon-only buttons need a tooltip-free affordance: keep them in a fixed order (Edit, Duplicate, Delete) with Delete visually last |
| E2 | Label color = dot in `backgroundColor`, name in default text color | The palette's light backgrounds are illegible as *text* on white; a dot tolerates any color and name keeps it accessible |
| E3 | Truncate at 40 chars in `format.js`, never in `cards.js` | Pure, testable; full value still in the expanded region |
| E4 | **User decision 2026-10-10:** no fixed pages. Fetch *all* filters, search in memory; the list is a **growing list**: first batch of cards, "Show more" re-renders with the earlier cards kept plus the next batch (batch size is one constant, start 10). Cap 90 filter sections per card (Google limit is 100 sections); past the cap the card says "Showing first 90 of N, refine your search" | Card Service has no scroll event, so true infinite scroll is not possible; this is the closest. Realistic volume is a few hundred, >1000 is unusual |
| E8 | **Fluid search:** search box gets `setOnChangeAction` so results update without pressing Search; the Search/Clear buttons stay as a fallback. Spike (T19c) first: the docs do not say when the change action fires (keystroke vs blur/Enter) | There is no client-side filtering in Card Service; "fluid" means a fast round trip |
| E9 | Make the round trip fast: cache the full filter list in `CacheService` (chunked across keys, since a value is capped at 100 KB), short TTL, **invalidated on every create/delete/edit/undo we perform** | `filters.list` per keystroke would be slow and quota-hungry; amends "filters are never cached" from D5 (filters become cached; staleness only from edits made outside the add-on, bounded by TTL) |
| E5 | Colors come from the existing cached `labels.list` (D5); no extra API call | Cache already holds the full label objects |
| E6 | If live `labels.list` does not return `color`, fall back to neutral dots and file a follow-up (labels.get per label is too costly) | Failure is graceful by design |
| E7 | Strict CardService fake learns `setCollapsible`, `setNumUncollapsibleWidgets`, `setTopLabel`, `setStartIcon` before cards.js uses them | Test-layer rule: fake must match the platform |

### 4.4 Risks
- Color presence in `labels.list` is undocumented -> **spike first** (selfTest prints which fields a user label has).
- Collapsed state resets on each re-render (search, paging). Acceptable; note in guide.
- Card height: longest case is many labels + long criteria; truncation and paging bound it.
- Dot colors against dark mode: a mid-tone palette color is fine; very dark palette entries may vanish in dark mode. Name stays visible (E2).

## 5. Test plan (follows ARCH section 5 pyramid)
1. Unit (`format.js`): `cardModel` truncation boundaries (39/40/41), empty fields, many labels, unknown label id, label without color, system labels, extras present.
2. Contract (strict fake): list card sections each non-empty, `numUncollapsibleWidgets <= widgets`, handlers still return built ActionResponse, buttons still resolve to real handlers.
3. selfTest (real runtime): label color field probe; every real filter still renders as a collapsible section; no error card.
4. Manual (Smith): contrast, density, dark mode, expander behavior, C2 regression.

## 6. Open questions for the user
1. ~~Buttons~~ **Answered:** try the ⋮ menu, fall back to buttons inside the expander (E1).
2. ~~Page size~~ **Answered:** growing list over a fully fetched, in-memory-searched filter set (E4, E8, E9).
3. ~~Colored dot~~ **Answered:** colored dot + name (E2).

## 7. Revision 2026-10-10 (user): one widget per filter, whole list is one Card

Supersedes the section-per-filter design in section 4.2 and decisions E1/E4 where they conflict.

- **E10:** the list is **one Card with one section**; each filter is **one `DecoratedText` widget** followed by a `Divider`. Card Service has no composite custom widget, so DecoratedText is the single widget that carries everything it can: top label (primary criterion name), text body (bold truncated value + second line of label dots via `<font color>`), bottom label (short criteria/action summary), one end button, and a click action on the whole widget.
- **E11:** the **expander becomes drill-down**: tapping the filter widget pushes a **detail card** with full untruncated values, all actions, label dots, and Edit / Duplicate / Delete. (Collapse exists only per section, not inside a widget.)
- **E12:** the single end button is the **Edit icon button** (ImageButton + hosted icon + alt text), or the ⋮ menu with Edit/Duplicate/Delete if the T19b spike shows it works. Duplicate and Delete always exist in the detail card.
- **E4 stands** (growing list, cap 90 filters per card, one "Show more" appends the next batch); with one widget per filter the 100-widget-per-section limit makes the cap 45 filters per section at 2 widgets each (widget + divider), so cap is **45 per section** unless the Divider is dropped. Decision: drop the Divider (DecoratedText already separates visually); cap **90**.
- Lost versus the earlier plan, accepted: inline expander, three inline buttons per row.
- U1/U4 acceptance criteria reinterpreted: "card" = one widget row; "expand" = open detail card.
