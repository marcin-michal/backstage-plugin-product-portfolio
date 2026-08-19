import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography,
} from '@material-ui/core';
import { EntityRefLink } from '@backstage/plugin-catalog-react';
import { PyxisListingSummary } from '@internal/backstage-plugin-konflux-common';
import { MatchSourceChip } from './MatchSourceChip';
import { useCompositionStyles } from './composition.styles';

export interface PyxisListingsTableProps {
    listings: PyxisListingSummary[];
}

export const PyxisListingsTable = ({ listings }: PyxisListingsTableProps) => {
    const classes = useCompositionStyles();

    return (
        <div className={classes.section}>
            <Typography variant="h6">Pyxis product listings</Typography>
            {listings.length === 0 ? (
                <Typography variant="body2" color="textSecondary">
                    No Pyxis product listings linked yet.
                </Typography>
            ) : (
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Listing</TableCell>
                            <TableCell>Source</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {listings.map(listing => (
                            <TableRow key={listing.entityRef}>
                                <TableCell>
                                    <EntityRefLink
                                        entityRef={listing.entityRef}
                                    >
                                        {listing.title ?? listing.name}
                                    </EntityRefLink>
                                </TableCell>
                                <TableCell>
                                    <MatchSourceChip
                                        source={listing.matchSource}
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </div>
    );
};
