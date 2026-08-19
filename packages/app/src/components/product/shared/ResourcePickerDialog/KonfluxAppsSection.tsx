import {
    Checkbox,
    Chip,
    CircularProgress,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    TextField,
    Typography,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import {
    ClusterPublicInfo,
    UnmatchedApp,
} from '@internal/backstage-plugin-konflux-common';
import { clusterDisplayName } from '../../utils/konfluxUrls';
import { appChipLabel } from './resourcePickerLabels';
import { useResourcePickerStyles } from './resourcePicker.styles';

export interface KonfluxAppsSectionProps {
    clusters: ClusterPublicInfo[];
    search: string;
    onSearchChange: (value: string) => void;
    apps: UnmatchedApp[];
    loading: boolean;
    error?: Error;
    selected: Set<string>;
    onToggle: (entityRef: string) => void;
    onRemove: (entityRef: string) => void;
}

export const KonfluxAppsSection = ({
    clusters,
    search,
    onSearchChange,
    apps,
    loading,
    error,
    selected,
    onToggle,
    onRemove,
}: KonfluxAppsSectionProps) => {
    const classes = useResourcePickerStyles();

    const filtered = apps.filter(app => {
        const term = search.trim().toLowerCase();
        if (!term) {
            return true;
        }
        const title = (app.title ?? app.name).toLowerCase();
        return (
            title.includes(term) ||
            app.name.toLowerCase().includes(term) ||
            app.namespace.toLowerCase().includes(term) ||
            app.cluster.toLowerCase().includes(term)
        );
    });

    return (
        <div className={classes.section}>
            <Typography variant="subtitle1" className={classes.sectionHeader}>
                Konflux applications
            </Typography>

            <div className={classes.filters}>
                <TextField
                    className={classes.filterControl}
                    label="Search catalog"
                    value={search}
                    onChange={e => onSearchChange(e.target.value)}
                    placeholder="Filter applications…"
                    fullWidth
                />
            </div>

            {error && <Alert severity="error">{error.message}</Alert>}

            {loading && apps.length === 0 && <CircularProgress size={24} />}

            <List dense className={classes.list}>
                {filtered.map(app => {
                    const checked = selected.has(app.entityRef);
                    return (
                        <ListItem
                            key={app.entityRef}
                            dense
                            button
                            onClick={() => onToggle(app.entityRef)}
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
                                primary={app.title ?? app.name}
                                secondary={`${
                                    app.namespace
                                } (${clusterDisplayName(
                                    clusters,
                                    app.cluster,
                                )})`}
                            />
                        </ListItem>
                    );
                })}
                {!loading && filtered.length === 0 && (
                    <ListItem>
                        <ListItemText primary="No Konflux applications found." />
                    </ListItem>
                )}
            </List>

            {selected.size > 0 && (
                <div className={classes.chipRow}>
                    {apps
                        .filter(app => selected.has(app.entityRef))
                        .map(app => (
                            <Chip
                                key={app.entityRef}
                                size="small"
                                color="primary"
                                variant="outlined"
                                label={appChipLabel(app, clusters)}
                                onDelete={() => onRemove(app.entityRef)}
                            />
                        ))}
                </div>
            )}
        </div>
    );
};
