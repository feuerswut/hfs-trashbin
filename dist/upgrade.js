// One-time migration: sql.js -> node:sqlite
// Called from plugin.js on every load, but exits immediately if sentinel exists.

module.exports = async function runUpgrade(storageDir, pluginDir, log) {
    const fs   = require('fs');
    const path = require('path');

    // Only migrate when node:sqlite is actually available
    try { require('node:sqlite'); }
    catch (_) { return; }

    log('[upgrade] node:sqlite detected — running one-time migration');

    // 1. Remove sqljs/ folder (no longer needed; tarball stays in place)
    try {
        fs.rmSync(path.join(pluginDir, 'sqljs'), { recursive: true, force: true });
        log('[upgrade] removed sqljs/ folder');
    } catch (e) {
        log('[upgrade] could not remove sqljs/ folder:', e.message);
    }

    // 2. Rename trash.sqljs.db -> trash.db (both are plain SQLite, fully compatible)
    const oldDb = path.join(storageDir, 'trash.sqljs.db');
    const newDb = path.join(storageDir, 'trash.db');
    if (fs.existsSync(oldDb) && !fs.existsSync(newDb)) {
        fs.renameSync(oldDb, newDb);
        log('[upgrade] renamed trash.sqljs.db -> trash.db');
    } else if (!fs.existsSync(oldDb)) {
        log('[upgrade] no trash.sqljs.db found — skipping rename');
    } else {
        log('[upgrade] trash.db already exists — skipping rename');
    }

    // 3. Write sentinel so this block never runs again
    fs.writeFileSync(path.join(storageDir, 'upgrade'), '');
    log('[upgrade] migration complete — sentinel written');
};
