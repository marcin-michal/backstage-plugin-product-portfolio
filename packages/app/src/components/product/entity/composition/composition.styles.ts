import { makeStyles } from '@material-ui/core';

export const useCompositionStyles = makeStyles(theme => ({
    root: {
        padding: theme.spacing(2),
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing(2),
    },
    headerRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: theme.spacing(1),
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerActions: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: theme.spacing(1),
    },
    authBar: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: theme.spacing(1),
        alignItems: 'center',
    },
    filters: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: theme.spacing(2),
        alignItems: 'flex-end',
    },
    filterControl: {
        minWidth: 180,
    },
    section: {
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing(1),
    },
    buttonRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: theme.spacing(1),
        marginTop: theme.spacing(1),
    },
}));
