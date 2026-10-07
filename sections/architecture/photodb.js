// v42: the Architecture photo store. Photos live ONLY on this device, in IndexedDB (database "aitor-arch", store "photos"); localStorage would be far too
// small. Each record: { id, mime:'image/jpeg', full:ArrayBuffer (long edge 1600 px), thumb:ArrayBuffer (long edge 320 px), w, h, createdAt }.
// ArrayBuffers (not Blobs) because older iOS Safari versions could not store Blobs in IndexedDB. Not part of the JSON export (it is capped at 5 MB);
// "Erase all data" deletes the whole database (js/storage.js).
export const DB_NAME = 'aitor-arch';
const STORE = 'photos';
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('This browser cannot store photos (no IndexedDB).')); return; }
    const rq = indexedDB.open(DB_NAME, 1);
    rq.onupgradeneeded = () => { if (!rq.result.objectStoreNames.contains(STORE)) rq.result.createObjectStore(STORE, { keyPath: 'id' }); };
    rq.onsuccess = () => { const db = rq.result; db.onversionchange = () => { db.close(); dbp = null; }; resolve(db); };
    rq.onerror = () => reject(rq.error || new Error('Could not open the photo store.'));
    rq.onblocked = () => reject(new Error('The photo store is busy in another tab.'));
  });
  dbp.catch(() => { dbp = null; });
  return dbp;
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const st = t.objectStore(STORE);
    let out;
    const rq = fn(st);
    if (rq) rq.onsuccess = () => { out = rq.result; };
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error || new Error('Photo store error'));
    t.onabort = () => reject(t.error || new Error('Photo store aborted (storage may be full)'));
  });
}
export const putPhoto = (rec) => tx('readwrite', (st) => st.put(rec));
export const getPhoto = (id) => tx('readonly', (st) => st.get(id));
export const deletePhoto = (id) => tx('readwrite', (st) => st.delete(id));
export const photoIds = () => tx('readonly', (st) => st.getAllKeys());

/** Object URL for a stored photo ('full' | 'thumb'), or null if it is not on this device. Caller revokes it (or uses urlCache below). */
export async function photoURL(id, which = 'thumb') {
  try {
    const r = await getPhoto(id);
    if (!r || !r[which]) return null;
    return URL.createObjectURL(new Blob([r[which]], { type: r.mime || 'image/jpeg' }));
  } catch { return null; }
}
/** Delete the whole database (Erase all data). Resolves even if it fails. */
export function deleteAll() {
  return new Promise((resolve) => {
    try {
      const go = () => { const rq = indexedDB.deleteDatabase(DB_NAME); rq.onsuccess = rq.onerror = rq.onblocked = () => resolve(); };
      if (dbp) dbp.then((db) => { db.close(); dbp = null; go(); }, () => { dbp = null; go(); }); else go();
    } catch { resolve(); }
  });
}
