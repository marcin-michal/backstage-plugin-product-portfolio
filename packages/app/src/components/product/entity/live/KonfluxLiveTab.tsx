import { useMemo, useState } from 'react';
import { Box, CircularProgress } from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { useEntity } from '@backstage/plugin-catalog-react';
import {
    ClusterPublicInfo,
    KonfluxAppSummary,
    buildApplicationLabelSelector,
} from '@internal/backstage-plugin-konflux-common';
import {
    useExpireTokensOn401,
    useKonfluxClusters,
    useKonfluxTokens,
    usePipelineRuns,
    useReleases,
} from '../../hooks/konflux';
import { useProductComposition } from '../../hooks/product/useProductComposition';
import { ClusterAuthBar } from '../../shared/ClusterAuthBar';
import { KonfluxTokenDialog } from '../../shared/KonfluxTokenDialog';
import { QueryClientBoundary } from '../../shared/QueryClientBoundary';
import { useCompositionStyles } from '../composition/composition.styles';
import { PipelineRunsTable } from './PipelineRunsTable';
import { ReleasesTable } from './ReleasesTable';
import {
    namespaceMappingsFromApps,
    productClustersFromApps,
    tokensForClusters,
    uniqueProductClusterIds,
} from './liveResourceUtils';

const EMPTY_APPS: KonfluxAppSummary[] = [];

const KonfluxLiveTabContent = () => {
    const classes = useCompositionStyles();
    const { entity } = useEntity();
    const entityRef = stringifyEntityRef(entity);
    const [dialogCluster, setDialogCluster] = useState<ClusterPublicInfo>();

    const {
        data: allClusters,
        loading: clustersLoading,
        error: clustersError,
    } = useKonfluxClusters();
    const {
        data: composition,
        loading: compositionLoading,
        error: compositionError,
    } = useProductComposition(entityRef);

    const applications = composition?.konfluxApplications ?? EMPTY_APPS;
    const productClusterIds = useMemo(
        () => uniqueProductClusterIds(applications),
        [applications],
    );
    const productClusters = useMemo(
        () => productClustersFromApps(applications, allClusters),
        [applications, allClusters],
    );
    const namespaceMappings = useMemo(
        () => namespaceMappingsFromApps(applications),
        [applications],
    );
    const labelSelector = useMemo(
        () =>
            buildApplicationLabelSelector(
                applications.map(app => app.applicationName),
            ),
        [applications],
    );

    const { tokens, hasToken, setToken, clearToken, markExpired } =
        useKonfluxTokens(productClusterIds);
    const productTokens = useMemo(
        () => tokensForClusters(tokens, productClusterIds),
        [tokens, productClusterIds],
    );
    const hasProductTokens = Object.keys(productTokens).length > 0;
    const canFetch =
        !compositionLoading &&
        namespaceMappings.length > 0 &&
        !!labelSelector &&
        hasProductTokens;

    const pipelineRuns = usePipelineRuns(productTokens, {
        namespaceMappings,
        enabled: canFetch,
        query: { labelSelector },
    });
    const releases = useReleases(productTokens, {
        namespaceMappings,
        enabled: canFetch,
        query: { labelSelector },
    });

    useExpireTokensOn401(pipelineRuns.error, markExpired);
    useExpireTokensOn401(releases.error, markExpired);

    if (clustersLoading || compositionLoading) {
        return (
            <Box p={2}>
                <CircularProgress size={24} />
            </Box>
        );
    }

    if (compositionError) {
        return (
            <Box p={2}>
                <Alert severity="error">
                    Failed to load product composition:{' '}
                    {compositionError.message}
                </Alert>
            </Box>
        );
    }

    let idleMessage: string | undefined;
    if (applications.length === 0) {
        idleMessage = 'No Konflux applications are linked to this product.';
    } else if (!hasProductTokens) {
        idleMessage =
            'Connect to the clusters above to load live Konflux data.';
    }

    return (
        <div className={classes.root}>
            {clustersError && (
                <Alert severity="warning">
                    Cluster display names and Konflux links may be incomplete:{' '}
                    {clustersError.message}
                </Alert>
            )}

            {applications.length === 0 ? (
                <Alert severity="info">
                    This product has no linked Konflux applications. Add
                    applications on the Product tab, then return here to view
                    pipeline runs and releases.
                </Alert>
            ) : (
                <>
                    <ClusterAuthBar
                        clusters={productClusters}
                        hasToken={hasToken}
                        onConnect={id => {
                            const cluster = productClusters.find(
                                item => item.id === id,
                            );
                            if (cluster) {
                                setDialogCluster(cluster);
                            }
                        }}
                        onDisconnect={clearToken}
                    />
                    {!hasProductTokens && (
                        <Alert severity="info">
                            Paste a personal OpenShift token for each cluster
                            that hosts this product&apos;s applications. Tokens
                            stay in this browser tab and are sent only for live
                            cluster queries.
                        </Alert>
                    )}
                </>
            )}

            <PipelineRunsTable
                result={pipelineRuns}
                clusters={productClusters}
                idleMessage={idleMessage}
            />
            <ReleasesTable
                result={releases}
                clusters={productClusters}
                idleMessage={idleMessage}
            />

            {dialogCluster && (
                <KonfluxTokenDialog
                    cluster={dialogCluster}
                    open
                    onAuthenticated={setToken}
                    onClose={() => setDialogCluster(undefined)}
                />
            )}
        </div>
    );
};

/**
 * Live Konflux tab for System entity pages.
 * Requires per-cluster personal tokens, then lists PipelineRuns and Releases
 * for the product's applications.
 */
export const KonfluxLiveTab = () => {
    return (
        <QueryClientBoundary>
            <KonfluxLiveTabContent />
        </QueryClientBoundary>
    );
};
