const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
function openLibraryDatabase(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const db = new Database(path.join(directory, 'library.sqlite'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, path TEXT, title TEXT, kind TEXT, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS media_path ON media(path);
    CREATE INDEX IF NOT EXISTS media_title ON media(title);
    CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, state TEXT NOT NULL, error TEXT, updated INTEGER NOT NULL);
    PRAGMA user_version = 1;
  `);
  const putMedia = db.prepare('INSERT OR REPLACE INTO media VALUES (@id,@path,@title,@kind,@data)');
  const putSource = db.prepare('INSERT OR REPLACE INTO sources VALUES (?,?)');
  const write = db.transaction(library => {
    db.prepare('DELETE FROM media').run(); db.prepare('DELETE FROM sources').run();
    for (const item of library.media) putMedia.run({id:item.id,path:item.path||null,title:item.title,kind:item.kind,data:JSON.stringify(item)});
    for (const item of library.sources) putSource.run(item.id, JSON.stringify(item));
    db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('demo', JSON.stringify(Boolean(library.demo)));
    db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('initialized', 'true');
  });
  function load() {
    if (!db.prepare("SELECT value FROM meta WHERE key='initialized'").get()) return null;
    return {demo:JSON.parse(db.prepare("SELECT value FROM meta WHERE key='demo'").get()?.value || 'false'),
      media:db.prepare('SELECT data FROM media ORDER BY rowid').all().map(r=>JSON.parse(r.data)),
      sources:db.prepare('SELECT data FROM sources ORDER BY rowid').all().map(r=>JSON.parse(r.data))};
  }
  if (!load()) {
    const legacy = path.join(directory, 'library.json');
    if (fs.existsSync(legacy)) {
      const library = JSON.parse(fs.readFileSync(legacy, 'utf8'));
      if (!Array.isArray(library.media) || !Array.isArray(library.sources)) throw new Error('旧影音库格式无效，请保留备份后检查。');
      if (!fs.existsSync(legacy+'.pre-sqlite.bak')) fs.copyFileSync(legacy,legacy+'.pre-sqlite.bak');
      write(library);
    }
  }
  db.prepare("UPDATE jobs SET state='interrupted', updated=? WHERE state IN ('queued','running')").run(Date.now());
  return { load, save:write,
    job(id,state,error='') { db.prepare('INSERT OR REPLACE INTO jobs VALUES (?,?,?,?)').run(id,state,error,Date.now()); },
    close() { db.close(); } };
}
module.exports = { openLibraryDatabase };
