export async function withNoRetry<T>(operation: () => Promise<T>): Promise<T> {
  return operation();
}

