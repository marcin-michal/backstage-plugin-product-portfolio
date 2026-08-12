import { Button } from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { ClusterPublicInfo } from '@internal/backstage-plugin-konflux-common';
import { useCompositionStyles } from './composition.styles';

export interface CompositionAlertsProps {
    productName: string;
    configured: boolean;
    missingBindingClusters: string[];
    clusters: ClusterPublicInfo[];
    onConnectCluster: (clusterId: string) => void;
    onOpenPicker: () => void;
    refreshError?: string;
    onDismissRefreshError: () => void;
}

export const CompositionAlerts = ({
    productName,
    configured,
    missingBindingClusters,
    clusters,
    onConnectCluster,
    onOpenPicker,
    refreshError,
    onDismissRefreshError,
}: CompositionAlertsProps) => {
    const classes = useCompositionStyles();

    return (
        <>
            {!configured && (
                <Alert severity="info">
                    This product has no resource composition yet. Bind Konflux
                    Applications and Pyxis product listings to{' '}
                    <strong>{productName}</strong>. This does not create a new
                    System — it defines what belongs to this product.
                    <div className={classes.buttonRow}>
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={onOpenPicker}
                        >
                            Compose Resources
                        </Button>
                    </div>
                </Alert>
            )}

            {configured && missingBindingClusters.length > 0 && (
                <Alert severity="warning">
                    Missing tokens for:{' '}
                    {missingBindingClusters
                        .map(id => {
                            const c = clusters.find(cl => cl.id === id);
                            return c?.name || id;
                        })
                        .join(', ')}
                    . Connect those clusters to load live data, or view stored
                    snapshots below.
                    <div className={classes.buttonRow}>
                        {missingBindingClusters.map(id => (
                            <Button
                                key={id}
                                size="small"
                                variant="outlined"
                                onClick={() => onConnectCluster(id)}
                            >
                                Connect {id}
                            </Button>
                        ))}
                    </div>
                </Alert>
            )}

            {refreshError && (
                <Alert severity="error" onClose={onDismissRefreshError}>
                    {refreshError}
                </Alert>
            )}
        </>
    );
};
