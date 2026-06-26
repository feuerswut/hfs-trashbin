# hfs-trashbin

A plugin for [HFS](https://github.com/rejetto/hfs) that intercepts file deletions and moves them to a trash folder instead of permanently removing them.

## Alpha notice
- This plugin is in ALPHA. I cannot guarantee it to work by default, it still needs testing. Please report back to me in the issue.
- Naturally, keep this off of critical infrastructure, DO NOT RELY ON THIS YET, it may change a lot.

- GENERAL WARNING: DELETING THIS PLUGIN WILL ERASE ALL DELETED FILES PERMANENTLY. This is, right now, intended.
- There is a folder called storage/trash in the plugins folder containing ALL DELETED FILES AND FOLDERS.

## Features

- Intercepts HFS delete operations — files are moved to trash, not destroyed
- Per-user trash: each user only sees and manages their own deleted files
- Trash button in the menu bar with a list dialog (restore or permanently delete)
- SQLite-backed record keeping (uses Node.js built-in `node:sqlite`; falls back to sql.js automatically)
- No configuration required

## Installation

Copy the `dist/` folder into your HFS plugins directory and rename it to `trashbin`.
Or, easier: Go to the install plugins panel and simply search for `trashbin`, by Feuerswut (me) and click install.

HFS will pick it up automatically. No restart needed.

## Requirements

- HFS v0.53.0 or later (API 8.891+)
- Node.js v22.5.0 or later for the built-in SQLite backend (recommended)
- Node.js < 22.5: the plugin will automatically run `install.js` to set up the sql.js fallback.
  Place `sqljs.tar.gz` (from the [sql.js releases page](https://github.com/sql-js/sql.js/releases)) next to `install.js` before starting HFS.

## How it works

The plugin hooks into the HFS `deleting` backend event. When a user deletes a file:

1. The file is moved to `<storageDir>/trash/<timestamp>_<filename>`
2. A record is written to `trash.db` with the user, original path, trash path, and deletion timestamp (all paths are base64-encoded)
3. HFS receives a `200 OK` response — the frontend sees a successful deletion

The trash folder and database live in the plugin's storage directory, which is preserved across plugin updates.

## Trash UI

A **Trash** button appears in the menu bar for every logged-in user. Clicking it opens a dialog showing all files the current user has trashed, with:

- **Restore** — moves the file back to its original location (fails gracefully if something already exists there)
- **Delete** — permanently removes the file from the trash

## Troubleshooting

If the sql.js fallback is active, detailed logs are always emitted with the `[trashbin:sqljs]` prefix. Check the HFS log panel for these.

If `install.js` fails, ensure `sqljs.tar.gz` is present next to it and re-run manually:

```sh
node install.js
```

To see full debug output from `install.js`:

```sh
DEBUG=1 node install.js
```
