// Minimal promise wrapper over IndexedDB. One database per signed-in user, so work saved on a shared
// device never mixes between people and is wiped when that user signs out.

const STORES = ['kv', 'projects', 'outbox'] as const;
export type StoreName = (typeof STORES)[number];

const dbName = (userId: string) => `planner-${userId}`;
const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((ok, fail) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });

export class UserDb {
  private constructor(private db: IDBDatabase) {}

  static open(userId: string): Promise<UserDb> {
    return new Promise((ok, fail) => {
      const r = indexedDB.open(dbName(userId), 1);
      r.onupgradeneeded = () => {
        for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s);
      };
      r.onsuccess = () => ok(new UserDb(r.result));
      r.onerror = () => fail(r.error);
      r.onblocked = () => fail(new Error('IndexedDB bloqueada por otra pestaña'));
    });
  }

  static async destroy(userId: string) {
    await new Promise<void>((ok) => {
      const r = indexedDB.deleteDatabase(dbName(userId));
      r.onsuccess = r.onerror = r.onblocked = () => ok();
    });
  }

  close() {
    this.db.close();
  }

  private store(name: StoreName, mode: IDBTransactionMode) {
    return this.db.transaction(name, mode).objectStore(name);
  }
  get<T>(name: StoreName, key: string): Promise<T | undefined> {
    return req(this.store(name, 'readonly').get(key)) as Promise<T | undefined>;
  }
  put<T>(name: StoreName, key: string, value: T): Promise<unknown> {
    return req(this.store(name, 'readwrite').put(value, key));
  }
  del(name: StoreName, key: string): Promise<unknown> {
    return req(this.store(name, 'readwrite').delete(key));
  }
  all<T>(name: StoreName): Promise<T[]> {
    return req(this.store(name, 'readonly').getAll()) as Promise<T[]>;
  }
}
