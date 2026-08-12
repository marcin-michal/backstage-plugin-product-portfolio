import { QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { queryClient } from '../../../queryClient';

export interface QueryClientBoundaryProps {
    children: ReactNode;
}

/**
 * Wraps page content in a QueryClientProvider since the new frontend system
 * doesn't (yet) expose a root-wrapper extension point for providers shared
 * across the whole app.
 */
export const QueryClientBoundary = ({ children }: QueryClientBoundaryProps) => {
    return (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
};
