# Gmail UnSucked: User Guide

Manage your Gmail filters from the side panel: see them in plain English, search them, and create, edit, duplicate or delete them without digging through Settings.

## Contents
- [Open it](#open-it)
- [Your filter list](#your-filter-list)
- [Create a filter](#create-a-filter)
- [Create a filter from an email](#create-a-filter-from-an-email)
- [Edit, duplicate, delete, undo](#edit-duplicate-delete-undo)
- [Troubleshooting](#troubleshooting)
- [Things it does not do](#things-it-does-not-do)

## Open it
In Gmail, click the **Gmail Unsucked** icon (filter symbol) in the right-hand side panel. The first card is your filter list.

## Your filter list
Each filter is a short form: an icon on the left, its value on the right, one line per field.

> 👤 **boss@example.com**
> ≡ Quarterly numbers
> 🏷 Work, Receipts
> → me@example.com
> ⭐ 👁️ 📤
> [ View details ] [ Edit ]

- **Condition lines:** each set condition has its own grey icon (person = From, people = To, lines = Subject, magnifier = Has words, block = Doesn't have, paperclip = Has attachment, ruler = Size). A long value wraps inside its own column, beside its icon.
- **Tags:** one line with the label icon and the names of the labels the filter applies. There are no color dots.
- **Forwarding:** the destination address, with an arrow icon, when the filter forwards.
- **Action icons:** other actions as plain emoji, shown only when there are any: ⭐ star, ❗ important, 🗑️ delete, 📂 category, 📤 skip inbox, 👁️ mark as read, 🛡️ never spam, 🔕 never important, ➖ remove label. The detail screen spells them out.
- **Buttons:** **View details** opens the full values with Edit, Duplicate and Delete. **Edit** opens the editor directly. Tapping any line also opens the details.
- **Order:** A to Z by the first condition.
- **Longer lists:** the first 10 are shown. Choose **Show more** to add 10 more below them (up to 90; search to narrow beyond that).
- **Search:** type in the box and press **Enter**, or use the small search icon. It matches the text you see, including label names. The small ✕ clears the search. There is no search-as-you-type: Gmail add-ons cannot do that.
- Your search and place in the list are kept when you open a filter, cancel, save or undo.

## Create a filter
Choose **New filter**. The form has two parts.

**When a message matches** (fill in at least one)

| Field | Meaning |
|---|---|
| From / To / Subject | Address or text to match |
| Has the words | Words the message contains |
| Doesn't have | Words it must not contain |
| Has attachment | Only messages with an attachment |
| Size is / Size / unit | Larger or smaller than a size, in MB, KB or bytes |

**Do this** (choose at least one)

| Action | Meaning |
|---|---|
| Apply label | Pick one of your existing labels |
| Skip the Inbox (archive) | Message goes to All Mail |
| Mark as read | Marked read on arrival |
| Star it / Mark as important | Adds the star or importance marker |
| Never send to Spam | Keeps matching mail out of Spam |
| Delete it (moves to Trash) | Matching mail goes to Trash |
| Forward to | Only addresses you have **verified** in Gmail appear here |

Choose **Create filter**. Problems are shown next to the field; **Cancel** returns to the list unchanged.

Filters apply to mail that **arrives from now on**. They do not change messages already in your mailbox.

## Create a filter from an email
Open a message. The panel shows its **From** and **Subject** and a **Create filter from this message** button. The form opens with the sender and subject filled in; adjust and save as above.

## Edit, duplicate, delete, undo
- **Edit:** the form says which filter you are editing. Less-used conditions (Has the words, Doesn't have, attachment, size) are under **More conditions**, which opens by itself when any of them is set. Changes are saved as a new filter, then the old one is removed. If nothing changed you will see "No changes to save."
- **Duplicate:** opens the create form pre-filled from that filter. Saving it unchanged tells you a filter with exactly these conditions already exists. Change something first.
- **Delete:** asks you to confirm. The next card shows **Undo**, which brings the filter back. Undo is only offered on that card; once you leave it, the filter cannot be restored from here.

If an edit saves the new filter but cannot remove the old one, you are told you now have both and given a **Delete old filter** button.

## Troubleshooting
| You see | What to do |
|---|---|
| "You do not have permission to call ... Required permissions" | The add-on needs updated permissions. Remove it at <https://myaccount.google.com/permissions>, reinstall it, and approve again |
| "Gmail could not complete that request" | Usually temporary. Choose **Try again** or **Back to filters** |
| A label or forwarding address is missing from a dropdown | Newly created labels and addresses can take up to a minute to appear. Forwarding addresses must be verified in Gmail Settings > Forwarding and addresses |
| "You have no labels yet" | Create one in Gmail (Settings > Labels), then reopen the form |
| "That filter no longer exists" | It was changed in Gmail Settings meanwhile. Go back to the list |

## Things it does not do
- Apply a filter to mail already in your mailbox.
- Create or manage labels.
- Name filters, show when they were made, or reorder them. Gmail does not store any of that for filters.
- Bulk cleanup or import/export (planned).
