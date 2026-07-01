#!/usr/bin/env node
// Extracts sqljs.tar.gz (place it next to this file) into ./sqljs/
// Run once: node install.js
// Debug output: DEBUG=1 node install.js

const { execSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

const DEBUG = !!process.env.DEBUG;
const dbg = (...a) => { if (DEBUG) console.log('[install:debug]', ...a); };

dbg('process.version   :', process.version);
dbg('process.platform  :', process.platform);
dbg('process.arch      :', process.arch);
dbg('__dirname         :', __dirname);
dbg('cwd               :', process.cwd());

const tarball = path.join(__dirname, 'sqljs.tar.gz');
const outDir  = path.join(__dirname, 'sqljs');

// Refuse to install sql.js if the plugin was already migrated to node:sqlite
const storageDir = process.env.STORAGE_DIR;
if (storageDir && fs.existsSync(path.join(storageDir, 'upgrade'))) {
    console.error('[install] ERROR: Downgrade detected.');
    console.error('[install]        This plugin was already migrated to node:sqlite (HFS built-in).');
    console.error('[install]        Downgrading to an older Node / HFS version is not supported.');
    console.error('[install]        To force a reinstall, remove the "upgrade" file from the storage directory.');
    process.exit(1);
}

dbg('tarball path      :', tarball);
dbg('output dir        :', outDir);

if (!fs.existsSync(tarball)) {
    console.error('[install] ERROR: sqljs.tar.gz not found at', tarball);
    console.error('[install]        Download it from: https://github.com/sql-js/sql.js/releases');
    process.exit(1);
}

const tarballStat = fs.statSync(tarball);
dbg('tarball size      :', tarballStat.size, 'bytes');
dbg('tarball mtime     :', tarballStat.mtime.toISOString());

// List tarball contents before extracting
try {
    dbg('--- tarball contents (tar -tzf) ---');
    const listing = execSync(`tar -tzf "${tarball}"`).toString().trim();
    dbg(listing);
    dbg('--- end of listing ---');
} catch (e) {
    dbg('listing failed (non-fatal):', e.message);
}

if (fs.existsSync(outDir)) {
    dbg('outDir already exists, contents:', fs.readdirSync(outDir));
} else {
    dbg('outDir does not exist yet, creating');
}
fs.mkdirSync(outDir, { recursive: true });
dbg('outDir ensured');

const cmd = `tar -xzf "${tarball}" -C "${outDir}" --strip-components=1`;
dbg('running command   :', cmd);

try {
    const output = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    dbg('tar stdout        :', output || '(empty)');
} catch (e) {
    console.error('[install] ERROR: tar extraction failed');
    console.error('[install]        command  :', cmd);
    console.error('[install]        exit code:', e.status);
    console.error('[install]        stdout   :', e.stdout?.toString() || '(empty)');
    console.error('[install]        stderr   :', e.stderr?.toString() || '(empty)');
    console.error('[install]        message  :', e.message);
    process.exit(1);
}

dbg('extraction complete, outDir now contains:', fs.readdirSync(outDir));

const required = ['sql-wasm.js', 'sql-wasm.wasm'];
const missing  = required.filter(f => !fs.existsSync(path.join(outDir, f)));
if (missing.length) {
    console.error('[install] ERROR: expected files missing after extraction:', missing.join(', '));
    console.error('[install]        outDir contains:', fs.readdirSync(outDir).join(', ') || '(empty)');
    console.error('[install]        Hint: the tarball structure may differ — run with DEBUG=1 to see the full listing');
    process.exit(1);
}

for (const f of required) {
    const p = path.join(outDir, f);
    dbg(f, '->', fs.statSync(p).size, 'bytes');
}

console.log('[install] sql.js installed to', outDir);
