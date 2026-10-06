/** Run fn over items with at most `limit` in flight. Stops early when shouldStop() is true. */
export async function mapPool(items, limit, fn, shouldStop = () => false) {
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      if (await shouldStop()) return;
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
