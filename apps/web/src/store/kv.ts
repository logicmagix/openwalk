// A small place to keep things on the device: named values in the browser's own
// database, IndexedDB. Nothing kept here is ever sent anywhere.
//
// IndexedDB is the browser's store for a site's own data. It outlives the page
// and the browser being closed, holds structured values rather than only text,
// and is asked for things with requests that answer later, which the functions
// below wrap as promises. A browser may refuse it (some private windows do), so
// opening it can fall back to a store that lasts only as long as the page: the
// app then works the same and simply forgets on reload.

export interface Store {
  /** The value kept under `key`, or undefined when there is none. */
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

/** A store that lives in memory, for a browser without IndexedDB and for tests. */
export function memoryStore(initial: Readonly<Record<string, unknown>> = {}): Store {
  const values = new Map<string, unknown>(Object.entries(initial));
  return {
    get: (key) => Promise.resolve(values.get(key)),
    set: (key, value) => {
      values.set(key, value);
      return Promise.resolve();
    },
    delete: (key) => {
      values.delete(key);
      return Promise.resolve();
    },
  };
}

const DATABASE = 'openwalk';
const TABLE = 'values';
/** How long to wait for the database before carrying on without it. */
const OPEN_TIMEOUT_MS = 1500;

/** Turns one IndexedDB request into a promise of its result. */
function settled<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('the request failed'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    // Runs the first time, and whenever the version number above is raised.
    request.onupgradeneeded = () => {
      request.result.createObjectStore(TABLE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('the database would not open'));
    request.onblocked = () => reject(new Error('the database is held by another page'));
    window.setTimeout(() => reject(new Error('the database did not answer')), OPEN_TIMEOUT_MS);
  });
}

function databaseStore(database: IDBDatabase): Store {
  const table = (mode: IDBTransactionMode) => database.transaction(TABLE, mode).objectStore(TABLE);
  return {
    get: (key) => settled(table('readonly').get(key) as IDBRequest<unknown>),
    set: (key, value) => settled(table('readwrite').put(value, key)).then(() => undefined),
    delete: (key) => settled(table('readwrite').delete(key)).then(() => undefined),
  };
}

/**
 * The device's store. When the browser's database cannot be used the app must
 * still work, so a failure here gives a store that forgets instead of an error;
 * a failure to read or write later is likewise swallowed by `forgiving`.
 */
export async function openStore(): Promise<Store> {
  try {
    if (typeof indexedDB === 'undefined') return memoryStore();
    return forgiving(databaseStore(await openDatabase()));
  } catch {
    return memoryStore();
  }
}

/** A store whose failures read as "nothing kept" and whose writes may be lost. */
export function forgiving(store: Store): Store {
  return {
    get: (key) => store.get(key).catch(() => undefined),
    set: (key, value) => store.set(key, value).catch(() => undefined),
    delete: (key) => store.delete(key).catch(() => undefined),
  };
}
