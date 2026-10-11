interface StoredViews { id: string; revision: string; savedAt: number; images: Record<string, string> }
let connection: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  return connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('mopple_views', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('views', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { connection = undefined; reject(request.error); };
  });
}
export async function loadViews(id: string, revision: string): Promise<Record<string, string>> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('views').objectStore('views').get(id);
    request.onsuccess = () => { const value = request.result as StoredViews | undefined; resolve(value?.revision === revision ? value.images : {}); };
    request.onerror = () => reject(request.error);
  });
}
export async function saveViews(id: string, revision: string, images: Record<string, string>): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('views', 'readwrite'), store = transaction.objectStore('views');
    store.put({ id, revision, images, savedAt: Date.now() } satisfies StoredViews);
    const all = store.getAll();
    all.onsuccess = () => { const entries = (all.result as StoredViews[]).sort((a, b) => b.savedAt - a.savedAt); for (const entry of entries.slice(12)) store.delete(entry.id); };
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
  });
}
