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
import { Entity, stringifyEntityRef } from '@backstage/catalog-model';
import { PyxisBinding } from '@internal/backstage-plugin-konflux-common';
import { useResourcePickerStyles } from './resourcePicker.styles';

export interface PyxisListingsSectionProps {
    pyxisSearch: string;
    onPyxisSearchChange: (value: string) => void;
    pyxisEntities: Entity[];
    filteredPyxis: Entity[];
    pyxisLoading: boolean;
    pyxisError?: Error;
    selectedPyxis: Map<string, PyxisBinding>;
    onTogglePyxis: (entity: Entity) => void;
    onRemovePyxis: (entityRef: string) => void;
}

export const PyxisListingsSection = ({
    pyxisSearch,
    onPyxisSearchChange,
    pyxisEntities,
    filteredPyxis,
    pyxisLoading,
    pyxisError,
    selectedPyxis,
    onTogglePyxis,
    onRemovePyxis,
}: PyxisListingsSectionProps) => {
    const classes = useResourcePickerStyles();

    return (
        <div className={classes.section}>
            <Typography
                variant="subtitle1"
                className={classes.sectionHeader}
            >
                Pyxis Product Listings
            </Typography>

            <div className={classes.filters}>
                <TextField
                    className={classes.filterControl}
                    label="Search catalog"
                    value={pyxisSearch}
                    onChange={e => onPyxisSearchChange(e.target.value)}
                    placeholder="Filter listings…"
                    fullWidth
                />
            </div>

            {pyxisError && (
                <Alert severity="error">{pyxisError.message}</Alert>
            )}

            {pyxisLoading && pyxisEntities.length === 0 && (
                <CircularProgress size={24} />
            )}

            <List dense className={classes.list}>
                {filteredPyxis.map(entity => {
                    const entityRef = stringifyEntityRef(entity);
                    const checked = selectedPyxis.has(entityRef);
                    const label =
                        entity.metadata.title ?? entity.metadata.name;

                    return (
                        <ListItem
                            key={entityRef}
                            dense
                            button
                            onClick={() => onTogglePyxis(entity)}
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
                                primary={label}
                                secondary={entityRef}
                            />
                        </ListItem>
                    );
                })}
                {!pyxisLoading && filteredPyxis.length === 0 && (
                    <ListItem>
                        <ListItemText primary="No Pyxis product listings found in the catalog." />
                    </ListItem>
                )}
            </List>

            {selectedPyxis.size > 0 && (
                <div className={classes.chipRow}>
                    {Array.from(selectedPyxis.values()).map(binding => (
                        <Chip
                            key={binding.entityRef}
                            size="small"
                            color="primary"
                            variant="outlined"
                            label={binding.label ?? binding.entityRef}
                            onDelete={() => onRemovePyxis(binding.entityRef)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
