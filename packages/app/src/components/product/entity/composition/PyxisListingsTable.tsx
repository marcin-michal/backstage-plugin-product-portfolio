import {
    CircularProgress,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { Entity, stringifyEntityRef } from '@backstage/catalog-model';
import { EntityRefLink } from '@backstage/plugin-catalog-react';
import { PyxisBinding } from '@internal/backstage-plugin-konflux-common';
import { useCompositionStyles } from './composition.styles';

export interface PyxisListingsTableProps {
    pyxisBindings: PyxisBinding[];
    pyxisEntities: Entity[];
    pyxisLoading: boolean;
    pyxisError?: Error;
}

export const PyxisListingsTable = ({
    pyxisBindings,
    pyxisEntities,
    pyxisLoading,
    pyxisError,
}: PyxisListingsTableProps) => {
    const classes = useCompositionStyles();

    return (
        <div className={classes.section}>
            <Typography variant="h6">Pyxis Product Listings</Typography>
            {pyxisLoading && <CircularProgress size={24} />}
            {pyxisError && (
                <Alert severity="error">{pyxisError.message}</Alert>
            )}
            {!pyxisLoading && pyxisBindings.length === 0 && (
                <Alert severity="info">
                    No Pyxis product listings linked. Use Edit Composition to
                    add some.
                </Alert>
            )}
            {pyxisBindings.length > 0 && (
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Name</TableCell>
                            <TableCell>Entity</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {pyxisBindings.map(binding => {
                            const resolved = pyxisEntities.find(
                                e =>
                                    stringifyEntityRef(e) ===
                                    binding.entityRef,
                            );
                            const label =
                                binding.label ??
                                resolved?.metadata.title ??
                                resolved?.metadata.name ??
                                binding.entityRef;

                            return (
                                <TableRow key={binding.entityRef}>
                                    <TableCell>
                                        <EntityRefLink
                                            entityRef={binding.entityRef}
                                        >
                                            {label}
                                        </EntityRefLink>
                                    </TableCell>
                                    <TableCell>{binding.entityRef}</TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            )}
        </div>
    );
};
