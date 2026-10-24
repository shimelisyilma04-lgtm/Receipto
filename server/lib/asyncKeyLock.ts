// Synchronous/Async lock to serialize concurrent write operations per key
export class AsyncKeyLock {
  private queues = new Map<string, Promise<void>>();

  async acquire<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
    while (this.queues.has(key)) {
      await this.queues.get(key);
    }
    let release!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.queues.set(key, lockPromise);
    try {
      return await fn();
    } finally {
      this.queues.delete(key);
      release();
    }
  }
}
