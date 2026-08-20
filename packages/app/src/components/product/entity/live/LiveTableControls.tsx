import { IconButton, TablePagination, Tooltip } from '@material-ui/core';
import RefreshIcon from '@material-ui/icons/Refresh';
import { PAGE_SIZE_OPTIONS } from '../../hooks/api/queryTypes';

export interface LiveTablePaginationProps {
    page: number;
    pageSize: number;
    rowCount: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    isFetchingPage: boolean;
    onNextPage: () => void;
    onPreviousPage: () => void;
    onPageSizeChange: (size: number) => void;
}

export const LiveTablePagination = ({
    page,
    pageSize,
    rowCount,
    hasNextPage,
    hasPreviousPage,
    isFetchingPage,
    onNextPage,
    onPreviousPage,
    onPageSizeChange,
}: LiveTablePaginationProps) => {
    const count = hasNextPage
        ? (page + 1) * pageSize + 1
        : page * pageSize + rowCount;

    return (
        <TablePagination
            component="div"
            count={count}
            page={page}
            rowsPerPage={pageSize}
            rowsPerPageOptions={[...PAGE_SIZE_OPTIONS]}
            onPageChange={(_event, nextPage) => {
                if (nextPage > page) {
                    onNextPage();
                    return;
                }
                onPreviousPage();
            }}
            onRowsPerPageChange={event => {
                onPageSizeChange(Number.parseInt(event.target.value, 10));
            }}
            nextIconButtonProps={{
                disabled: isFetchingPage || !hasNextPage,
            }}
            backIconButtonProps={{
                disabled: isFetchingPage || !hasPreviousPage,
            }}
            labelDisplayedRows={({ from, to }) => `${from}-${to}`}
        />
    );
};

export const RefreshButton = ({
    onClick,
    disabled,
}: {
    onClick: () => void;
    disabled?: boolean;
}) => (
    <Tooltip title="Refresh">
        <span>
            <IconButton
                size="small"
                onClick={onClick}
                disabled={disabled}
                aria-label="Refresh"
            >
                <RefreshIcon />
            </IconButton>
        </span>
    </Tooltip>
);
