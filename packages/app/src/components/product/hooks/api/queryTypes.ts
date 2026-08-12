/**
 * Base result shapes shared by all product hooks.
 *
 * Single-value hooks return `AsyncResult<T>` where `data` is always defined
 * (callers default to empty arrays / undefined as appropriate in the wrapper).
 * Paginated list hooks return `PaginatedResult<T>`.
 */

export type AsyncResult<T> = {
    data: T;
    loading: boolean;
    error?: Error;
    refetch: () => void;
};

export type PaginatedResult<T> = AsyncResult<T[]> & {
    hasMore: boolean;
    loadMore: () => void;
    isFetchingMore: boolean;
};
