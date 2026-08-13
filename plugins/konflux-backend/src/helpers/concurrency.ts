/**
 * Run async work over items with a fixed concurrency limit.
 *
 * Workers are started eagerly up to `concurrency`, then each worker picks the
 * next item as soon as it finishes its current one — a classic worker-pool
 * pattern that prevents thundering-herd against the API server.
 */
export async function mapPool<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>,
): Promise<void> {
    if (items.length === 0) {
        return;
    }

    const limit = Math.max(1, concurrency);
    let nextIndex = 0;

    const runners = Array.from(
        { length: Math.min(limit, items.length) },
        async () => {
            while (nextIndex < items.length) {
                const current = items[nextIndex];
                nextIndex += 1;
                await worker(current);
            }
        },
    );

    await Promise.all(runners);
}
