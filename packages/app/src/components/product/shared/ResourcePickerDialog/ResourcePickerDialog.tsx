import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
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
import {
    ManualOverrideItem,
    ProductComposition,
    UnmatchedApp,
} from '@internal/backstage-plugin-konflux-common';
import { useKonfluxClusters } from '../../hooks/konflux';
import { usePyxisListings } from '../../hooks/catalog/usePyxisListings';
import { useManualOverride } from '../../hooks/product/useManualOverride';
import { useUnmatchedApps } from '../../hooks/product/useUnmatchedApps';
import { KonfluxAppsSection } from './KonfluxAppsSection';
import { PyxisListingsSection } from './PyxisListingsSection';
import { useResourcePickerStyles } from './resourcePicker.styles';

export interface ResourcePickerDialogProps {
    open: boolean;
    entityName: string;
    entityRef: string;
    composition: ProductComposition;
    onClose: () => void;
    onSaved: () => void;
}

type PickerApp = UnmatchedApp;

/**
 * Catalog-only modal for adding or removing Konflux applications and Pyxis
 * product listings. Saves via manual override endpoints.
 */
export const ResourcePickerDialog = ({
    open,
    entityName,
    entityRef,
    composition,
    onClose,
    onSaved,
}: ResourcePickerDialogProps) => {
    const classes = useResourcePickerStyles();
    const { data: clusters } = useKonfluxClusters();
    const { addOverride, removeOverride } = useManualOverride(entityRef);

    const [appSearch, setAppSearch] = useState('');
    const [pyxisSearch, setPyxisSearch] = useState('');
    const [selectedApps, setSelectedApps] = useState<Set<string>>(new Set());
    const [selectedListings, setSelectedListings] = useState<Set<string>>(
        new Set(),
    );
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string>();

    const {
        data: unmatched,
        loading: unmatchedLoading,
        error: unmatchedError,
    } = useUnmatchedApps(open);
    const {
        data: pyxisEntities,
        loading: pyxisLoading,
        error: pyxisError,
    } = usePyxisListings(open);

    useEffect(() => {
        if (!open || saving) {
            return;
        }
        setSelectedApps(
            new Set(composition.konfluxApplications.map(a => a.entityRef)),
        );
        setSelectedListings(
            new Set(composition.pyxisListings.map(l => l.entityRef)),
        );
        setAppSearch('');
        setPyxisSearch('');
        setSaveError(undefined);
    }, [open, composition, saving]);

    const apps: PickerApp[] = useMemo(() => {
        const byRef = new Map<string, PickerApp>();
        for (const app of composition.konfluxApplications) {
            byRef.set(app.entityRef, {
                entityRef: app.entityRef,
                name: app.name,
                title: app.title,
                cluster: app.cluster,
                namespace: app.namespace,
                applicationName: app.applicationName,
            });
        }
        for (const app of unmatched) {
            if (!byRef.has(app.entityRef)) {
                byRef.set(app.entityRef, app);
            }
        }
        return [...byRef.values()].sort((a, b) =>
            (a.title ?? a.name).localeCompare(b.title ?? b.name),
        );
    }, [composition.konfluxApplications, unmatched]);

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

    const toggleSet = (
        setter: Dispatch<SetStateAction<Set<string>>>,
        key: string,
    ) => {
        setter(prev => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    const handleSave = async () => {
        setSaving(true);
        setSaveError(undefined);
        try {
            const currentApps = new Set(
                composition.konfluxApplications.map(a => a.entityRef),
            );
            const currentListings = new Set(
                composition.pyxisListings.map(l => l.entityRef),
            );
            const appByRef = new Map(
                composition.konfluxApplications.map(a => [a.entityRef, a]),
            );
            const listingByRef = new Map(
                composition.pyxisListings.map(l => [l.entityRef, l]),
            );

            const operations: Array<Promise<unknown>> = [];

            for (const ref of selectedApps) {
                if (!currentApps.has(ref)) {
                    operations.push(
                        undoOrAdd(
                            composition.manualOverrides,
                            'remove_konflux',
                            'add_konflux',
                            ref,
                            addOverride,
                            removeOverride,
                        ),
                    );
                }
            }
            for (const ref of currentApps) {
                if (!selectedApps.has(ref)) {
                    const matchSource = appByRef.get(ref)?.matchSource;
                    operations.push(
                        undoOrAdd(
                            composition.manualOverrides,
                            matchSource === 'manual'
                                ? 'add_konflux'
                                : undefined,
                            matchSource === 'manual'
                                ? undefined
                                : 'remove_konflux',
                            ref,
                            addOverride,
                            removeOverride,
                        ),
                    );
                }
            }

            for (const ref of selectedListings) {
                if (!currentListings.has(ref)) {
                    operations.push(
                        undoOrAdd(
                            composition.manualOverrides,
                            'remove_pyxis',
                            'add_pyxis',
                            ref,
                            addOverride,
                            removeOverride,
                        ),
                    );
                }
            }
            for (const ref of currentListings) {
                if (!selectedListings.has(ref)) {
                    const matchSource = listingByRef.get(ref)?.matchSource;
                    operations.push(
                        undoOrAdd(
                            composition.manualOverrides,
                            matchSource === 'manual' ? 'add_pyxis' : undefined,
                            matchSource === 'manual'
                                ? undefined
                                : 'remove_pyxis',
                            ref,
                            addOverride,
                            removeOverride,
                        ),
                    );
                }
            }

            await Promise.all(operations);
            onSaved();
        } catch (e) {
            setSaveError(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>Edit composition for {entityName}</DialogTitle>
            <DialogContent dividers>
                <DialogContentText>
                    Select which Konflux applications and Pyxis product listings
                    belong to this product. Repositories are included with their
                    parent listing.
                </DialogContentText>

                <KonfluxAppsSection
                    clusters={clusters}
                    search={appSearch}
                    onSearchChange={setAppSearch}
                    apps={apps}
                    loading={unmatchedLoading}
                    error={unmatchedError}
                    selected={selectedApps}
                    onToggle={ref => toggleSet(setSelectedApps, ref)}
                    onRemove={ref => toggleSet(setSelectedApps, ref)}
                />

                <PyxisListingsSection
                    pyxisSearch={pyxisSearch}
                    onPyxisSearchChange={setPyxisSearch}
                    pyxisEntities={pyxisEntities}
                    filteredPyxis={filteredPyxis}
                    pyxisLoading={pyxisLoading}
                    pyxisError={pyxisError}
                    selected={selectedListings}
                    onToggle={ref => toggleSet(setSelectedListings, ref)}
                    onRemove={ref => toggleSet(setSelectedListings, ref)}
                />

                <Typography
                    variant="body2"
                    color="textSecondary"
                    className={classes.summary}
                >
                    Selected: {selectedApps.size} Konflux app
                    {selectedApps.size === 1 ? '' : 's'},{' '}
                    {selectedListings.size} Pyxis listing
                    {selectedListings.size === 1 ? '' : 's'}
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
                    onClick={() => void handleSave()}
                    disabled={saving}
                >
                    {saving ? 'Saving…' : 'Save composition'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

async function undoOrAdd(
    overrides: ManualOverrideItem[],
    deleteType: ManualOverrideItem['overrideType'] | undefined,
    addType: ManualOverrideItem['overrideType'] | undefined,
    resourceKey: string,
    addOverride: (
        overrideType: ManualOverrideItem['overrideType'],
        resourceKey: string,
    ) => Promise<unknown>,
    removeOverride: (id: string) => Promise<void>,
): Promise<void> {
    if (deleteType) {
        const existing = overrides.find(
            o => o.overrideType === deleteType && o.resourceKey === resourceKey,
        );
        if (existing) {
            await removeOverride(existing.id);
            return;
        }
    }
    if (addType) {
        await addOverride(addType, resourceKey);
    }
}
