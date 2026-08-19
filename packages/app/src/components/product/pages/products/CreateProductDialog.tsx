import { useEffect, useState } from 'react';
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    TextField,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { ProductDefinition } from '@internal/backstage-plugin-konflux-common';
import { useCreateProduct } from '../../hooks/product/useCreateProduct';

export interface CreateProductDialogProps {
    open: boolean;
    onClose: () => void;
    onCreated: (product: ProductDefinition) => void;
}

export const CreateProductDialog = ({
    open,
    onClose,
    onCreated,
}: CreateProductDialogProps) => {
    const {
        createProduct,
        creating,
        error: mutationError,
    } = useCreateProduct();

    const [name, setName] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [owner, setOwner] = useState('group:default/guests');
    const [localError, setLocalError] = useState<string>();

    useEffect(() => {
        if (!open) return;
        setName('');
        setTitle('');
        setDescription('');
        setOwner('group:default/guests');
        setLocalError(undefined);
    }, [open]);

    const error = localError ?? mutationError;

    const handleCreate = async () => {
        setLocalError(undefined);
        try {
            const created = await createProduct({
                name: name.trim().toLowerCase(),
                title: title.trim() || undefined,
                description: description.trim() || undefined,
                owner: owner.trim() || undefined,
            });
            onCreated(created);
        } catch {
            // mutationError is already set by useCreateProduct
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Create Product</DialogTitle>
            <DialogContent>
                <DialogContentText>
                    Creates a new Backstage System representing a product. After
                    creation you will be taken to its Product tab to add Konflux
                    applications and Pyxis listings.
                </DialogContentText>

                {error && (
                    <Box mb={2}>
                        <Alert severity="error">{error}</Alert>
                    </Box>
                )}

                <TextField
                    label="Name (slug)"
                    fullWidth
                    margin="normal"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    helperText="Lowercase letters, numbers, and hyphens only"
                    disabled={creating}
                />
                <TextField
                    label="Title (optional)"
                    fullWidth
                    margin="normal"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    disabled={creating}
                />
                <TextField
                    label="Description (optional)"
                    fullWidth
                    multiline
                    margin="normal"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    disabled={creating}
                />
                <TextField
                    label="Owner"
                    fullWidth
                    margin="normal"
                    value={owner}
                    onChange={e => setOwner(e.target.value)}
                    helperText="e.g. group:default/my-team"
                    disabled={creating}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={creating}>
                    Cancel
                </Button>
                <Button
                    onClick={() => void handleCreate()}
                    color="primary"
                    variant="contained"
                    disabled={creating || !name.trim()}
                >
                    {creating ? 'Creating…' : 'Create'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};
