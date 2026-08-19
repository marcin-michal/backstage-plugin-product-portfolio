import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography,
} from '@material-ui/core';
import { EntityRefLink } from '@backstage/plugin-catalog-react';
import { PyxisRepositorySummary } from '@internal/backstage-plugin-konflux-common';
import { useCompositionStyles } from './composition.styles';

export interface RepositoriesTableProps {
    repositories: PyxisRepositorySummary[];
}

export const RepositoriesTable = ({ repositories }: RepositoriesTableProps) => {
    const classes = useCompositionStyles();

    return (
        <div className={classes.section}>
            <Typography variant="h6">Pyxis container repositories</Typography>
            {repositories.length === 0 ? (
                <Typography variant="body2" color="textSecondary">
                    No container repositories linked to this product.
                </Typography>
            ) : (
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Repository</TableCell>
                            <TableCell>Parent listing</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {repositories.map(repo => (
                            <TableRow key={repo.entityRef}>
                                <TableCell>
                                    <EntityRefLink entityRef={repo.entityRef}>
                                        {repo.repository ??
                                            repo.title ??
                                            repo.name}
                                    </EntityRefLink>
                                </TableCell>
                                <TableCell>
                                    {repo.listingEntityRef ? (
                                        <EntityRefLink
                                            entityRef={repo.listingEntityRef}
                                        >
                                            {repo.listingTitle ??
                                                repo.listingEntityRef}
                                        </EntityRefLink>
                                    ) : (
                                        '—'
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </div>
    );
};
