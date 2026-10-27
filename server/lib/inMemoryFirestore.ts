/**
 * In-Memory Firestore Implementation for Unit Testing and Hermetic CI.
 * Conforms faithfully to the Firebase Admin Firestore API:
 * DocumentReference, CollectionReference, Query, QuerySnapshot, Batch, Transaction, and CollectionGroup.
 */

export interface SnapshotData {
  [key: string]: any;
}

export class MockDocumentSnapshot {
  constructor(
    public readonly id: string,
    public readonly ref: MockDocumentReference,
    private readonly _data: SnapshotData | undefined,
    public readonly exists: boolean
  ) {}

  data(): SnapshotData | undefined {
    return this._data ? JSON.parse(JSON.stringify(this._data)) : undefined;
  }

  get(field: string): any {
    return this._data ? this._data[field] : undefined;
  }
}

export class MockQuerySnapshot {
  constructor(public readonly docs: MockDocumentSnapshot[]) {}

  get empty(): boolean {
    return this.docs.length === 0;
  }

  get size(): number {
    return this.docs.length;
  }

  forEach(callback: (result: MockDocumentSnapshot) => void): void {
    this.docs.forEach(callback);
  }
}

export type WhereFilterOp = '<' | '<=' | '==' | '!=' | '>=' | '>' | 'array-contains' | 'in' | 'array-contains-any' | 'not-in';

export interface QueryFilter {
  field: string;
  op: WhereFilterOp;
  value: any;
}

export interface QueryOrderBy {
  field: string;
  direction: 'asc' | 'desc';
}

export class MockQuery {
  protected filters: QueryFilter[] = [];
  protected orderBys: QueryOrderBy[] = [];
  protected limitCount?: number;
  protected offsetCount?: number;

  constructor(
    protected readonly db: InMemoryFirestore,
    protected readonly collectionPathMatcher: (path: string) => boolean
  ) {}

  where(field: string, op: WhereFilterOp, value: any): MockQuery {
    const q = new MockQuery(this.db, this.collectionPathMatcher);
    q.filters = [...this.filters, { field, op, value }];
    q.orderBys = [...this.orderBys];
    q.limitCount = this.limitCount;
    q.offsetCount = this.offsetCount;
    return q;
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): MockQuery {
    const q = new MockQuery(this.db, this.collectionPathMatcher);
    q.filters = [...this.filters];
    q.orderBys = [...this.orderBys, { field, direction }];
    q.limitCount = this.limitCount;
    q.offsetCount = this.offsetCount;
    return q;
  }

  limit(n: number): MockQuery {
    const q = new MockQuery(this.db, this.collectionPathMatcher);
    q.filters = [...this.filters];
    q.orderBys = [...this.orderBys];
    q.limitCount = n;
    q.offsetCount = this.offsetCount;
    return q;
  }

  offset(n: number): MockQuery {
    const q = new MockQuery(this.db, this.collectionPathMatcher);
    q.filters = [...this.filters];
    q.orderBys = [...this.orderBys];
    q.limitCount = this.limitCount;
    q.offsetCount = n;
    return q;
  }

  async get(): Promise<MockQuerySnapshot> {
    const allDocs = this.db.getAllDocsMatching(this.collectionPathMatcher);
    let matched = allDocs.filter((doc) => {
      for (const f of this.filters) {
        const val = doc.data[f.field];
        switch (f.op) {
          case '==':
            if (val !== f.value) return false;
            break;
          case '!=':
            if (val === f.value) return false;
            break;
          case '>':
            if (!(val > f.value)) return false;
            break;
          case '>=':
            if (!(val >= f.value)) return false;
            break;
          case '<':
            if (!(val < f.value)) return false;
            break;
          case '<=':
            if (!(val <= f.value)) return false;
            break;
          case 'in':
            if (!Array.isArray(f.value) || !f.value.includes(val)) return false;
            break;
          case 'array-contains':
            if (!Array.isArray(val) || !val.includes(f.value)) return false;
            break;
          default:
            break;
        }
      }
      return true;
    });

    for (const ob of this.orderBys) {
      matched.sort((a, b) => {
        const va = a.data[ob.field] ?? '';
        const vb = b.data[ob.field] ?? '';
        const cmp = String(va).localeCompare(String(vb));
        return ob.direction === 'desc' ? -cmp : cmp;
      });
    }

    if (this.offsetCount) {
      matched = matched.slice(this.offsetCount);
    }
    if (this.limitCount !== undefined) {
      matched = matched.slice(0, this.limitCount);
    }

    const snaps = matched.map(
      (m) =>
        new MockDocumentSnapshot(
          m.id,
          new MockDocumentReference(this.db, m.path),
          m.data,
          true
        )
    );
    return new MockQuerySnapshot(snaps);
  }
}

export class MockCollectionReference extends MockQuery {
  public readonly id: string;

  constructor(db: InMemoryFirestore, public readonly path: string) {
    const parts = path.split('/').filter(Boolean);
    const id = parts[parts.length - 1];
    super(db, (docPath) => {
      const docParts = docPath.split('/').filter(Boolean);
      // Doc belongs to this collection if docParts.slice(0, -1) matches parts
      if (docParts.length !== parts.length + 1) return false;
      return parts.every((p, i) => docParts[i] === p);
    });
    this.id = id;
  }

  doc(id?: string): MockDocumentReference {
    const docId = id || crypto.randomUUID();
    return new MockDocumentReference(this.db, `${this.path}/${docId}`);
  }

  async add(data: SnapshotData): Promise<MockDocumentReference> {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
}

export class MockDocumentReference {
  public readonly id: string;

  constructor(private readonly db: InMemoryFirestore, public readonly path: string) {
    const parts = path.split('/').filter(Boolean);
    this.id = parts[parts.length - 1];
  }

  collection(subcollectionName: string): MockCollectionReference {
    return new MockCollectionReference(this.db, `${this.path}/${subcollectionName}`);
  }

  async get(): Promise<MockDocumentSnapshot> {
    const data = this.db.getRaw(this.path);
    if (!data) {
      return new MockDocumentSnapshot(this.id, this, undefined, false);
    }
    return new MockDocumentSnapshot(this.id, this, data, true);
  }

  async set(data: SnapshotData, options?: { merge?: boolean }): Promise<{ writeTime: Date }> {
    if (options?.merge) {
      const existing = this.db.getRaw(this.path) || {};
      this.db.setRaw(this.path, { ...existing, ...data });
    } else {
      this.db.setRaw(this.path, { ...data });
    }
    return { writeTime: new Date() };
  }

  async update(data: SnapshotData): Promise<{ writeTime: Date }> {
    const existing = this.db.getRaw(this.path);
    if (!existing) {
      const err: any = new Error(`No document to update: ${this.path}`);
      err.code = 5; // NOT_FOUND
      throw err;
    }
    this.db.setRaw(this.path, { ...existing, ...data });
    return { writeTime: new Date() };
  }

  async delete(): Promise<{ writeTime: Date }> {
    this.db.deleteRaw(this.path);
    return { writeTime: new Date() };
  }
}

export class MockWriteBatch {
  private ops: Array<() => Promise<void>> = [];

  constructor(private readonly db: InMemoryFirestore) {}

  set(ref: MockDocumentReference, data: SnapshotData, options?: { merge?: boolean }): MockWriteBatch {
    this.ops.push(() => ref.set(data, options).then(() => {}));
    return this;
  }

  update(ref: MockDocumentReference, data: SnapshotData): MockWriteBatch {
    this.ops.push(() => ref.update(data).then(() => {}));
    return this;
  }

  delete(ref: MockDocumentReference): MockWriteBatch {
    this.ops.push(() => ref.delete().then(() => {}));
    return this;
  }

  async commit(): Promise<void> {
    for (const op of this.ops) {
      await op();
    }
  }
}

export class InMemoryFirestore {
  private store = new Map<string, SnapshotData>();

  collection(path: string): MockCollectionReference {
    return new MockCollectionReference(this, path);
  }

  doc(path: string): MockDocumentReference {
    return new MockDocumentReference(this, path);
  }

  collectionGroup(collectionId: string): MockQuery {
    return new MockQuery(this, (docPath) => {
      const parts = docPath.split('/').filter(Boolean);
      // In a subcollection, collection name is the second-to-last part (e.g. users/u1/clients/c1 -> clients)
      return parts.length >= 2 && parts[parts.length - 2] === collectionId;
    });
  }

  batch(): MockWriteBatch {
    return new MockWriteBatch(this);
  }

  async runTransaction<T>(updateFunction: (transaction: {
    get: (ref: MockDocumentReference) => Promise<MockDocumentSnapshot>;
    set: (ref: MockDocumentReference, data: SnapshotData, options?: { merge?: boolean }) => void;
    update: (ref: MockDocumentReference, data: SnapshotData) => void;
    delete: (ref: MockDocumentReference) => void;
  }) => Promise<T>): Promise<T> {
    const stagedOps: Array<() => Promise<void>> = [];
    const transaction = {
      get: async (ref: MockDocumentReference) => await ref.get(),
      set: (ref: MockDocumentReference, data: SnapshotData, options?: { merge?: boolean }) => {
        stagedOps.push(() => ref.set(data, options).then(() => {}));
      },
      update: (ref: MockDocumentReference, data: SnapshotData) => {
        stagedOps.push(() => ref.update(data).then(() => {}));
      },
      delete: (ref: MockDocumentReference) => {
        stagedOps.push(() => ref.delete().then(() => {}));
      },
    };

    const result = await updateFunction(transaction);
    for (const op of stagedOps) {
      await op();
    }
    return result;
  }

  getRaw(path: string): SnapshotData | undefined {
    return this.store.get(path);
  }

  setRaw(path: string, data: SnapshotData): void {
    this.store.set(path, JSON.parse(JSON.stringify(data)));
  }

  deleteRaw(path: string): void {
    this.store.delete(path);
    // Also delete any subcollections/nested documents underneath this path
    for (const key of this.store.keys()) {
      if (key.startsWith(`${path}/`)) {
        this.store.delete(key);
      }
    }
  }

  getAllDocsMatching(predicate: (path: string) => boolean): Array<{ path: string; id: string; data: SnapshotData }> {
    const results: Array<{ path: string; id: string; data: SnapshotData }> = [];
    for (const [path, data] of this.store.entries()) {
      if (predicate(path)) {
        const parts = path.split('/').filter(Boolean);
        results.push({
          path,
          id: parts[parts.length - 1],
          data,
        });
      }
    }
    return results;
  }

  clear(): void {
    this.store.clear();
  }
}
