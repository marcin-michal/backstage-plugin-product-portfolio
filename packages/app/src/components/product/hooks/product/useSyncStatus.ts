import { SyncStatus } from '@internal/backstage-plugin-konflux-common';
import { AsyncResult } from '../api/queryTypes';
import { useKonfluxQuery } from '../konflux/useKonfluxQuery';

export const useSyncStatus = (): AsyncResult<SyncStatus | undefined> => {
    return useKonfluxQuery<SyncStatus>(
        ['konflux', 'sync-status'],
        '/sync/status',
    );
};
