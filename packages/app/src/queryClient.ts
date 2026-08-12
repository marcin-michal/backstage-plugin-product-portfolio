import { QueryClient } from '@tanstack/react-query';

/**
 * Shared TanStack Query client for plugin data fetching.
 *
 * The app is built on the new Backstage frontend system, which doesn't
 * currently expose a root-wrapper extension point, so this is a module-level
 * singleton rather than something wired up in `App.tsx`. Any component can
 * import it and wrap itself in a `QueryClientProvider` — the singleton
 * identity means the cache is shared across all of them regardless of where
 * they mount in the tree.
 */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            retry: false,
        },
    },
});
