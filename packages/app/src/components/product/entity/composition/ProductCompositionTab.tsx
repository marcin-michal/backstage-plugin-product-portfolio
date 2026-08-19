import { useState } from 'react';
import { Box, Button, CircularProgress } from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { useEntity } from '@backstage/plugin-catalog-react';
import { ProductComposition } from '@internal/backstage-plugin-konflux-common';
import { useKonfluxClusters } from '../../hooks/konflux';
import { useProductComposition } from '../../hooks/product/useProductComposition';
import { QueryClientBoundary } from '../../shared/QueryClientBoundary';
import { ResourcePickerDialog } from '../../shared/ResourcePickerDialog/ResourcePickerDialog';
import { ApplicationsTable } from './ApplicationsTable';
import { CompositionHeader } from './CompositionHeader';
import { useCompositionStyles } from './composition.styles';
import { PyxisListingsTable } from './PyxisListingsTable';
import { RepositoriesTable } from './RepositoriesTable';

const emptyComposition = (
    entityRef: string,
    title?: string,
    description?: string,
    source: 'auto' | 'manual' = 'manual',
): ProductComposition => ({
    entityRef,
    title,
    description,
    source,
    konfluxApplications: [],
    konfluxComponents: [],
    pyxisListings: [],
    repositories: [],
    manualOverrides: [],
});

const ProductCompositionTabContent = () => {
    const classes = useCompositionStyles();
    const { entity } = useEntity();
    const entityRef = stringifyEntityRef(entity);
    const productName = entity.metadata.title ?? entity.metadata.name;
    const description = entity.metadata.description;
    const sourceAnnotation =
        entity.metadata.annotations?.['redhat.com/product-matching-source'];
    const entitySource: 'auto' | 'manual' =
        sourceAnnotation === 'manual' ? 'manual' : 'auto';

    const {
        data: clusters,
        loading: clustersLoading,
        error: clustersError,
    } = useKonfluxClusters();
    const {
        data: composition,
        loading: compositionLoading,
        error: compositionError,
        refetch: refetchComposition,
    } = useProductComposition(entityRef);

    const [pickerOpen, setPickerOpen] = useState(false);

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

    const resolved =
        composition ??
        emptyComposition(entityRef, productName, description, entitySource);
    const source = resolved.source || entitySource;
    const isEmpty =
        resolved.konfluxApplications.length === 0 &&
        resolved.pyxisListings.length === 0 &&
        resolved.repositories.length === 0;

    return (
        <div className={classes.root}>
            <CompositionHeader
                productName={resolved.title ?? productName}
                description={resolved.description ?? description}
                source={source}
                applicationCount={resolved.konfluxApplications.length}
                componentCount={resolved.konfluxComponents.length}
                listingCount={resolved.pyxisListings.length}
                repositoryCount={resolved.repositories.length}
                onOpenPicker={() => setPickerOpen(true)}
            />

            {clustersError && (
                <Alert severity="warning">
                    Cluster display names and Konflux links may be incomplete:{' '}
                    {clustersError.message}
                </Alert>
            )}

            {isEmpty && (
                <Alert severity="info">
                    This product has no linked applications or listings yet. Use
                    Edit composition to add Konflux applications and Pyxis
                    product listings.
                    <div className={classes.headerActions}>
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={() => setPickerOpen(true)}
                        >
                            Edit composition
                        </Button>
                    </div>
                </Alert>
            )}

            <ApplicationsTable
                applications={resolved.konfluxApplications}
                components={resolved.konfluxComponents}
                clusters={clusters}
            />
            <PyxisListingsTable listings={resolved.pyxisListings} />
            <RepositoriesTable repositories={resolved.repositories} />

            <ResourcePickerDialog
                open={pickerOpen}
                entityName={resolved.title ?? productName}
                entityRef={entityRef}
                composition={resolved}
                onClose={() => setPickerOpen(false)}
                onSaved={() => {
                    refetchComposition();
                    setPickerOpen(false);
                }}
            />
        </div>
    );
};

/**
 * Product overview tab for System entity pages.
 * Shows catalog-backed composition (apps, components, listings, repos)
 */
export const ProductCompositionTab = () => {
    return (
        <QueryClientBoundary>
            <ProductCompositionTabContent />
        </QueryClientBoundary>
    );
};
