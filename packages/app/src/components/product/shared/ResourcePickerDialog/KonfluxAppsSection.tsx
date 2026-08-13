import {
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    FormControl,
    InputLabel,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    MenuItem,
    Select,
    TextField,
    Typography,
} from '@material-ui/core';
import { Alert, Autocomplete } from '@material-ui/lab';
import {
    ClusterPublicInfo,
    KonfluxResource,
    KonfluxResourceBinding,
    getResourceDisplayName,
} from '@internal/backstage-plugin-konflux-common';
import { BackendApiError } from '../../hooks/api/backendApi';
import {
    applicationToBinding,
    konfluxBindingKey,
} from '../../utils/bindings';
import { bindingChipLabel, clusterLabel } from './resourcePickerLabels';
import { useResourcePickerStyles } from './resourcePicker.styles';

export type NamespaceOption = {
    clusterId: string;
    clusterLabel: string;
    namespace: string;
    value: string;
    label: string;
};

export interface KonfluxAppsSectionProps {
    clusters: ClusterPublicInfo[];
    hasAnyToken: boolean;
    canBrowseApps: boolean;
    clusterFilter: string;
    onClusterFilterChange: (value: string) => void;
    namespaceOptions: NamespaceOption[];
    projectsLoading: boolean;
    selectedNamespace: NamespaceOption | null;
    onNamespaceChange: (value: NamespaceOption | null) => void;
    searchInput: string;
    onSearchInputChange: (value: string) => void;
    onSearch: () => void;
    applications: KonfluxResource[];
    appsLoading: boolean;
    appsError?: Error;
    projectsError?: Error;
    hasMore: boolean;
    onLoadMore: () => void;
    selectedKonflux: Map<string, KonfluxResourceBinding>;
    onToggleKonflux: (app: KonfluxResource) => void;
    onRemoveKonflux: (key: string) => void;
    onRequestAuth: (clusterId: string) => void;
}

export const KonfluxAppsSection = ({
    clusters,
    hasAnyToken,
    canBrowseApps,
    clusterFilter,
    onClusterFilterChange,
    namespaceOptions,
    projectsLoading,
    selectedNamespace,
    onNamespaceChange,
    searchInput,
    onSearchInputChange,
    onSearch,
    applications,
    appsLoading,
    appsError,
    projectsError,
    hasMore,
    onLoadMore,
    selectedKonflux,
    onToggleKonflux,
    onRemoveKonflux,
    onRequestAuth,
}: KonfluxAppsSectionProps) => {
    const classes = useResourcePickerStyles();

    const appsKonfluxError =
        appsError instanceof BackendApiError ? appsError : undefined;
    const projectsKonfluxError =
        projectsError instanceof BackendApiError ? projectsError : undefined;

    let authError: BackendApiError | undefined;
    if (appsKonfluxError?.statusCode === 401) {
        authError = appsKonfluxError;
    } else if (projectsKonfluxError?.statusCode === 401) {
        authError = projectsKonfluxError;
    }

    return (
        <div className={classes.section}>
            <Typography
                variant="subtitle1"
                className={classes.sectionHeader}
            >
                Konflux Applications
            </Typography>

            {!hasAnyToken && (
                <Alert severity="warning">
                    Connect at least one cluster, then search for a tenant
                    namespace to list Applications.
                    <Box
                        mt={1}
                        display="flex"
                        flexWrap="wrap"
                        style={{ gap: 8 }}
                    >
                        {clusters.map(cluster => (
                            <Button
                                key={cluster.id}
                                size="small"
                                variant="outlined"
                                onClick={() => onRequestAuth(cluster.id)}
                            >
                                Connect {cluster.name || cluster.id}
                            </Button>
                        ))}
                    </Box>
                </Alert>
            )}

            {hasAnyToken && (
                <>
                    <div className={classes.filters}>
                        <FormControl className={classes.filterControl}>
                            <InputLabel>Cluster</InputLabel>
                            <Select
                                value={clusterFilter}
                                onChange={e => {
                                    onClusterFilterChange(
                                        e.target.value as string,
                                    );
                                    onNamespaceChange(null);
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
                        <Autocomplete
                            className={classes.namespaceControl}
                            options={namespaceOptions}
                            loading={projectsLoading}
                            value={selectedNamespace}
                            onChange={(_event, value) =>
                                onNamespaceChange(value)
                            }
                            getOptionLabel={option => option.label}
                            getOptionSelected={(option, value) =>
                                option.value === value.value
                            }
                            filterOptions={(options, state) => {
                                const term = state.inputValue
                                    .trim()
                                    .toLowerCase();
                                if (!term) {
                                    return options;
                                }
                                return options.filter(
                                    opt =>
                                        opt.namespace
                                            .toLowerCase()
                                            .includes(term) ||
                                        opt.clusterLabel
                                            .toLowerCase()
                                            .includes(term) ||
                                        opt.clusterId
                                            .toLowerCase()
                                            .includes(term),
                                );
                            }}
                            renderInput={params => (
                                <TextField
                                    {...params}
                                    label="Namespace"
                                    placeholder="Type to search namespaces…"
                                    variant="standard"
                                    required
                                />
                            )}
                            disabled={projectsLoading}
                        />
                        <TextField
                            className={classes.filterControl}
                            label="App search"
                            value={searchInput}
                            onChange={e =>
                                onSearchInputChange(e.target.value)
                            }
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    onSearch();
                                }
                            }}
                            placeholder="Filter by name…"
                            disabled={!canBrowseApps}
                        />
                        <Button
                            variant="outlined"
                            onClick={onSearch}
                            disabled={!canBrowseApps}
                        >
                            Search
                        </Button>
                    </div>

                    {!canBrowseApps && (
                        <Alert severity="info">
                            Search and select a tenant namespace to load
                            Applications (avoids scanning every namespace on the
                            cluster).
                        </Alert>
                    )}

                    {authError && (
                        <Alert severity="warning">
                            Token expired or invalid
                            {authError.missingClusters?.length
                                ? ` for: ${authError.missingClusters
                                      .map(id => clusterLabel(clusters, id))
                                      .join(', ')}`
                                : ''}
                            .
                            {authError.missingClusters?.map(id => (
                                <Button
                                    key={id}
                                    size="small"
                                    onClick={() => onRequestAuth(id)}
                                >
                                    Connect {clusterLabel(clusters, id)}
                                </Button>
                            ))}
                        </Alert>
                    )}

                    {appsError &&
                        !(
                            appsError instanceof BackendApiError &&
                            appsError.statusCode === 401
                        ) && (
                            <Alert severity="error">{appsError.message}</Alert>
                        )}

                    {canBrowseApps &&
                        (appsLoading || projectsLoading) &&
                        applications.length === 0 && (
                            <CircularProgress size={24} />
                        )}

                    {canBrowseApps && (
                        <>
                            <List dense className={classes.list}>
                                {applications.map(app => {
                                    const binding = applicationToBinding(app);
                                    if (!binding) {
                                        return null;
                                    }
                                    const key = konfluxBindingKey(binding);
                                    const checked = selectedKonflux.has(key);
                                    const displayName =
                                        getResourceDisplayName(app) ??
                                        binding.application;

                                    return (
                                        <ListItem
                                            key={key}
                                            dense
                                            button
                                            onClick={() =>
                                                onToggleKonflux(app)
                                            }
                                        >
                                            <ListItemIcon>
                                                <Checkbox
                                                    edge="start"
                                                    checked={checked}
                                                    tabIndex={-1}
                                                    disableRipple
                                                />
                                            </ListItemIcon>
                                            <ListItemText
                                                primary={displayName}
                                                secondary={`${
                                                    binding.namespace
                                                } (${clusterLabel(
                                                    clusters,
                                                    binding.cluster,
                                                )})`}
                                            />
                                        </ListItem>
                                    );
                                })}
                                {!appsLoading &&
                                    applications.length === 0 && (
                                        <ListItem>
                                            <ListItemText primary="No applications found in this namespace." />
                                        </ListItem>
                                    )}
                            </List>

                            {hasMore && (
                                <Box mt={1}>
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        onClick={onLoadMore}
                                        disabled={appsLoading}
                                    >
                                        Load more
                                    </Button>
                                </Box>
                            )}
                        </>
                    )}

                    {selectedKonflux.size > 0 && (
                        <div className={classes.chipRow}>
                            {Array.from(selectedKonflux.entries()).map(
                                ([key, binding]) => (
                                    <Chip
                                        key={key}
                                        size="small"
                                        color="primary"
                                        variant="outlined"
                                        label={bindingChipLabel(
                                            binding,
                                            clusters,
                                        )}
                                        onDelete={() => onRemoveKonflux(key)}
                                    />
                                ),
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
