exports.version = 0.1;
exports.description = "Trash Bin — moves deleted files to trash instead of permanently deleting them";
exports.apiRequired = 8.891;
exports.author = "feuerswut";
exports.repo = "feuerswut/hfs-trashbin";

exports.init = async api => {
    const fs             = require('fs');
    const path           = require('path');
    const { spawnSync }  = require('child_process');

    const trashDir = path.join(api.storageDir, 'trash');
    fs.mkdirSync(trashDir, { recursive: true });

    const CREATE = `
        CREATE TABLE IF NOT EXISTS trash (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user       TEXT    NOT NULL,
            origin     TEXT    NOT NULL,
            dest       TEXT    NOT NULL,
            deleted_at INTEGER NOT NULL
        )`;
    const INSERT     = 'INSERT INTO trash (user, origin, dest, deleted_at) VALUES (?, ?, ?, ?)';
    const SELECT_ALL = 'SELECT * FROM trash ORDER BY deleted_at DESC';
    const SELECT_ONE = 'SELECT * FROM trash WHERE id = ?';
    const DELETE_ONE = 'DELETE FROM trash WHERE id = ?';

    let dbRun, dbAll, dbGet, dbDelete, dbClose;

    try {
        const { DatabaseSync } = require('node:sqlite');
        const ndb = new DatabaseSync(path.join(api.storageDir, 'trash.db'));
        ndb.exec(CREATE);
        const ins  = ndb.prepare(INSERT);
        const selA = ndb.prepare(SELECT_ALL);
        const selO = ndb.prepare(SELECT_ONE);
        const del  = ndb.prepare(DELETE_ONE);
        dbRun    = (u, o, d, t) => ins.run(u, o, d, t);
        dbAll    = ()           => selA.all();
        dbGet    = id           => selO.get(id);
        dbDelete = id           => del.run(id);
        dbClose  = ()           => ndb.close();
        api.log('[trashbin] using node:sqlite');
    } catch (e) {
        const log = (...a) => api.log('[trashbin:sqljs]', ...a);
        log('WARNING: node:sqlite unavailable, reason:', e.message);
        log('         node version:', process.version, '| platform:', process.platform, '| arch:', process.arch);
        log('         node:sqlite requires Node >= 22.5.0');
        log('         falling back to sql.js...');

        const sqljsDir   = path.join(__dirname, 'sqljs');
        const sqljsEntry = path.join(sqljsDir, 'sql-wasm.js');
        const sqljsWasm  = path.join(sqljsDir, 'sql-wasm.wasm');
        const installJs  = path.join(__dirname, 'install.js');

        log('sql.js dir  :', sqljsDir);
        log('sql-wasm.js :', sqljsEntry, '| exists:', fs.existsSync(sqljsEntry));
        log('sql-wasm.wasm:', sqljsWasm, '| exists:', fs.existsSync(sqljsWasm));

        if (!fs.existsSync(sqljsEntry) || !fs.existsSync(sqljsWasm)) {
            log('sql.js not installed — running install.js automatically');
            log('install.js path:', installJs, '| exists:', fs.existsSync(installJs));

            if (!fs.existsSync(installJs)) {
                log('ERROR: install.js not found — plugin disabled.');
                return { unload: () => {} };
            }

            const result = spawnSync(process.execPath, [installJs], {
                env: { ...process.env, DEBUG: '1' },
                encoding: 'utf8',
            });
            log('install.js stdout:\n' + (result.stdout || '(empty)'));
            log('install.js stderr:\n' + (result.stderr || '(empty)'));
            log('install.js exit code:', result.status);

            if (result.status !== 0) {
                log('ERROR: install.js failed — plugin disabled. Place sqljs.tar.gz next to install.js and restart.');
                return { unload: () => {} };
            }
            log('install.js succeeded');
        }

        log('requiring sql-wasm.js from', sqljsEntry);
        let initSqlJs;
        try {
            initSqlJs = require(sqljsEntry);
            log('require succeeded, typeof initSqlJs:', typeof initSqlJs);
        } catch (re) {
            log('ERROR: require(sql-wasm.js) threw:', re.message, '\n', re.stack);
            return { unload: () => {} };
        }

        log('calling initSqlJs({ locateFile })');
        let SQL;
        try {
            SQL = await initSqlJs({
                locateFile: f => {
                    const p = path.join(sqljsDir, f);
                    log('locateFile:', f, '->', p, '| exists:', fs.existsSync(p));
                    return p;
                },
            });
            log('initSqlJs resolved, typeof SQL.Database:', typeof SQL.Database);
        } catch (ie) {
            log('ERROR: initSqlJs() rejected:', ie.message, '\n', ie.stack);
            return { unload: () => {} };
        }

        const dbPath = path.join(api.storageDir, 'trash.sqljs.db');
        log('db file:', dbPath, '| exists:', fs.existsSync(dbPath));

        let sdb;
        try {
            sdb = fs.existsSync(dbPath)
                ? new SQL.Database(fs.readFileSync(dbPath))
                : new SQL.Database();
            log('Database instance created');
        } catch (de) {
            log('ERROR: new SQL.Database() threw:', de.message, '\n', de.stack);
            return { unload: () => {} };
        }

        try { sdb.run(CREATE); log('CREATE TABLE IF NOT EXISTS succeeded'); }
        catch (ce) { log('ERROR: CREATE TABLE failed:', ce.message); return { unload: () => {} }; }

        const save = () => {
            const buf = sdb.export();
            fs.writeFileSync(dbPath, buf);
            log('db saved,', buf.length, 'bytes');
        };

        const sqlQuery = (sql, params = []) => {
            const stmt = sdb.prepare(sql);
            const rows = [];
            stmt.bind(params);
            while (stmt.step()) rows.push(stmt.getAsObject());
            stmt.free();
            return rows;
        };

        dbRun    = (u, o, d, t) => { sdb.run(INSERT, [u, o, d, t]); save(); };
        dbAll    = ()           => sqlQuery(SELECT_ALL);
        dbGet    = id           => sqlQuery(SELECT_ONE, [id])[0];
        dbDelete = id           => { sdb.run(DELETE_ONE, [id]); save(); };
        dbClose  = ()           => { log('closing sql.js db'); sdb.close(); };
        api.log('[trashbin] using sql.js');
    }

    // ── helpers ────────────────────────────────────────────────────────────────
    const b64enc = s => Buffer.from(s).toString('base64');
    const b64dec = s => Buffer.from(s, 'base64').toString('utf8');

    function copySync(src, dst) {
        const st = fs.statSync(src);
        if (st.isDirectory()) {
            fs.mkdirSync(dst, { recursive: true });
            for (const f of fs.readdirSync(src)) copySync(path.join(src, f), path.join(dst, f));
        } else {
            fs.copyFileSync(src, dst);
        }
    }

    function moveItem(src, dst) {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        try {
            fs.renameSync(src, dst);
        } catch (e) {
            if (e.code !== 'EXDEV') throw e;
            copySync(src, dst);
            fs.rmSync(src, { recursive: true, force: true });
        }
    }

    // ── intercept deletes ──────────────────────────────────────────────────────
    const unsubDelete = api.events.on('deleting', async ({ node, ctx }) => {
        const source = node.source;
        if (!source) return;

        try { fs.statSync(source); } catch (_) { return; }

        const name = path.basename(source);
        const dest = path.join(trashDir, `${Date.now()}_${name}`);

        try { moveItem(source, dest); }
        catch (e) { api.log('[trashbin] move failed:', e.message); return; }

        const user = api.getCurrentUsername(ctx) || 'anonymous';
        dbRun(b64enc(user), b64enc(source), b64enc(dest), Math.floor(Date.now() / 1000));

        api.log('[trashbin] db dump:', JSON.stringify(dbAll(), null, 2));
        api.log('[trashbin] trashed by', user + ':', source, '->', dest);

        ctx.respond = false;
        ctx.res.statusCode = 200;
        ctx.res.end();
        return api.events.stop;
    });

    // ── REST API for frontend ──────────────────────────────────────────────────
    const customRest = {
        trashbin_list(_, ctx) {
            const user = api.getCurrentUsername(ctx) || 'anonymous';
            return dbAll()
                .filter(r => b64dec(r.user) === user)
                .map(r => ({
                    id:        r.id,
                    name:      path.basename(b64dec(r.origin)),
                    origin:    b64dec(r.origin),
                    deletedAt: r.deleted_at,
                }));
        },

        trashbin_restore({ id }, ctx) {
            const user = api.getCurrentUsername(ctx) || 'anonymous';
            const row  = dbGet(id);
            if (!row || b64dec(row.user) !== user) return { error: 'Not found.' };
            const src = b64dec(row.dest);
            const dst = b64dec(row.origin);
            if (!fs.existsSync(src)) {
                dbDelete(id);
                return { error: 'Trash file missing — record removed.' };
            }
            if (fs.existsSync(dst)) return { error: 'A file already exists at the original location.' };
            try {
                moveItem(src, dst);
                dbDelete(id);
                api.log('[trashbin] restored by', user + ':', src, '->', dst);
                return { ok: true };
            } catch (e) { return { error: e.message }; }
        },

        trashbin_delete({ id }, ctx) {
            const user = api.getCurrentUsername(ctx) || 'anonymous';
            const row  = dbGet(id);
            if (!row || b64dec(row.user) !== user) return { error: 'Not found.' };
            try {
                fs.rmSync(b64dec(row.dest), { recursive: true, force: true });
                dbDelete(id);
                api.log('[trashbin] permanently deleted by', user + ':', b64dec(row.dest));
                return { ok: true };
            } catch (e) { return { error: e.message }; }
        },
    };

    api.log('[trashbin] initialized — trash dir:', trashDir);
    return {
        frontend_js: 'main.js',
        customRest,
        unload: () => { unsubDelete(); dbClose(); },
    };
};
