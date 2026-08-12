import { makeStyles } from '@material-ui/core';

export const useProductsStyles = makeStyles(theme => ({
    root: {
        padding: theme.spacing(3),
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing(2),
    },
    headerRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: theme.spacing(2),
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    filters: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: theme.spacing(2),
        alignItems: 'center',
    },
}));
