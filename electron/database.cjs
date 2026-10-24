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
  const putMedia = db.prepare('INSERT INTO media VALUES (@id,@path,@title,@kind,@data) ON CONFLICT(id) DO UPDATE SET path=excluded.path,title=excluded.title,kind=excluded.kind,data=excluded.data');
  const putSource = db.prepare('INSERT INTO sources VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data');
  const deleteMedia=db.prepare('DELETE FROM media WHERE id=?'),deleteSource=db.prepare('DELETE FROM sources WHERE id=?');
  let savedMedia=new Map(db.prepare('SELECT id,data FROM media').all().map(r=>[r.id,r.data])),savedSources=new Map(db.prepare('SELECT id,data FROM sources').all().map(r=>[r.id,r.data]));
  const row=item=>({id:item.id,path:item.path||null,title:item.title,kind:item.kind,data:JSON.stringify(item)});
  const write = db.transaction(library => {
    const nextMedia=new Map(),nextSources=new Map();
    for(const item of library.media){const value=row(item);nextMedia.set(item.id,value.data);if(savedMedia.get(item.id)!==value.data)putMedia.run(value);}
    for(const item of library.sources){const data=JSON.stringify(item);nextSources.set(item.id,data);if(savedSources.get(item.id)!==data)putSource.run(item.id,data);}
    for(const id of savedMedia.keys())if(!nextMedia.has(id))deleteMedia.run(id);
    for(const id of savedSources.keys())if(!nextSources.has(id))deleteSource.run(id);
    db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('demo', JSON.stringify(Boolean(library.demo)));
    db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run('initialized', 'true');
    return {nextMedia,nextSources};
  });
  function save(library){const {nextMedia,nextSources}=write(library);savedMedia=nextMedia;savedSources=nextSources;}
  const patchRows=db.transaction(rows=>{for(const value of rows)if(savedMedia.get(value.id)!==value.data)putMedia.run(value);});
  function saveMedia(items){const rows=items.map(row);patchRows(rows);for(const value of rows)savedMedia.set(value.id,value.data);}
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
      save(library);
    }
  }
  db.prepare("UPDATE jobs SET state='interrupted', updated=? WHERE state IN ('queued','running')").run(Date.now());
  return { load, save, saveMedia,
    job(id,state,error='') { db.prepare('INSERT OR REPLACE INTO jobs VALUES (?,?,?,?)').run(id,state,error,Date.now()); },
    close() { db.close(); } };
}
module.exports = { openLibraryDatabase };
