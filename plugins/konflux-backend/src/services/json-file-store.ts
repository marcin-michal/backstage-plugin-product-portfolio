import { promises as fs } from 'fs';
import * as path from 'path';
import { LoggerService } from '@backstage/backend-plugin-api';

/**
 * Generic file-backed key-value store backed by a single JSON file.
 *
 * Subclasses add domain-specific query methods on top of the shared
 * load/cache/persist infrastructure.
 *
 * NOTE: This is for a single-instance PoC. Multi-instance deployments
 * will replace this with a shared database.
 */
export abstract class JsonFileStore<T> {
    protected readonly filePath: string;
    protected readonly logger: LoggerService;
    private cache: Record<string, T> | undefined;
    private loadPromise: Promise<Record<string, T>> | undefined;

    constructor(filePath: string, logger: LoggerService) {
        this.filePath = path.resolve(filePath);
        this.logger = logger;
    }

    get path(): string {
        return this.filePath;
    }

    protected async load(): Promise<Record<string, T>> {
        if (this.cache) {
            return this.cache;
        }
        if (!this.loadPromise) {
            this.loadPromise = this.readFromDisk();
        }
        try {
            this.cache = await this.loadPromise;
            return this.cache;
        } finally {
            this.loadPromise = undefined;
        }
    }

    private async readFromDisk(): Promise<Record<string, T>> {
        try {
            const raw = await fs.readFile(this.filePath, 'utf8');
            const parsed = JSON.parse(raw) as unknown;
            if (
                !parsed ||
                typeof parsed !== 'object' ||
                Array.isArray(parsed)
            ) {
                this.logger.warn(
                    `Store file is not a JSON object; starting empty`,
                    { path: this.filePath },
                );
                return {};
            }
            return parsed as Record<string, T>;
        } catch (error) {
            const code =
                error && typeof error === 'object' && 'code' in error
                    ? (error as NodeJS.ErrnoException).code
                    : undefined;
            if (code === 'ENOENT') {
                return {};
            }
            this.logger.error(`Failed to read store file; starting empty`, {
                path: this.filePath,
                error: error instanceof Error ? error.message : String(error),
            });
            return {};
        }
    }

    protected async persist(data: Record<string, T>): Promise<void> {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
        const payload = `${JSON.stringify(data, null, 2)}\n`;
        try {
            await fs.writeFile(tmpPath, payload, 'utf8');
            await fs.rename(tmpPath, this.filePath);
            this.cache = data;
        } catch (error) {
            await fs.unlink(tmpPath).catch(() => undefined);
            throw error;
        }
    }
}
