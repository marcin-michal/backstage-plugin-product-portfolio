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
import { useResourcePickerStyles } from './resourcePicker.styles';

export interface PyxisListingsSectionProps {
    pyxisSearch: string;
    onPyxisSearchChange: (value: string) => void;
    pyxisEntities: Entity[];
    filteredPyxis: Entity[];
    pyxisLoading: boolean;
    pyxisError?: Error;
    selected: Set<string>;
    onToggle: (entityRef: string) => void;
    onRemove: (entityRef: string) => void;
}

export const PyxisListingsSection = ({
    pyxisSearch,
    onPyxisSearchChange,
    pyxisEntities,
    filteredPyxis,
    pyxisLoading,
    pyxisError,
    selected,
    onToggle,
    onRemove,
}: PyxisListingsSectionProps) => {
    const classes = useResourcePickerStyles();

    const labelFor = (entityRef: string): string => {
        const entity = pyxisEntities.find(
            e => stringifyEntityRef(e) === entityRef,
        );
        return entity?.metadata.title ?? entity?.metadata.name ?? entityRef;
    };

    return (
        <div className={classes.section}>
            <Typography variant="subtitle1" className={classes.sectionHeader}>
                Pyxis product listings
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

            {pyxisError && <Alert severity="error">{pyxisError.message}</Alert>}

            {pyxisLoading && pyxisEntities.length === 0 && (
                <CircularProgress size={24} />
            )}

            <List dense className={classes.list}>
                {filteredPyxis.map(entity => {
                    const entityRef = stringifyEntityRef(entity);
                    const checked = selected.has(entityRef);
                    const label = entity.metadata.title ?? entity.metadata.name;

                    return (
                        <ListItem
                            key={entityRef}
                            dense
                            button
                            onClick={() => onToggle(entityRef)}
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

            {selected.size > 0 && (
                <div className={classes.chipRow}>
                    {[...selected].map(entityRef => (
                        <Chip
                            key={entityRef}
                            size="small"
                            color="primary"
                            variant="outlined"
                            label={labelFor(entityRef)}
                            onDelete={() => onRemove(entityRef)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
