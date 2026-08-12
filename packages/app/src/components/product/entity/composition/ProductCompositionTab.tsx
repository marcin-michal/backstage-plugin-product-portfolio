import { useMemo, useState } from 'react';
import { Box, CircularProgress, Typography } from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { useEntity } from '@backstage/plugin-catalog-react';
import {
    useKonfluxApplications,
    useKonfluxClusters,
    useKonfluxTokens,
    useExpireTokensOn401,
} from '../../hooks/konflux';
import {
    useProductConfig,
    ProductConfigSaveInput,
} from '../../hooks/product/useProductConfig';
import { useEntitiesByRefs } from '../../hooks/catalog/useEntitiesByRefs';
import { useBindingRefresh } from '../../hooks/product/useBindingRefresh';
import { ClusterAuthBar } from '../../shared/ClusterAuthBar';
import { KonfluxTokenDialog } from '../../shared/KonfluxTokenDialog';
import { QueryClientBoundary } from '../../shared/QueryClientBoundary';
import { ResourcePickerDialog } from '../../shared/ResourcePickerDialog/ResourcePickerDialog';
import { bindingsToNamespaceMappings } from '../../utils/bindings';
import { filterConfiguredApplications } from '../../utils/filterConfiguredResources';
import { ApplicationsTable } from './ApplicationsTable';
import { CompositionAlerts } from './CompositionAlerts';
import { CompositionFilters } from './CompositionFilters';
import { CompositionHeader } from './CompositionHeader';
import { useCompositionStyles } from './composition.styles';
import { PyxisListingsTable } from './PyxisListingsTable';

const ProductCompositionTabContent = () => {
    const classes = useCompositionStyles();
    const { entity } = useEntity();
    const entityRef = stringifyEntityRef(entity);

    const {
        data: clusters,
        loading: clustersLoading,
        error: clustersError,
    } = useKonfluxClusters();
    const clusterIds = useMemo(() => clusters.map(c => c.id), [clusters]);
    const { tokens, setToken, clearToken, markExpired, hasToken } =
        useKonfluxTokens(clusterIds);

    const {
        config,
        loading: configLoading,
        error: configError,
        save,
        configured,
        refetch: refetchConfig,
    } = useProductConfig(entityRef);

    const konfluxBindings = useMemo(
        () => config?.konfluxBindings ?? [],
        [config?.konfluxBindings],
    );
    const pyxisBindings = useMemo(
        () => config?.pyxisBindings ?? [],
        [config?.pyxisBindings],
    );
    const namespaceMappings = useMemo(
        () => bindingsToNamespaceMappings(konfluxBindings),
        [konfluxBindings],
    );

    const hasAnyToken = Object.keys(tokens).length > 0;
    const productName = entity.metadata.title ?? entity.metadata.name;

    const [authClusterId, setAuthClusterId] = useState<string>();
    const [pickerOpen, setPickerOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [clusterFilter, setClusterFilter] = useState('');
    const [namespaceFilter, setNamespaceFilter] = useState('');

    const namespaceOptions = useMemo(
        () =>
            namespaceMappings
                .filter(m => !clusterFilter || m.cluster === clusterFilter)
                .map(m => ({
                    cluster: m.cluster,
                    namespace: m.namespace,
                    label: `${m.namespace} (${m.cluster})`,
                })),
        [namespaceMappings, clusterFilter],
    );

    const missingBindingClusters = useMemo(() => {
        const needed = new Set(konfluxBindings.map(b => b.cluster));
        return [...needed].filter(id => !tokens[id]);
    }, [konfluxBindings, tokens]);

    const sharedResourceOptions = {
        cluster: clusterFilter || undefined,
        namespace: namespaceFilter || undefined,
        search: search || undefined,
        namespaceMappings:
            namespaceMappings.length > 0 ? namespaceMappings : undefined,
    };
    const liveEnabled =
        configured && hasAnyToken && namespaceMappings.length > 0;

    const {
        data: liveData,
        loading: resourcesLoading,
        error: resourcesError,
        hasMore,
        loadMore,
        refetch,
    } = useKonfluxApplications(tokens, {
        ...sharedResourceOptions,
        enabled: liveEnabled,
    });

    useExpireTokensOn401(resourcesError, markExpired);

    const pyxisEntityRefs = useMemo(
        () => (configured ? pyxisBindings.map(b => b.entityRef) : []),
        [configured, pyxisBindings],
    );
    const {
        data: pyxisEntities,
        loading: pyxisLoading,
        error: pyxisError,
    } = useEntitiesByRefs(pyxisEntityRefs);

    const { refreshing, refreshError, refresh, dismissRefreshError } =
        useBindingRefresh({
            configured,
            hasAnyToken,
            konfluxBindings,
            pyxisBindings,
            tokens,
            save,
            refetchConfig,
            onLiveRefetch: refetch,
        });

    const filteredData = useMemo(() => {
        if (!configured) {
            return [];
        }
        return filterConfiguredApplications(liveData, konfluxBindings);
    }, [configured, liveData, konfluxBindings]);

    const showSnapshots =
        configured && !hasAnyToken && konfluxBindings.length > 0;
    const authCluster = clusters.find(c => c.id === authClusterId);

    const handleSave = async (bindings: ProductConfigSaveInput) => {
        await save(bindings);
        refetchConfig();
    };

    if (clustersLoading || configLoading) {
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

    if (configError) {
        return (
            <Box p={2}>
                <Alert severity="error">
                    Failed to load product configuration: {configError.message}
                </Alert>
            </Box>
        );
    }

    return (
        <div className={classes.root}>
            <CompositionHeader
                productName={productName}
                configured={configured}
                refreshing={refreshing}
                onOpenPicker={() => setPickerOpen(true)}
                onRefresh={() => void refresh()}
            />

            <ClusterAuthBar
                clusters={clusters}
                hasToken={hasToken}
                onConnect={setAuthClusterId}
                onDisconnect={clearToken}
            />

            <CompositionAlerts
                productName={productName}
                configured={configured}
                missingBindingClusters={missingBindingClusters}
                clusters={clusters}
                onConnectCluster={setAuthClusterId}
                onOpenPicker={() => setPickerOpen(true)}
                refreshError={refreshError}
                onDismissRefreshError={dismissRefreshError}
            />

            {configured && (
                <>
                    {hasAnyToken && (
                        <CompositionFilters
                            clusters={clusters}
                            namespaceMappings={namespaceMappings}
                            namespaceOptions={namespaceOptions}
                            searchInput={searchInput}
                            onSearchInputChange={setSearchInput}
                            onSearch={() => setSearch(searchInput.trim())}
                            clusterFilter={clusterFilter}
                            onClusterFilterChange={setClusterFilter}
                            namespaceFilter={namespaceFilter}
                            onNamespaceFilterChange={setNamespaceFilter}
                        />
                    )}

                    <ApplicationsTable
                        configured={configured}
                        hasAnyToken={hasAnyToken}
                        showSnapshots={showSnapshots}
                        konfluxBindings={konfluxBindings}
                        filteredData={filteredData}
                        resourcesLoading={resourcesLoading}
                        resourcesError={resourcesError}
                        search={search}
                        hasMore={hasMore}
                        onLoadMore={loadMore}
                    />

                    <PyxisListingsTable
                        pyxisBindings={pyxisBindings}
                        pyxisEntities={pyxisEntities}
                        pyxisLoading={pyxisLoading}
                        pyxisError={pyxisError}
                    />

                    {config?.updatedAt && (
                        <Typography variant="caption" color="textSecondary">
                            Configuration updated{' '}
                            {new Date(config.updatedAt).toLocaleString()}
                            {config.updatedBy
                                ? ` by ${config.updatedBy}`
                                : ''}
                        </Typography>
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

            <ResourcePickerDialog
                open={pickerOpen}
                entityName={productName}
                clusters={clusters}
                tokens={tokens}
                existingConfig={config}
                onSave={handleSave}
                onRequestAuth={setAuthClusterId}
                onClose={() => setPickerOpen(false)}
            />
        </div>
    );
};

/**
 * Product composition tab for System entity pages.
 *
 * Configured: fetches only resources from the stored product composition.
 * Unconfigured: prompts the user to configure.
 */
export const ProductCompositionTab = () => {
    return (
        <QueryClientBoundary>
            <ProductCompositionTabContent />
        </QueryClientBoundary>
    );
};
