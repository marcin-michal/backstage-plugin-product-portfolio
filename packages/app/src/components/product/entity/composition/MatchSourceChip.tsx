import { Chip } from '@material-ui/core';

export const MatchSourceChip = ({ source }: { source: 'auto' | 'manual' }) => (
    <Chip
        size="small"
        variant="outlined"
        label={source === 'manual' ? 'Manual' : 'Auto'}
    />
);
