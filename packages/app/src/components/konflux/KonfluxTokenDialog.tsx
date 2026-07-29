import { useState } from 'react';
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Link,
    TextField,
    Typography,
} from '@material-ui/core';
import {
    discoveryApiRef,
    fetchApiRef,
    useApi,
} from '@backstage/core-plugin-api';
import {
    ClusterPublicInfo,
    KONFLUX_TOKENS_HEADER,
} from '@internal/backstage-plugin-konflux-common';

export interface KonfluxTokenDialogProps {
    cluster: ClusterPublicInfo;
    open: boolean;
    onAuthenticated: (clusterId: string, token: string) => void;
    onClose: () => void;
}

/**
 * Per-cluster dialog for pasting an OpenShift "Copy login command" token.
 */
export function KonfluxTokenDialog(props: KonfluxTokenDialogProps) {
    const { cluster, open, onAuthenticated, onClose } = props;
    const discoveryApi = useApi(discoveryApiRef);
    const fetchApi = useApi(fetchApiRef);
    const [token, setToken] = useState('');
    const [validating, setValidating] = useState(false);
    const [error, setError] = useState<string>();

    const tokenDisplayUrl = cluster.consoleUrl
        ? `${cluster.consoleUrl.replace(/\/$/, '')}/oauth/token/display`
        : undefined;

    const handleSubmit = async () => {
        const trimmed = token.trim();
        if (!trimmed) {
            setError('Paste a token to continue');
            return;
        }

        setValidating(true);
        setError(undefined);

        try {
            const baseUrl = await discoveryApi.getBaseUrl('konflux');
            const response = await fetchApi.fetch(`${baseUrl}/projects`, {
                headers: {
                    [KONFLUX_TOKENS_HEADER]: JSON.stringify({
                        [cluster.id]: trimmed,
                    }),
                    Accept: 'application/json',
                },
            });

            if (response.status === 401) {
                setError(
                    'Token was rejected by the cluster. Copy a fresh token from the OpenShift console and try again.',
                );
                return;
            }

            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                setError(body.error || `Validation failed: HTTP ${response.status}`);
                return;
            }

            onAuthenticated(cluster.id, trimmed);
            setToken('');
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setValidating(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                Connect to {cluster.name || cluster.id}
            </DialogTitle>
            <DialogContent>
                <DialogContentText>
                    Paste a personal access token for{' '}
                    <strong>{cluster.name || cluster.id}</strong> only. Tokens
                    are per-cluster and are stored in this browser tab
                    (sessionStorage), then sent to the Backstage backend for API
                    calls against that cluster.
                </DialogContentText>

                {tokenDisplayUrl ? (
                    <Typography paragraph>
                        <Link
                            href={tokenDisplayUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Open OpenShift &quot;Display Token&quot; page
                        </Link>{' '}
                        — sign in, then copy the token under &quot;Your API
                        token&quot; / &quot;Copy login command&quot;.
                    </Typography>
                ) : (
                    <Typography paragraph color="textSecondary">
                        No console URL configured for this cluster. Obtain a
                        token via <code>oc whoami -t</code> or the OpenShift
                        console.
                    </Typography>
                )}

                <TextField
                    margin="dense"
                    label="OpenShift API token"
                    type="password"
                    fullWidth
                    multiline
                    minRows={2}
                    value={token}
                    onChange={e => setToken(e.target.value)}
                    error={!!error}
                    helperText={error}
                    disabled={validating}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={validating}>
                    Cancel
                </Button>
                <Button
                    onClick={handleSubmit}
                    color="primary"
                    variant="contained"
                    disabled={validating || !token.trim()}
                >
                    {validating ? 'Validating…' : 'Connect'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
