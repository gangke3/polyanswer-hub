export async function runInParallel<T>(operations: Array<() => Promise<T>>): Promise<T[]> {
  return Promise.all(operations.map((operation) => operation()));
}

