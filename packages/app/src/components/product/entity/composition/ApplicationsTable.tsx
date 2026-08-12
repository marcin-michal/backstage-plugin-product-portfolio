import {
    Button,
    CircularProgress,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import {
    KonfluxResource,
    KonfluxResourceBinding,
    getResourceDisplayName,
} from '@internal/backstage-plugin-konflux-common';
import { KonfluxApiError } from '../../hooks/api/konfluxApi';
import { useCompositionStyles } from './composition.styles';
import { SnapshotsTable } from './SnapshotsTable';

export interface ApplicationsTableProps {
    configured: boolean;
    hasAnyToken: boolean;
    showSnapshots: boolean;
    konfluxBindings: KonfluxResourceBinding[];
    filteredData: KonfluxResource[];
    resourcesLoading: boolean;
    resourcesError?: Error;
    search: string;
    hasMore: boolean;
    onLoadMore: () => void;
}

export const ApplicationsTable = ({
    configured,
    hasAnyToken,
    showSnapshots,
    konfluxBindings,
    filteredData,
    resourcesLoading,
    resourcesError,
    search,
    hasMore,
    onLoadMore,
}: ApplicationsTableProps) => {
    const classes = useCompositionStyles();

    if (!configured) {
        return null;
    }

    const title = showSnapshots ? 'Applications (saved snapshots)' : 'Applications';

    return (
        <div className={classes.section}>
            <Typography variant="h6">{title}</Typography>

            {resourcesLoading && hasAnyToken && (
                <CircularProgress size={24} />
            )}

            {resourcesError &&
                !(
                    resourcesError instanceof KonfluxApiError &&
                    resourcesError.statusCode === 401
                ) && (
                    <Alert severity="error">{resourcesError.message}</Alert>
                )}

            {!resourcesLoading &&
                hasAnyToken &&
                filteredData.length === 0 &&
                konfluxBindings.length > 0 && (
                    <Alert severity="info">
                        No live resources matched the configured bindings
                        {search ? ` for "${search}"` : ''}.
                    </Alert>
                )}

            {filteredData.length > 0 && (
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Name</TableCell>
                            <TableCell>Namespace</TableCell>
                            <TableCell>Cluster</TableCell>
                            <TableCell>Created</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {filteredData.map(item => {
                            const rowKey = [
                                item.cluster?.name,
                                item.metadata?.namespace,
                                item.metadata?.uid ?? item.metadata?.name,
                            ].join(':');

                            return (
                                <TableRow key={rowKey}>
                                    <TableCell>
                                        {getResourceDisplayName(item) ??
                                            item.metadata?.name}
                                    </TableCell>
                                    <TableCell>
                                        {item.metadata?.namespace}
                                    </TableCell>
                                    <TableCell>{item.cluster?.name}</TableCell>
                                    <TableCell>
                                        {item.metadata?.creationTimestamp
                                            ? new Date(
                                                  item.metadata.creationTimestamp,
                                              ).toLocaleString()
                                            : '—'}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            )}

            {showSnapshots && (
                <SnapshotsTable konfluxBindings={konfluxBindings} />
            )}

            {hasMore && hasAnyToken && (
                <Button
                    variant="outlined"
                    onClick={onLoadMore}
                    disabled={resourcesLoading}
                >
                    Load more
                </Button>
            )}
        </div>
    );
};
