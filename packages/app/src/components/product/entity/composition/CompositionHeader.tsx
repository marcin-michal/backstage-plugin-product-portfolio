import { Button, Typography } from '@material-ui/core';
import { useCompositionStyles } from './composition.styles';

export interface CompositionHeaderProps {
    productName: string;
    configured: boolean;
    refreshing: boolean;
    onOpenPicker: () => void;
    onRefresh: () => void;
}

export const CompositionHeader = ({
    productName,
    configured,
    refreshing,
    onOpenPicker,
    onRefresh,
}: CompositionHeaderProps) => {
    const classes = useCompositionStyles();

    return (
        <div className={classes.headerRow}>
            <div>
                <Typography variant="h5">Product composition</Typography>
                <Typography variant="body2" color="textSecondary">
                    Konflux Applications and Pyxis listings bound to{' '}
                    <strong>{productName}</strong>
                    {configured ? '' : ' — not composed yet'}
                </Typography>
            </div>
            <div className={classes.headerActions}>
                <Button
                    variant="outlined"
                    color="primary"
                    onClick={onOpenPicker}
                >
                    {configured ? 'Edit Composition' : 'Compose Resources'}
                </Button>
                {configured && (
                    <Button
                        variant="text"
                        onClick={onRefresh}
                        disabled={refreshing}
                    >
                        {refreshing ? 'Refreshing…' : 'Refresh'}
                    </Button>
                )}
            </div>
        </div>
    );
};
