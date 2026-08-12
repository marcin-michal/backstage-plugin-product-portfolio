import { makeStyles } from '@material-ui/core';

export const useResourcePickerStyles = makeStyles(theme => ({
    section: {
        marginTop: theme.spacing(2),
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: theme.shape.borderRadius,
        padding: theme.spacing(1.5),
    },
    sectionHeader: {
        marginBottom: theme.spacing(1),
    },
    filters: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: theme.spacing(1.5),
        marginBottom: theme.spacing(1),
        alignItems: 'flex-end',
    },
    filterControl: {
        minWidth: 180,
    },
    namespaceControl: {
        minWidth: 320,
        flex: 1,
    },
    list: {
        maxHeight: 260,
        overflow: 'auto',
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: theme.shape.borderRadius,
    },
    chipRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: theme.spacing(1),
        marginTop: theme.spacing(1),
    },
    summary: {
        marginTop: theme.spacing(2),
    },
}));
