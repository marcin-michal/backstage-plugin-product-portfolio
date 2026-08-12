import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
} from '@material-ui/core';
import { KonfluxResourceBinding } from '@internal/backstage-plugin-konflux-common';
import { konfluxBindingKey } from '../../utils/bindings';

export interface SnapshotsTableProps {
    konfluxBindings: KonfluxResourceBinding[];
}

export const SnapshotsTable = ({ konfluxBindings }: SnapshotsTableProps) => {
    return (
        <Table size="small">
            <TableHead>
                <TableRow>
                    <TableCell>Application</TableCell>
                    <TableCell>Namespace</TableCell>
                    <TableCell>Cluster</TableCell>
                    <TableCell>Snapshot</TableCell>
                </TableRow>
            </TableHead>
            <TableBody>
                {konfluxBindings.map(binding => (
                    <TableRow key={konfluxBindingKey(binding)}>
                        <TableCell>
                            {binding.snapshot?.displayName ??
                                binding.application}
                        </TableCell>
                        <TableCell>{binding.namespace}</TableCell>
                        <TableCell>{binding.cluster}</TableCell>
                        <TableCell>
                            {binding.snapshot?.fetchedAt
                                ? `Saved ${new Date(
                                      binding.snapshot.fetchedAt,
                                  ).toLocaleString()}`
                                : 'No snapshot'}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
};
