import { useEffect, useMemo, useState } from 'react';
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Typography,
    makeStyles,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { useEntity } from '@backstage/plugin-catalog-react';
import {
    KONFLUX_NAMESPACES_ANNOTATION,
    getComponentApplication,
    getComponentGitUrl,
    parseNamespaceMappings,
} from '@internal/backstage-plugin-konflux-common';
import { useKonfluxTokens } from '../../hooks/useKonfluxTokens';
import {
    useKonfluxClusters,
    useKonfluxProjects,
    useKonfluxResources,
} from '../../hooks/useKonfluxResources';
import { KonfluxTokenDialog } from './KonfluxTokenDialog';

const useStyles = makeStyles(theme => ({
    root: {
        padding: theme.spacing(2),
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing(2),
    },
    authBar: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: theme.spacing(1),
        alignItems: 'center',
    },
    filters: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: theme.spacing(2),
        alignItems: 'flex-end',
    },
    filterControl: {
        minWidth: 180,
    },
}));

/**
 * Product-centric Konflux tab for System entity pages.
 */
export function KonfluxEntityTab() {
    const classes = useStyles();
    const { entity } = useEntity();
    const {
        clusters,
        loading: clustersLoading,
        error: clustersError,
    } = useKonfluxClusters();

    const clusterIds = useMemo(() => clusters.map(c => c.id), [clusters]);
    const {
        tokens,
        setToken,
        clearToken,
        markExpired,
        hasToken,
    } = useKonfluxTokens(clusterIds);

    const namespaceMappings = useMemo(
        () =>
            parseNamespaceMappings(
                entity.metadata.annotations?.[KONFLUX_NAMESPACES_ANNOTATION],
            ),
        [entity.metadata.annotations],
    );

    const [authClusterId, setAuthClusterId] = useState<string>();
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [clusterFilter, setClusterFilter] = useState('');
    const [namespaceFilter, setNamespaceFilter] = useState('');
    const [resourceView, setResourceView] = useState<
        'applications' | 'components'
    >('applications');

    const hasAnyToken = Object.keys(tokens).length > 0;

    const {
        projects,
        loading: projectsLoading,
        error: projectsError,
    } = useKonfluxProjects(tokens, hasAnyToken && !namespaceMappings);

    useEffect(() => {
        if (
            projectsError?.statusCode === 401 &&
            projectsError.missingClusters
        ) {
            for (const id of projectsError.missingClusters) {
                markExpired(id);
            }
        }
    }, [projectsError, markExpired]);

    const namespaceOptions = useMemo(() => {
        if (namespaceMappings) {
            return namespaceMappings
                .filter(m => !clusterFilter || m.cluster === clusterFilter)
                .map(m => ({
                    cluster: m.cluster,
                    namespace: m.namespace,
                    label: `${m.namespace} (${m.cluster})`,
                }));
        }

        const opts: Array<{
            cluster: string;
            namespace: string;
            label: string;
        }> = [];
        for (const [clusterId, nsList] of Object.entries(projects)) {
            if (clusterFilter && clusterId !== clusterFilter) {
                continue;
            }
            for (const ns of nsList) {
                opts.push({
                    cluster: clusterId,
                    namespace: ns,
                    label: `${ns} (${clusterId})`,
                });
            }
        }
        return opts;
    }, [namespaceMappings, projects, clusterFilter]);

    const {
        data,
        loading: resourcesLoading,
        error: resourcesError,
        refetch,
        hasMore,
        loadMore,
    } = useKonfluxResources(resourceView, tokens, {
        cluster: clusterFilter || undefined,
        namespace: namespaceFilter || undefined,
        search: search || undefined,
        namespaceMappings,
        enabled: hasAnyToken,
    });

    useEffect(() => {
        if (
            resourcesError?.statusCode === 401 &&
            resourcesError.missingClusters
        ) {
            for (const id of resourcesError.missingClusters) {
                markExpired(id);
            }
        }
    }, [resourcesError, markExpired]);

    const authCluster = clusters.find(c => c.id === authClusterId);

    if (clustersLoading) {
        return (
            <Box p={2}>
                <CircularProgress size={24} />
            </Box>
        );
    }

    if (clustersError) {
        return (
            <Box p={2}>
                <Alert severity="error">
                    Failed to load Konflux clusters: {clustersError.message}
                </Alert>
            </Box>
        );
    }

    if (clusters.length === 0) {
        return (
            <Box p={2}>
                <Alert severity="info">
                    No Konflux clusters configured. Add a{' '}
                    <code>konflux.clusters</code> section to app-config.yaml.
                </Alert>
            </Box>
        );
    }

    return (
        <div className={classes.root}>
            <Typography variant="h5">Konflux</Typography>
            <Typography variant="body2" color="textSecondary">
                Konflux Applications and Components for{' '}
                <strong>{entity.metadata.name}</strong>
                {namespaceMappings
                    ? ' — scoped by entity namespace annotations'
                    : ' — from Konflux tenant namespaces your token can access'}
            </Typography>

            <div className={classes.authBar}>
                <Typography variant="subtitle2">Clusters:</Typography>
                {clusters.map(cluster => {
                    const connected = hasToken(cluster.id);
                    const label = cluster.name || cluster.id;
                    return (
                        <Chip
                            key={cluster.id}
                            label={
                                connected
                                    ? `${label} · connected`
                                    : `${label} · connect`
                            }
                            color={connected ? 'primary' : 'default'}
                            variant={connected ? 'default' : 'outlined'}
                            onClick={() => setAuthClusterId(cluster.id)}
                            onDelete={
                                connected
                                    ? () => clearToken(cluster.id)
                                    : undefined
                            }
                            title={
                                connected
                                    ? `Re-authenticate or disconnect ${label}`
                                    : `Paste an OpenShift token for ${label}`
                            }
                        />
                    );
                })}
            </div>

            {!hasAnyToken && (
                <Alert severity="warning">
                    Each cluster needs its own OpenShift token (a token from
                    staging will not work on production). Click a cluster chip
                    above, open that cluster&apos;s console token page, and
                    paste the token.
                </Alert>
            )}

            {hasAnyToken && (
                <>
                    <div className={classes.filters}>
                        <TextField
                            className={classes.filterControl}
                            label="Search"
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    setSearch(searchInput.trim());
                                }
                            }}
                            placeholder="Filter by name…"
                        />
                        <Button
                            variant="outlined"
                            onClick={() => setSearch(searchInput.trim())}
                        >
                            Search
                        </Button>

                        <FormControl className={classes.filterControl}>
                            <InputLabel>Cluster</InputLabel>
                            <Select
                                value={clusterFilter}
                                onChange={e => {
                                    setClusterFilter(e.target.value as string);
                                    setNamespaceFilter('');
                                }}
                            >
                                <MenuItem value="">All</MenuItem>
                                {clusters.map(c => (
                                    <MenuItem key={c.id} value={c.id}>
                                        {c.name || c.id}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControl className={classes.filterControl}>
                            <InputLabel>Namespace</InputLabel>
                            <Select
                                value={namespaceFilter}
                                onChange={e =>
                                    setNamespaceFilter(e.target.value as string)
                                }
                                disabled={projectsLoading}
                            >
                                <MenuItem value="">All</MenuItem>
                                {namespaceOptions.map(opt => (
                                    <MenuItem
                                        key={`${opt.cluster}:${opt.namespace}`}
                                        value={opt.namespace}
                                    >
                                        {opt.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <FormControl className={classes.filterControl}>
                            <InputLabel>Resource</InputLabel>
                            <Select
                                value={resourceView}
                                onChange={e =>
                                    setResourceView(
                                        e.target.value as
                                            | 'applications'
                                            | 'components',
                                    )
                                }
                            >
                                <MenuItem value="applications">
                                    Applications
                                </MenuItem>
                                <MenuItem value="components">
                                    Components
                                </MenuItem>
                            </Select>
                        </FormControl>

                        <Button variant="text" onClick={() => refetch()}>
                            Refresh
                        </Button>
                    </div>

                    {(resourcesLoading || projectsLoading) && (
                        <CircularProgress size={24} />
                    )}

                    {resourcesError && resourcesError.statusCode !== 401 && (
                        <Alert severity="error">{resourcesError.message}</Alert>
                    )}

                    {!resourcesLoading && data.length === 0 && (
                        <Alert severity="info">No resources found.</Alert>
                    )}

                    {data.length > 0 && (
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Name</TableCell>
                                    <TableCell>Namespace</TableCell>
                                    <TableCell>Cluster</TableCell>
                                    <TableCell>Created</TableCell>
                                    {resourceView === 'components' && (
                                        <>
                                            <TableCell>Application</TableCell>
                                            <TableCell>Source</TableCell>
                                        </>
                                    )}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {data.map(item => {
                                    const rowKey = [
                                        item.cluster?.name,
                                        item.metadata?.namespace,
                                        item.metadata?.uid ??
                                            item.metadata?.name,
                                    ].join(':');

                                    return (
                                        <TableRow key={rowKey}>
                                            <TableCell>
                                                {item.metadata?.name}
                                            </TableCell>
                                            <TableCell>
                                                {item.metadata?.namespace}
                                            </TableCell>
                                            <TableCell>
                                                {item.cluster?.name}
                                            </TableCell>
                                            <TableCell>
                                                {item.metadata
                                                    ?.creationTimestamp
                                                    ? new Date(
                                                          item.metadata.creationTimestamp,
                                                      ).toLocaleString()
                                                    : '—'}
                                            </TableCell>
                                            {resourceView === 'components' && (
                                                <>
                                                    <TableCell>
                                                        {getComponentApplication(
                                                            item,
                                                        ) ?? '—'}
                                                    </TableCell>
                                                    <TableCell>
                                                        {getComponentGitUrl(
                                                            item,
                                                        ) ?? '—'}
                                                    </TableCell>
                                                </>
                                            )}
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}

                    {hasMore && (
                        <Button
                            variant="outlined"
                            onClick={loadMore}
                            disabled={resourcesLoading}
                        >
                            Load more
                        </Button>
                    )}
                </>
            )}

            {authCluster && (
                <KonfluxTokenDialog
                    cluster={authCluster}
                    open={!!authClusterId}
                    onAuthenticated={(id, token) => setToken(id, token)}
                    onClose={() => setAuthClusterId(undefined)}
                />
            )}
        </div>
    );
}
