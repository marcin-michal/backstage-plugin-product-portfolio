/**
 * HTTP-aware error helpers for Kubernetes / OpenShift API failures.
 */

export class HttpStatusError extends Error {
    readonly statusCode: number;

    constructor(message: string, statusCode: number) {
        super(message);
        this.name = 'HttpStatusError';
        this.statusCode = statusCode;
    }
}

/**
 * Extract an HTTP status code from unknown thrown values
 * (HttpStatusError, fetch Response-like objects, k8s client errors, etc.).
 */
export function getHttpStatusCode(error: unknown): number | undefined {
    if (error instanceof HttpStatusError) {
        return error.statusCode;
    }

    if (typeof error !== 'object' || error === null) {
        // k8s client often stringifies as "HTTP-Code: 404\nMessage: ..."
        if (typeof error === 'string') {
            const match = error.match(/HTTP-Code:\s*(\d+)/i);
            if (match) {
                return Number.parseInt(match[1], 10);
            }
        }
        return undefined;
    }

    if (
        'statusCode' in error &&
        typeof (error as { statusCode: unknown }).statusCode === 'number'
    ) {
        return (error as { statusCode: number }).statusCode;
    }

    if (
        'status' in error &&
        typeof (error as { status: unknown }).status === 'number'
    ) {
        return (error as { status: number }).status;
    }

    if (
        'code' in error &&
        typeof (error as { code: unknown }).code === 'number'
    ) {
        return (error as { code: number }).code;
    }

    if (error instanceof Error) {
        const match = error.message.match(/HTTP-Code:\s*(\d+)/i);
        if (match) {
            return Number.parseInt(match[1], 10);
        }
    }

    return undefined;
}

export function errorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return String(error);
}
