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
Each filter is one line of plain text:

> From: boss@example.com -> Label "Work", Skip Inbox, Forward to me@example.com

- **Order:** A to Z by the first condition (from, then to, subject, words).
- **Paging:** 10 per page. Use **Show more** and **Previous**.
- **Search:** type in the box and choose **Search**. It matches the text you see, including label names. Choose **Clear search** to go back to everything.
- Search and page are remembered when you open a filter, cancel, save or undo, so you land where you were.

Under each filter: **Edit**, **Duplicate**, **Delete**.

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
- **Edit:** changes are saved as a new filter, then the old one is removed. If nothing changed you will see "No changes to save."
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
