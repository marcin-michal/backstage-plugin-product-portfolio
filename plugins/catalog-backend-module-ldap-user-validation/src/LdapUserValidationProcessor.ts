import {
    CatalogProcessor,
    // CatalogProcessorEmit,
    // processingResult,
} from '@backstage/plugin-catalog-node';
import { Entity } from '@backstage/catalog-model';
// import { LocationSpec } from '@backstage/plugin-catalog-common';
import { LoggerService } from '@backstage/backend-plugin-api';
import { Client } from 'ldapts';

interface LdapUserInfo {
    uid: string;
    cn: string;
    rhatUUID: string;
    email: string;
}

interface LdapValidationConfig {
    ldapUrl: string;
    ldapUserBase: string;
}

export class LdapUserValidationProcessor implements CatalogProcessor {
    private readonly ldapUrl: string;
    private readonly ldapUserBase: string;
    private readonly logger: LoggerService;

    constructor(config: LdapValidationConfig, logger: LoggerService) {
        this.ldapUrl = config.ldapUrl;
        this.ldapUserBase = config.ldapUserBase;
        this.logger = logger;
    }

    getProcessorName(): string {
        return 'LdapUserValidationProcessor';
    }

    async postProcessEntity(
        entity: Entity,
        // location: LocationSpec,
        // emit: CatalogProcessorEmit,
    ): Promise<Entity> {
        if (entity.kind !== 'User') {
            return entity;
        }

        const rhatUUID = entity.metadata.annotations?.['redhat.com/rhat-uuid'];
        if (!rhatUUID) {
            return entity;
        }

        try {
            const userInfo = await this.lookupUser(rhatUUID);

            if (!userInfo) {
                entity.metadata.annotations = {
                    ...entity.metadata.annotations,
                    'redhat.com/employee-status': 'not-found',
                };
                entity.metadata.tags = [
                    ...(entity.metadata.tags || []),
                    'ldap-not-found',
                ];

                // EMITING GENERAL ERROR WILL MEAN THE USER ENTITY WILL GET DELETED/SHOW THE LAST GOOD STATE

                // emit(
                //     processingResult.generalError(
                //         location,
                //         `User (rhatUUID=${rhatUUID}) not found ` +
                //         `in LDAP - may no longer be a Red Hat employee`,
                //     ),
                // );
            } else {
                entity.metadata.annotations = {
                    ...entity.metadata.annotations,
                    'redhat.com/employee-status': 'active',
                };

                if (entity.spec && typeof entity.spec === 'object') {
                    const spec = entity.spec as Record<string, unknown>;
                    spec.profile = {
                        ...(spec.profile as Record<string, unknown> || {}),
                        displayName: userInfo.cn || userInfo.uid,
                        email: userInfo.email,
                    };
                }
            }
        } catch (err) {
            this.logger.warn(
                `LDAP lookup failed for ${rhatUUID}: ${err}. ` +
                `Skipping validation`,
            );
        }

        return entity;
    }

    private async lookupUser(rhatUUID: string): Promise<LdapUserInfo | null> {
        const client = new Client({ url: this.ldapUrl });

        try {
            await client.bind('', '');

            const { searchEntries } = await client.search(this.ldapUserBase, {
                scope: 'sub',
                filter: `(rhatUUID=${rhatUUID})`,
                attributes: ['uid', 'cn', 'rhatUUID', 'rhatPrimaryMail', 'mail'],
                sizeLimit: 1,
            });

            if (searchEntries.length === 0) {
                return null;
            }

            const entry = searchEntries[0];
            return {
                uid: entry.uid as string,
                cn: entry.cn as string,
                rhatUUID: entry.rhatUUID as string,
                email: (entry.rhatPrimaryMail ?? entry.mail ?? '') as string,
            };
        } finally {
            try {
                await client.unbind();
            } catch {
                // ignore unbind errors
            }
        }
    }
}