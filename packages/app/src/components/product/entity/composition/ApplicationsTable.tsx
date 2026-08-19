import { Fragment, useState } from 'react';
import {
    Collapse,
    IconButton,
    Link,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography,
} from '@material-ui/core';
import KeyboardArrowDownIcon from '@material-ui/icons/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@material-ui/icons/KeyboardArrowUp';
import { EntityRefLink } from '@backstage/plugin-catalog-react';
import {
    ClusterPublicInfo,
    KonfluxAppSummary,
    KonfluxComponentSummary,
} from '@internal/backstage-plugin-konflux-common';
import {
    clusterDisplayName,
    clusterUiUrl,
    getKonfluxUIApplicationUrl,
    getKonfluxUIComponentUrl,
} from '../../utils/konfluxUrls';
import { MatchSourceChip } from './MatchSourceChip';
import { useCompositionStyles } from './composition.styles';

const NestedComponentsTable = ({
    components,
    clusters,
}: {
    components: KonfluxComponentSummary[];
    clusters: ClusterPublicInfo[];
}) => (
    <Table size="small">
        <TableHead>
            <TableRow>
                <TableCell>Component</TableCell>
                <TableCell>Cluster</TableCell>
                <TableCell>Namespace</TableCell>
                <TableCell>Source</TableCell>
                <TableCell>Konflux</TableCell>
            </TableRow>
        </TableHead>
        <TableBody>
            {components.map(component => {
                const uiUrl = clusterUiUrl(clusters, component.cluster);
                const konfluxHref =
                    uiUrl && component.namespace && component.applicationName
                        ? getKonfluxUIComponentUrl(
                              uiUrl,
                              component.namespace,
                              component.applicationName,
                              component.name,
                          )
                        : undefined;

                return (
                    <TableRow key={component.entityRef}>
                        <TableCell>
                            <EntityRefLink entityRef={component.entityRef}>
                                {component.name}
                            </EntityRefLink>
                        </TableCell>
                        <TableCell>
                            {clusterDisplayName(clusters, component.cluster)}
                        </TableCell>
                        <TableCell>{component.namespace}</TableCell>
                        <TableCell>
                            <MatchSourceChip source={component.matchSource} />
                        </TableCell>
                        <TableCell>
                            {konfluxHref ? (
                                <Link
                                    href={konfluxHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    Open in Konflux
                                </Link>
                            ) : (
                                '—'
                            )}
                        </TableCell>
                    </TableRow>
                );
            })}
        </TableBody>
    </Table>
);

export interface ApplicationsTableProps {
    applications: KonfluxAppSummary[];
    components: KonfluxComponentSummary[];
    clusters: ClusterPublicInfo[];
}

export const ApplicationsTable = ({
    applications,
    components,
    clusters,
}: ApplicationsTableProps) => {
    const classes = useCompositionStyles();
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const toggle = (entityRef: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(entityRef)) {
                next.delete(entityRef);
            } else {
                next.add(entityRef);
            }
            return next;
        });
    };

    const componentsByApp = (appRef: string) =>
        components.filter(c => c.applicationEntityRef === appRef);

    return (
        <div className={classes.section}>
            <Typography variant="h6">Konflux applications</Typography>
            {applications.length === 0 ? (
                <Typography variant="body2" color="textSecondary">
                    No Konflux applications linked yet.
                </Typography>
            ) : (
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell padding="checkbox" />
                            <TableCell>Application</TableCell>
                            <TableCell>Cluster</TableCell>
                            <TableCell>Namespace</TableCell>
                            <TableCell>Components</TableCell>
                            <TableCell>Source</TableCell>
                            <TableCell>Konflux</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {applications.map(app => {
                            const nested = componentsByApp(app.entityRef);
                            const isOpen = expanded.has(app.entityRef);
                            const uiUrl = clusterUiUrl(clusters, app.cluster);
                            const displayName = app.title ?? app.name;
                            const konfluxHref =
                                uiUrl && app.namespace && app.applicationName
                                    ? getKonfluxUIApplicationUrl(
                                          uiUrl,
                                          app.namespace,
                                          app.applicationName,
                                      )
                                    : undefined;

                            return (
                                <Fragment key={app.entityRef}>
                                    <TableRow>
                                        <TableCell padding="checkbox">
                                            <IconButton
                                                size="small"
                                                aria-label={
                                                    isOpen
                                                        ? 'Collapse components'
                                                        : 'Expand components'
                                                }
                                                disabled={nested.length === 0}
                                                onClick={() =>
                                                    toggle(app.entityRef)
                                                }
                                            >
                                                {isOpen ? (
                                                    <KeyboardArrowUpIcon />
                                                ) : (
                                                    <KeyboardArrowDownIcon />
                                                )}
                                            </IconButton>
                                        </TableCell>
                                        <TableCell>
                                            <EntityRefLink
                                                entityRef={app.entityRef}
                                            >
                                                {displayName}
                                            </EntityRefLink>
                                        </TableCell>
                                        <TableCell>
                                            {clusterDisplayName(
                                                clusters,
                                                app.cluster,
                                            )}
                                        </TableCell>
                                        <TableCell>{app.namespace}</TableCell>
                                        <TableCell>{nested.length}</TableCell>
                                        <TableCell>
                                            <MatchSourceChip
                                                source={app.matchSource}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            {konfluxHref ? (
                                                <Link
                                                    href={konfluxHref}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                >
                                                    Open in Konflux
                                                </Link>
                                            ) : (
                                                '—'
                                            )}
                                        </TableCell>
                                    </TableRow>
                                    {isOpen && nested.length > 0 && (
                                        <TableRow>
                                            <TableCell
                                                colSpan={7}
                                                className={classes.nestedCell}
                                            >
                                                <Collapse in={isOpen}>
                                                    <NestedComponentsTable
                                                        components={nested}
                                                        clusters={clusters}
                                                    />
                                                </Collapse>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </Fragment>
                            );
                        })}
                    </TableBody>
                </Table>
            )}
        </div>
    );
};
