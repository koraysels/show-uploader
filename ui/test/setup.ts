// Mock window and location for tests
class MockStorage implements Storage {
  private data: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.data[key] ?? null;
  }

  setItem(key: string, value: string): void {
    this.data[key] = value;
  }

  removeItem(key: string): void {
    delete this.data[key];
  }

  clear(): void {
    this.data = {};
  }

  key(index: number): string | null {
    const keys = Object.keys(this.data);
    return keys[index] ?? null;
  }

  get length(): number {
    return Object.keys(this.data).length;
  }
}

Object.defineProperty(globalThis, 'window', {
  value: {
    location: { origin: 'http://localhost:3000' },
    localStorage: new MockStorage(),
  },
});
