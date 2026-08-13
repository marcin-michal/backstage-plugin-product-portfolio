import { LoggerService } from '@backstage/backend-plugin-api';
import { getHttpStatusCode } from './errors';

type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonValue[]
    | { [key: string]: JsonValue };

export interface LogContext {
    cluster?: string;
    namespace?: string;
    resource?: string;
    [key: string]: JsonValue | undefined;
}

export class StructuredLogger {
    public readonly baseLogger: LoggerService;

    constructor(baseLogger: LoggerService) {
        this.baseLogger = baseLogger;
    }

    error(message: string, error?: unknown, context?: LogContext): void {
        this.baseLogger.error(message, {
            ...this.buildContext(context),
            ...this.extractErrorContext(error),
        });
    }

    warn(message: string, context?: LogContext): void {
        this.baseLogger.warn(message, this.buildContext(context));
    }

    info(message: string, context?: LogContext): void {
        this.baseLogger.info(message, this.buildContext(context));
    }

    debug(message: string, context?: LogContext): void {
        this.baseLogger.debug(message, this.buildContext(context));
    }

    private buildContext(additionalContext?: LogContext): LogContext {
        return additionalContext || {};
    }

    private extractErrorContext(error?: unknown): LogContext {
        if (!error) {
            return {};
        }

        if (error instanceof Error) {
            const context: LogContext = {
                error: error.message,
                errorName: error.name,
                ...(error.stack && { errorStack: error.stack }),
            };

            const statusCode = getHttpStatusCode(error);
            if (statusCode !== undefined) {
                context.statusCode = statusCode;
            }

            return context;
        }

        return { error: String(error) };
    }
}
