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

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export type PaginatedResult<T> = AsyncResult<T[]> & {
    page: number;
    pageSize: number;
    setPageSize: (size: number) => void;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    nextPage: () => void;
    previousPage: () => void;
    isFetchingPage: boolean;
};
