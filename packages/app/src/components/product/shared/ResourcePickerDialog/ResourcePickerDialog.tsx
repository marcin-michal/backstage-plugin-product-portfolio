import { useEffect, useMemo, useState } from 'react';
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Typography,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { Entity, stringifyEntityRef } from '@backstage/catalog-model';
import {
    ClusterPublicInfo,
    KonfluxResource,
    KonfluxResourceBinding,
    ProductConfig,
    PyxisBinding,
} from '@internal/backstage-plugin-konflux-common';
import {
    useBrowseApplications,
    useKonfluxProjects,
} from '../../hooks/konflux';
import { ProductConfigSaveInput } from '../../hooks/product/useProductConfig';
import { usePyxisListings } from '../../hooks/catalog/usePyxisListings';
import {
    applicationToBinding,
    konfluxBindingKey,
} from '../../utils/bindings';
import {
    KonfluxAppsSection,
    NamespaceOption,
} from './KonfluxAppsSection';
import { PyxisListingsSection } from './PyxisListingsSection';
import { clusterLabel } from './resourcePickerLabels';
import { useResourcePickerStyles } from './resourcePicker.styles';

export interface ResourcePickerDialogProps {
    open: boolean;
    entityName: string;
    clusters: ClusterPublicInfo[];
    tokens: Record<string, string>;
    existingConfig?: ProductConfig;
    onSave: (bindings: ProductConfigSaveInput) => Promise<void>;
    onRequestAuth: (clusterId: string) => void;
    onClose: () => void;
}

/**
 * Modal for composing which Konflux Applications and Pyxis product listings
 * belong to a product System.
 *
 * Applications are fetched only after a tenant namespace is selected.
 */
export const ResourcePickerDialog = ({
    open,
    entityName,
    clusters,
    tokens,
    existingConfig,
    onSave,
    onRequestAuth,
    onClose,
}: ResourcePickerDialogProps) => {
    const classes = useResourcePickerStyles();

    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [clusterFilter, setClusterFilter] = useState('');
    const [selectedNamespace, setSelectedNamespace] =
        useState<NamespaceOption | null>(null);
    const [pyxisSearch, setPyxisSearch] = useState('');

    const [selectedKonflux, setSelectedKonflux] = useState<
        Map<string, KonfluxResourceBinding>
    >(() => new Map());
    const [selectedPyxis, setSelectedPyxis] = useState<
        Map<string, PyxisBinding>
    >(() => new Map());

    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string>();

    const hasAnyToken = Object.keys(tokens).length > 0;
    const canBrowseApps = !!selectedNamespace;

    useEffect(() => {
        if (!open) {
            return;
        }

        const konflux = new Map<string, KonfluxResourceBinding>();
        for (const binding of existingConfig?.konfluxBindings ?? []) {
            konflux.set(konfluxBindingKey(binding), binding);
        }
        setSelectedKonflux(konflux);

        const pyxis = new Map<string, PyxisBinding>();
        for (const binding of existingConfig?.pyxisBindings ?? []) {
            pyxis.set(binding.entityRef, binding);
        }
        setSelectedPyxis(pyxis);

        setSearchInput('');
        setSearch('');
        setClusterFilter('');
        setSelectedNamespace(null);
        setPyxisSearch('');
        setSaveError(undefined);
    }, [open, existingConfig]);

    const {
        data: projects,
        loading: projectsLoading,
        error: projectsError,
    } = useKonfluxProjects(tokens, open && hasAnyToken);

    const {
        data: applications,
        loading: appsLoading,
        error: appsError,
        hasMore,
        loadMore,
    } = useBrowseApplications(tokens, {
        enabled: open && hasAnyToken && canBrowseApps,
        cluster: selectedNamespace?.clusterId,
        namespace: selectedNamespace?.namespace,
        search: search || undefined,
    });

    const {
        data: pyxisEntities,
        loading: pyxisLoading,
        error: pyxisError,
    } = usePyxisListings(open);

    const namespaceOptions = useMemo(() => {
        const opts: NamespaceOption[] = [];
        for (const [clusterId, nsList] of Object.entries(projects)) {
            if (clusterFilter && clusterId !== clusterFilter) {
                continue;
            }
            const label = clusterLabel(clusters, clusterId);
            for (const ns of nsList) {
                opts.push({
                    clusterId,
                    clusterLabel: label,
                    namespace: ns,
                    value: `${clusterId}::${ns}`,
                    label: `${ns} (${label})`,
                });
            }
        }
        return opts.sort((a, b) => a.label.localeCompare(b.label));
    }, [projects, clusterFilter, clusters]);

    const filteredPyxis = useMemo(() => {
        const term = pyxisSearch.trim().toLowerCase();
        if (!term) {
            return pyxisEntities;
        }
        return pyxisEntities.filter(entity => {
            const title = (
                entity.metadata.title ?? entity.metadata.name
            ).toLowerCase();
            const name = entity.metadata.name.toLowerCase();
            const description = (
                entity.metadata.description ?? ''
            ).toLowerCase();
            return (
                title.includes(term) ||
                name.includes(term) ||
                description.includes(term)
            );
        });
    }, [pyxisEntities, pyxisSearch]);

    const toggleKonflux = (app: KonfluxResource) => {
        const binding = applicationToBinding(app);
        if (!binding) {
            return;
        }
        const key = konfluxBindingKey(binding);
        setSelectedKonflux(prev => {
            const next = new Map(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.set(key, binding);
            }
            return next;
        });
    };

    const removeKonflux = (key: string) => {
        setSelectedKonflux(prev => {
            const next = new Map(prev);
            next.delete(key);
            return next;
        });
    };

    const togglePyxis = (entity: Entity) => {
        const entityRef = stringifyEntityRef(entity);
        setSelectedPyxis(prev => {
            const next = new Map(prev);
            if (next.has(entityRef)) {
                next.delete(entityRef);
            } else {
                next.set(entityRef, {
                    entityRef,
                    label: entity.metadata.title ?? entity.metadata.name,
                });
            }
            return next;
        });
    };

    const removePyxis = (entityRef: string) => {
        setSelectedPyxis(prev => {
            const next = new Map(prev);
            next.delete(entityRef);
            return next;
        });
    };

    const handleSave = async () => {
        setSaving(true);
        setSaveError(undefined);
        try {
            await onSave({
                konfluxBindings: Array.from(selectedKonflux.values()),
                pyxisBindings: Array.from(selectedPyxis.values()),
            });
            onClose();
        } catch (e) {
            setSaveError(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>Compose resources for {entityName}</DialogTitle>
            <DialogContent dividers>
                <DialogContentText>
                    Select which Konflux Applications and Pyxis product listings
                    belong to this product.
                </DialogContentText>

                <KonfluxAppsSection
                    clusters={clusters}
                    hasAnyToken={hasAnyToken}
                    canBrowseApps={canBrowseApps}
                    clusterFilter={clusterFilter}
                    onClusterFilterChange={setClusterFilter}
                    namespaceOptions={namespaceOptions}
                    projectsLoading={projectsLoading}
                    selectedNamespace={selectedNamespace}
                    onNamespaceChange={setSelectedNamespace}
                    searchInput={searchInput}
                    onSearchInputChange={setSearchInput}
                    onSearch={() => setSearch(searchInput.trim())}
                    applications={applications}
                    appsLoading={appsLoading}
                    appsError={appsError}
                    projectsError={projectsError}
                    hasMore={hasMore}
                    onLoadMore={loadMore}
                    selectedKonflux={selectedKonflux}
                    onToggleKonflux={toggleKonflux}
                    onRemoveKonflux={removeKonflux}
                    onRequestAuth={onRequestAuth}
                />

                <PyxisListingsSection
                    pyxisSearch={pyxisSearch}
                    onPyxisSearchChange={setPyxisSearch}
                    pyxisEntities={pyxisEntities}
                    filteredPyxis={filteredPyxis}
                    pyxisLoading={pyxisLoading}
                    pyxisError={pyxisError}
                    selectedPyxis={selectedPyxis}
                    onTogglePyxis={togglePyxis}
                    onRemovePyxis={removePyxis}
                />

                <Typography
                    variant="body2"
                    color="textSecondary"
                    className={classes.summary}
                >
                    Selected: {selectedKonflux.size} Konflux app
                    {selectedKonflux.size === 1 ? '' : 's'},{' '}
                    {selectedPyxis.size} Pyxis listing
                    {selectedPyxis.size === 1 ? '' : 's'}
                </Typography>

                {saveError && (
                    <Box mt={1}>
                        <Alert severity="error">{saveError}</Alert>
                    </Box>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={saving}>
                    Cancel
                </Button>
                <Button
                    color="primary"
                    variant="contained"
                    onClick={handleSave}
                    disabled={saving}
                >
                    {saving ? 'Saving…' : 'Save Composition'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};
