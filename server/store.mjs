import { DatabaseSync } from 'node:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function createStore(dbPath) {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(dbPath);
  if (dbPath !== ':memory:') chmodSync(dbPath, 0o600);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS papers (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS words (
      id TEXT PRIMARY KEY,
      word TEXT NOT NULL UNIQUE,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ai_jobs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS annotations (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS annotations_owner ON annotations(owner_id);
    CREATE TABLE IF NOT EXISTS pdf_documents (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, sha256 TEXT NOT NULL,
      filename TEXT NOT NULL, pages INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, bytes BLOB NOT NULL,
      UNIQUE(owner_id, sha256)
    );
    CREATE INDEX IF NOT EXISTS pdf_documents_owner ON pdf_documents(owner_id);
    CREATE TABLE IF NOT EXISTS pdf_imports (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pdf_imports_owner ON pdf_imports(owner_id);
    CREATE TABLE IF NOT EXISTS paper_shares (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS paper_shares_owner ON paper_shares(owner_id);
    CREATE TABLE IF NOT EXISTS share_imports (
      owner_id TEXT NOT NULL, share_id TEXT NOT NULL, source_id TEXT NOT NULL,
      paper_id TEXT NOT NULL, PRIMARY KEY(owner_id, share_id, source_id)
    );
  `);
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const table of ['papers', 'attempts', 'words', 'settings', 'ai_jobs']) {
      if (
        !db
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .some((column) => column.name === 'owner_id')
      ) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'admin'`);
      }
      db.exec(`CREATE INDEX IF NOT EXISTS ${table}_owner ON ${table}(owner_id)`);
    }
    if (db.prepare('PRAGMA user_version').get().user_version < 5)
      db.exec('PRAGMA user_version = 5');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    db.close();
    throw error;
  }
  // Administrator keys retain all legacy rows; new accounts use internal namespaced keys.
  const keyFor = (owner, id) => (owner === 'admin' ? id : JSON.stringify([owner, id]));
  const get = (table, owner, id, column = 'id') => {
    const row = db
      .prepare(`SELECT data FROM ${table} WHERE ${column} = ? AND owner_id = ?`)
      .get(keyFor(owner, id), owner);
    return row ? JSON.parse(row.data) : undefined;
  };
  const list = (table, owner) =>
    db
      .prepare(`SELECT data FROM ${table} WHERE owner_id = ? ORDER BY rowid DESC`)
      .all(owner)
      .map((row) => JSON.parse(row.data));
  const save = (table, owner, id, data, column = 'id') =>
    db
      .prepare(
        `INSERT INTO ${table} (${column}, owner_id, data) VALUES (?, ?, ?) ON CONFLICT(${column}) DO UPDATE SET data = excluded.data WHERE ${table}.owner_id = excluded.owner_id`,
      )
      .run(keyFor(owner, id), owner, JSON.stringify(data));
  const sharedPaper = (id) => get('papers', '@shared', id);
  const addSharedPaper = (paper) =>
    db
      .prepare('INSERT OR IGNORE INTO papers (id, owner_id, data) VALUES (?, ?, ?)')
      .run(keyFor('@shared', paper.id), '@shared', JSON.stringify(paper));
  const scope = (ownerId, root = false) => ({
    db,
    ownerId,
    close: () => {
      if (root) db.close();
    },
    forUser: (id) => {
      if (typeof id !== 'string' || !id || id === '@shared' || id.length > 100)
        throw new Error('Invalid account scope');
      return scope(id);
    },
    getSharedPaper: sharedPaper,
    addSharedPaper,
    getPaper: (id) => get('papers', ownerId, id) || sharedPaper(id),
    getOwnedPaper: (id) => get('papers', ownerId, id),
    listPapers: () => [
      ...new Map(
        [...list('papers', '@shared').reverse(), ...list('papers', ownerId).reverse()].map(
          (paper) => [paper.id, paper],
        ),
      ).values(),
    ],
    addPaper: (paper) =>
      db
        .prepare('INSERT INTO papers (id, owner_id, data) VALUES (?, ?, ?)')
        .run(keyFor(ownerId, paper.id), ownerId, JSON.stringify(paper)),
    transaction: (work) => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = work();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    getPdfDocument: (id) =>
      db.prepare('SELECT * FROM pdf_documents WHERE id = ? AND owner_id = ?').get(id, ownerId),
    findPdfDocument: (sha256) =>
      db
        .prepare('SELECT * FROM pdf_documents WHERE sha256 = ? AND owner_id = ?')
        .get(sha256, ownerId),
    pdfStorageBytes: () =>
      db
        .prepare(
          'SELECT COALESCE(SUM(length(bytes)),0) AS size FROM pdf_documents WHERE owner_id = ?',
        )
        .get(ownerId).size,
    pdfDocumentCount: () =>
      db.prepare('SELECT COUNT(*) AS count FROM pdf_documents WHERE owner_id = ?').get(ownerId)
        .count,
    addPdfDocument: (doc) =>
      db
        .prepare(
          'INSERT INTO pdf_documents (id,owner_id,sha256,filename,pages,created_at,bytes) VALUES (?,?,?,?,?,?,?)',
        )
        .run(doc.id, ownerId, doc.sha256, doc.filename, doc.pages || 0, doc.createdAt, doc.bytes),
    setPdfPages: (id, pages) =>
      db
        .prepare('UPDATE pdf_documents SET pages = ? WHERE id = ? AND owner_id = ?')
        .run(pages, id, ownerId),
    getPdfImport: (id) => get('pdf_imports', ownerId, id),
    listPdfImports: () =>
      db
        .prepare(
          "SELECT json_remove(data, '$.pages', '$.draft') AS data FROM pdf_imports WHERE owner_id = ? ORDER BY rowid DESC LIMIT 200",
        )
        .all(ownerId)
        .map((row) => JSON.parse(row.data)),
    savePdfImport: (job) => save('pdf_imports', ownerId, job.id, job),
    listShares: () =>
      db
        .prepare(
          "SELECT json_remove(data, '$.papers') AS data, json_array_length(data, '$.papers') AS count FROM paper_shares WHERE owner_id = ? ORDER BY rowid DESC LIMIT 200",
        )
        .all(ownerId)
        .map((row) => ({ ...JSON.parse(row.data), paperCount: row.count })),
    getShare: (id) => get('paper_shares', ownerId, id),
    addShare: (share, tokenHash) =>
      db
        .prepare('INSERT INTO paper_shares (id,owner_id,token_hash,data) VALUES (?,?,?,?)')
        .run(keyFor(ownerId, share.id), ownerId, tokenHash, JSON.stringify(share)),
    saveShare: (share) =>
      db
        .prepare('UPDATE paper_shares SET data = ? WHERE id = ? AND owner_id = ?')
        .run(JSON.stringify(share), keyFor(ownerId, share.id), ownerId),
    resolveShare: (tokenHash) => {
      const row = db
        .prepare('SELECT owner_id,data FROM paper_shares WHERE token_hash = ?')
        .get(tokenHash);
      return row ? { ...JSON.parse(row.data), ownerId: row.owner_id } : null;
    },
    getShareImport: (shareId, sourceId) =>
      db
        .prepare(
          'SELECT paper_id FROM share_imports WHERE owner_id = ? AND share_id = ? AND source_id = ?',
        )
        .get(ownerId, shareId, sourceId)?.paper_id,
    saveShareImport: (shareId, sourceId, paperId) =>
      db
        .prepare(
          'INSERT INTO share_imports (owner_id,share_id,source_id,paper_id) VALUES (?,?,?,?)',
        )
        .run(ownerId, shareId, sourceId, paperId),
    getAttempt: (id) => get('attempts', ownerId, id),
    listAttempts: () => list('attempts', ownerId),
    saveAttempt: (attempt) => save('attempts', ownerId, attempt.id, attempt),
    getWord: (id) => get('words', ownerId, id),
    findWord: (word) => {
      const row = db
        .prepare('SELECT data FROM words WHERE word = ? AND owner_id = ?')
        .get(keyFor(ownerId, word), ownerId);
      return row ? JSON.parse(row.data) : undefined;
    },
    listWords: () => list('words', ownerId),
    saveWord: (word) =>
      db
        .prepare(
          'INSERT INTO words (id, owner_id, word, data) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data WHERE words.owner_id = excluded.owner_id',
        )
        .run(keyFor(ownerId, word.id), ownerId, keyFor(ownerId, word.word), JSON.stringify(word)),
    deleteWord: (id) =>
      db
        .prepare('DELETE FROM words WHERE id = ? AND owner_id = ?')
        .run(keyFor(ownerId, id), ownerId),
    getSetting: (key) => get('settings', ownerId, key, 'key'),
    setSetting: (key, value) => save('settings', ownerId, key, value, 'key'),
    getAiJob: (id) => get('ai_jobs', ownerId, id),
    listAiJobs: () => list('ai_jobs', ownerId),
    saveAiJob: (job) => save('ai_jobs', ownerId, job.id, job),
    getAnnotation: (attemptId, groupId) => {
      const id = keyFor(ownerId, JSON.stringify([attemptId, groupId]));
      const row = db
        .prepare('SELECT data, revision FROM annotations WHERE id = ? AND owner_id = ?')
        .get(id, ownerId);
      return row ? { ...JSON.parse(row.data), revision: row.revision } : undefined;
    },
    saveAnnotation: (attemptId, groupId, document, baseRevision, updatedAt) => {
      const id = keyFor(ownerId, JSON.stringify([attemptId, groupId]));
      const data = JSON.stringify({ ...document, updatedAt });
      const result =
        baseRevision === 0
          ? db
              .prepare(
                'INSERT INTO annotations (id, owner_id, revision, data) VALUES (?, ?, 1, ?) ON CONFLICT(id) DO NOTHING',
              )
              .run(id, ownerId, data)
          : db
              .prepare(
                'UPDATE annotations SET data = ?, revision = revision + 1 WHERE id = ? AND owner_id = ? AND revision = ?',
              )
              .run(data, id, ownerId, baseRevision);
      return result.changes ? { ...document, updatedAt, revision: baseRevision + 1 } : null;
    },
  });
  return scope('admin', true);
}
