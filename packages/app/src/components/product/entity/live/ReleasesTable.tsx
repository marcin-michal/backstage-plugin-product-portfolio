import {
    Box,
    Chip,
    CircularProgress,
    Link,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import {
    ClusterPublicInfo,
    KonfluxResource,
    getApplicationFromResource,
} from '@internal/backstage-plugin-konflux-common';
import { PaginatedResult } from '../../hooks/api/queryTypes';
import {
    clusterDisplayName,
    clusterUiUrl,
    getKonfluxUIReleaseUrl,
} from '../../utils/konfluxUrls';
import { useCompositionStyles } from '../composition/composition.styles';
import { LiveTablePagination, RefreshButton } from './LiveTableControls';
import {
    formatTimestamp,
    releaseStatus,
    resourceClusterId,
    resourceKey,
    statusChipColor,
} from './liveResourceUtils';

export interface ReleasesTableProps {
    result: PaginatedResult<KonfluxResource>;
    clusters: ClusterPublicInfo[];
    idleMessage?: string;
}

export const ReleasesTable = ({
    result,
    clusters,
    idleMessage,
}: ReleasesTableProps) => {
    const classes = useCompositionStyles();
    const {
        data,
        loading,
        error,
        refetch,
        page,
        pageSize,
        setPageSize,
        hasNextPage,
        hasPreviousPage,
        nextPage,
        previousPage,
        isFetchingPage,
    } = result;

    return (
        <div className={classes.section}>
            <div className={classes.headerRow}>
                <Typography variant="h6">Releases</Typography>
                <RefreshButton
                    onClick={refetch}
                    disabled={loading || isFetchingPage}
                />
            </div>
            {error && (
                <Alert severity="error">
                    Failed to load releases: {error.message}
                </Alert>
            )}
            {loading && data.length === 0 && (
                <Box py={1}>
                    <CircularProgress size={24} />
                </Box>
            )}
            {!loading && data.length === 0 && (
                <Typography variant="body2" color="textSecondary">
                    {idleMessage ?? 'No releases found.'}
                </Typography>
            )}
            {data.length > 0 && (
                <>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Name</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Application</TableCell>
                                <TableCell>Cluster</TableCell>
                                <TableCell>Namespace</TableCell>
                                <TableCell>Created</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {data.map((resource, index) => {
                                const clusterId = resourceClusterId(resource);
                                const namespace =
                                    resource.metadata?.namespace ?? '';
                                const name = resource.metadata?.name ?? '';
                                const application =
                                    getApplicationFromResource(resource) ?? '';
                                const uiUrl = clusterUiUrl(clusters, clusterId);
                                const href =
                                    uiUrl && namespace && application && name
                                        ? getKonfluxUIReleaseUrl(
                                              uiUrl,
                                              namespace,
                                              application,
                                              name,
                                          )
                                        : undefined;
                                const status = releaseStatus(resource);

                                return (
                                    <TableRow
                                        key={resourceKey(resource, index)}
                                    >
                                        <TableCell>
                                            {href ? (
                                                <Link
                                                    href={href}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                >
                                                    {name}
                                                </Link>
                                            ) : (
                                                name || '—'
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                size="small"
                                                label={status}
                                                color={statusChipColor(status)}
                                                variant={
                                                    status === 'Succeeded'
                                                        ? 'default'
                                                        : 'outlined'
                                                }
                                            />
                                        </TableCell>
                                        <TableCell>
                                            {application || '—'}
                                        </TableCell>
                                        <TableCell>
                                            {clusterDisplayName(
                                                clusters,
                                                clusterId,
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {namespace || '—'}
                                        </TableCell>
                                        <TableCell>
                                            {formatTimestamp(
                                                resource.metadata
                                                    ?.creationTimestamp,
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                    <LiveTablePagination
                        page={page}
                        pageSize={pageSize}
                        rowCount={data.length}
                        hasNextPage={hasNextPage}
                        hasPreviousPage={hasPreviousPage}
                        isFetchingPage={isFetchingPage}
                        onNextPage={nextPage}
                        onPreviousPage={previousPage}
                        onPageSizeChange={setPageSize}
                    />
                </>
            )}
        </div>
    );
};
