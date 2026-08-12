import {
    Button,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    TextField,
} from '@material-ui/core';
import { ClusterPublicInfo, NamespaceMapping } from '@internal/backstage-plugin-konflux-common';
import { useCompositionStyles } from './composition.styles';

export interface CompositionFiltersProps {
    clusters: ClusterPublicInfo[];
    namespaceMappings: NamespaceMapping[];
    namespaceOptions: Array<{
        cluster: string;
        namespace: string;
        label: string;
    }>;
    searchInput: string;
    onSearchInputChange: (value: string) => void;
    onSearch: () => void;
    clusterFilter: string;
    onClusterFilterChange: (value: string) => void;
    namespaceFilter: string;
    onNamespaceFilterChange: (value: string) => void;
}

export const CompositionFilters = ({
    clusters,
    namespaceMappings,
    namespaceOptions,
    searchInput,
    onSearchInputChange,
    onSearch,
    clusterFilter,
    onClusterFilterChange,
    namespaceFilter,
    onNamespaceFilterChange,
}: CompositionFiltersProps) => {
    const classes = useCompositionStyles();

    return (
        <div className={classes.filters}>
            <TextField
                className={classes.filterControl}
                label="Search"
                value={searchInput}
                onChange={e => onSearchInputChange(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter') {
                        onSearch();
                    }
                }}
                placeholder="Filter by name…"
            />
            <Button variant="outlined" onClick={onSearch}>
                Search
            </Button>

            <FormControl className={classes.filterControl}>
                <InputLabel>Cluster</InputLabel>
                <Select
                    value={clusterFilter}
                    onChange={e => {
                        onClusterFilterChange(e.target.value as string);
                        onNamespaceFilterChange('');
                    }}
                >
                    <MenuItem value="">All</MenuItem>
                    {clusters
                        .filter(c =>
                            namespaceMappings.some(m => m.cluster === c.id),
                        )
                        .map(c => (
                            <MenuItem key={c.id} value={c.id}>
                                {c.name || c.id}
                            </MenuItem>
                        ))}
                </Select>
            </FormControl>

            <FormControl className={classes.filterControl}>
                <InputLabel>Namespace</InputLabel>
                <Select
                    value={namespaceFilter}
                    onChange={e =>
                        onNamespaceFilterChange(e.target.value as string)
                    }
                >
                    <MenuItem value="">All</MenuItem>
                    {namespaceOptions.map(opt => (
                        <MenuItem
                            key={`${opt.cluster}:${opt.namespace}`}
                            value={opt.namespace}
                        >
                            {opt.label}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>
        </div>
    );
};
