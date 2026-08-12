import { Chip, Typography } from '@material-ui/core';
import { ClusterPublicInfo } from '@internal/backstage-plugin-konflux-common';
import { useCompositionStyles } from '../entity/composition/composition.styles';

export interface ClusterAuthBarProps {
    clusters: ClusterPublicInfo[];
    hasToken: (clusterId: string) => boolean;
    onConnect: (clusterId: string) => void;
    onDisconnect: (clusterId: string) => void;
}

export const ClusterAuthBar = ({
    clusters,
    hasToken,
    onConnect,
    onDisconnect,
}: ClusterAuthBarProps) => {
    const classes = useCompositionStyles();

    return (
        <div className={classes.authBar}>
            <Typography variant="subtitle2">Clusters:</Typography>
            {clusters.map(cluster => {
                const connected = hasToken(cluster.id);
                const label = cluster.name || cluster.id;

                return (
                    <Chip
                        key={cluster.id}
                        label={
                            connected
                                ? `${label} · connected`
                                : `${label} · connect`
                        }
                        color={connected ? 'primary' : 'default'}
                        variant={connected ? 'default' : 'outlined'}
                        onClick={() => onConnect(cluster.id)}
                        onDelete={
                            connected
                                ? () => onDisconnect(cluster.id)
                                : undefined
                        }
                        title={
                            connected
                                ? `Re-authenticate or disconnect ${label}`
                                : `Paste an OpenShift token for ${label}`
                        }
                    />
                );
            })}
        </div>
    );
};
