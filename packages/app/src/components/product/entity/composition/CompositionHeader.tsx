import { Button, Chip, Typography } from '@material-ui/core';
import { useCompositionStyles } from './composition.styles';

export interface CompositionHeaderProps {
    productName: string;
    description?: string;
    source: 'auto' | 'manual';
    applicationCount: number;
    componentCount: number;
    listingCount: number;
    repositoryCount: number;
    onOpenPicker: () => void;
}

export const CompositionHeader = ({
    productName,
    description,
    source,
    applicationCount,
    componentCount,
    listingCount,
    repositoryCount,
    onOpenPicker,
}: CompositionHeaderProps) => {
    const classes = useCompositionStyles();

    return (
        <div className={classes.headerRow}>
            <div>
                <Typography variant="h5">{productName}</Typography>
                {description && (
                    <Typography variant="body2" color="textSecondary">
                        {description}
                    </Typography>
                )}
                <Typography variant="body2" color="textSecondary">
                    {applicationCount} application
                    {applicationCount === 1 ? '' : 's'}, {componentCount}{' '}
                    component{componentCount === 1 ? '' : 's'}, {listingCount}{' '}
                    listing{listingCount === 1 ? '' : 's'}, {repositoryCount}{' '}
                    repositor{repositoryCount === 1 ? 'y' : 'ies'}
                </Typography>
            </div>
            <div className={classes.headerActions}>
                <Chip
                    size="small"
                    variant="outlined"
                    label={source === 'manual' ? 'Manual' : 'Auto'}
                />
                <Button
                    variant="contained"
                    color="primary"
                    onClick={onOpenPicker}
                >
                    Edit composition
                </Button>
            </div>
        </div>
    );
};
