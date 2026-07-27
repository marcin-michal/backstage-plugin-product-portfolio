import * as https from 'https';
import {
    PyxisContainerRepository,
    PyxisFindResponse,
    PyxisGetResponse,
    PyxisProductListing,
    PyxisProviderConfig,
    PyxisTeam,
} from './types';
import { LoggerService } from '@backstage/backend-plugin-api';
import { readFileSync } from 'fs';
import { isPyxisObjectId } from './entityHelpers';

export class PyxisClient {
    private readonly agent: https.Agent;

    constructor(
        private readonly config: PyxisProviderConfig,
        private readonly logger: LoggerService,
    ) {
        const agentOptions: https.AgentOptions = {
            cert: readFileSync(config.certPath),
            key: readFileSync(config.keyPath),
            rejectUnauthorized: true,
        };

        if (config.caPath) {
            agentOptions.ca = readFileSync(config.caPath);
        }

        this.agent = new https.Agent(agentOptions);
    }

    private async graphqlRequest<T>(
        query: string,
        variables?: Record<string, unknown>,
    ): Promise<T> {
        const body = JSON.stringify({ query, variables });

        return new Promise<T>((resolve, reject) => {
            const url = new URL(this.config.graphqlUrl);

            const req = https.request(
                {
                    hostname: url.hostname,
                    port: url.port || 443,
                    path: url.pathname,
                    method: 'POST',
                    agent: this.agent,
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(body),
                    },
                },
                res => {
                    let data = '';
                    res.on('data', chunk => {
                        data += chunk;
                    });
                    res.on('end', () => {
                        if (res.statusCode !== 200) {
                            reject(
                                new Error(
                                    `Pyxis GraphQL returned HTTP ${
                                        res.statusCode
                                    }: ${data.substring(0, 200)}`,
                                ),
                            );
                            return;
                        }

                        try {
                            const parsed = JSON.parse(data);

                            if (parsed.errors && parsed.errors.length > 0) {
                                reject(
                                    new Error(
                                        `Pyxis GraphQL errors: ${JSON.stringify(
                                            parsed.errors,
                                        )}`,
                                    ),
                                );
                                return;
                            }

                            resolve(parsed.data as T);
                        } catch (e) {
                            reject(
                                new Error(
                                    `Failed to parse Pyxis response: ${e}`,
                                ),
                            );
                        }
                    });
                },
            );

            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }

    async fetchAllProductListings(): Promise<PyxisProductListing[]> {
        const pageSize = 100;
        const allListings: PyxisProductListing[] = [];

        // include total in the first page to know how many pages
        const firstPageQuery = `
            query FetchProductListingsFirstPage($pageSize: Int!) {
                find_product_listings(
                    page: 0,
                    page_size: $pageSize,
                    filter: {
                        and: [
                            { vendor_label: { eq: "redhat" } }
                            { deleted: { ne: true} }
                        ]
                    }
                ) {
                    error { status detail }
                    total
                    page
                    page_size
                    data {
                        _id
                        name
                        vendor_label
                        category
                        type
                        published
                        team_id
                        functional_categories
                        descriptions { short long }
                        creation_date
                        last_update_date
                        repositories
                    }
                }
            }
        `;

        const firstResult = await this.graphqlRequest<{
            find_product_listings: PyxisFindResponse<PyxisProductListing>;
        }>(firstPageQuery, { pageSize });

        const firstPage = firstResult.find_product_listings;
        if (firstPage.error) {
            throw new Error(`Pyxis error: ${firstPage.error.detail}`);
        }

        allListings.push(...firstPage.data);
        const total = firstPage.total ?? firstPage.data.length;
        const totalPages = Math.ceil(total / pageSize);

        this.logger.info(
            `Pyxis: found ${total} product listings, fetching ${totalPages} pages`,
        );

        const subsequentQuery = `
            query FetchProductListings($page: Int!, $pageSize: Int!) {
                find_product_listings(
                    page: $page,
                    page_size: $pageSize,
                    filter: {
                        and: [
                            { vendor_label: { eq: "redhat" } }
                            { deleted: { ne: true } }
                        ]
                    }
                ) {
                    error { status detail }
                    page
                    page_size
                    data {
                        _id
                        name
                        vendor_label
                        category
                        type
                        published
                        team_id
                        functional_categories
                        descriptions { short long }
                        creation_date
                        last_update_date
                        repositories
                    }
                }
            }
        `;

        for (let page = 1; page < totalPages; page++) {
            const result = await this.graphqlRequest<{
                find_product_listings: PyxisFindResponse<PyxisProductListing>;
            }>(subsequentQuery, { page, pageSize });

            if (result.find_product_listings.error) {
                this.logger.warn(
                    `Pyxis error on page ${page}: ${result.find_product_listings.error.detail}`,
                );
                continue;
            }

            allListings.push(...result.find_product_listings.data);
        }

        return allListings;
    }

    async fetchTeamById(teamId: string): Promise<PyxisTeam | null> {
        if (!isPyxisObjectId(teamId)) {
            this.logger.warn(
                `Skipping team fetch for non-ObjectID team_id: "${teamId}"`,
            );
            return null;
        }

        const query = `
            query FetchTeam($teamId: ObjectIDFilterScalar!) {
                get_team(id: $teamId) {
                    error { status detail }
                    data {
                        _id
                        name
                        vendor_label
                        jira_group_key
                        members {
                            user_id
                            role
                        }
                        creation_date
                        last_update_date
                    }
                }
            }
        `;

        try {
            const result = await this.graphqlRequest<{
                get_team: PyxisGetResponse<PyxisTeam>;
            }>(query, { teamId });

            if (result.get_team.error) {
                this.logger.warn(
                    `Failed to fetch team ${teamId}: ${result.get_team.error.detail}`,
                );
                return null;
            }

            return result.get_team.data;
        } catch (err) {
            this.logger.warn(`Failed to fetch team ${teamId}: ${err}`);
            return null;
        }
    }

    async fetchTeams(teamIds: string[]): Promise<PyxisTeam[]> {
        const teams: PyxisTeam[] = [];
        const batchSize = 20;

        const validIds = teamIds.filter(isPyxisObjectId);
        const skipped = teamIds.length - validIds.length;
        if (skipped > 0) {
            this.logger.warn(
                `Skipping ${skipped} team_id value(s) that are not ObjectIDs: ${teamIds
                    .filter(id => !isPyxisObjectId(id))
                    .join(', ')}`,
            );
        }

        for (let i = 0; i < validIds.length; i += batchSize) {
            const batch = validIds.slice(i, i + batchSize);

            const fragments = batch
                .map(
                    (id, idx) => `
                        team_${idx}: get_team(id: "${id}") {
                        error { status detail }
                        data {
                            _id
                            name
                            vendor_label
                            jira_group_key
                            members { user_id role }
                            creation_date
                            last_update_date
                        }
                        }
                    `,
                )
                .join('\n');

            const query = `{ ${fragments} }`;

            try {
                const result = await this.graphqlRequest<
                    Record<string, PyxisGetResponse<PyxisTeam>>
                >(query);

                for (const key of Object.keys(result)) {
                    const teamResult = result[key];
                    if (!teamResult.error && teamResult.data) {
                        teams.push(teamResult.data);
                    } else if (teamResult.error) {
                        this.logger.warn(
                            `Failed to fetch team: ${teamResult.error.detail}`,
                        );
                    }
                }
            } catch (err) {
                this.logger.error(`Batch team fetch failed: ${err}`);
                // Fall back to individual fetches for this batch
                for (const id of batch) {
                    const team = await this.fetchTeamById(id);
                    if (team) teams.push(team);
                }
            }
        }

        return teams;
    }

    async fetchRepositoriesByProductListing(
        productListingId: string,
    ): Promise<PyxisContainerRepository[]> {
        const pageSize = 100;
        const allRepositories: PyxisContainerRepository[] = [];

        const repoFields = `
            _id
            application_categories
            build_categories
            display_data {
                name
                long_description
                short_description
            }
            published
            registry
            release_categories
            repository
            architectures
            creation_date
            last_update_date
            team_id
            product_listings
        `;

        const firstPageQuery = `
            query FetchRepositoriesByProductListing(
                $productListingId: ObjectIDFilterScalar!,
                $pageSize: Int!
            ) {
                find_product_listing_repositories(
                    id: $productListingId,
                    page: 0,
                    page_size: $pageSize,
                ) {
                    error { status detail }
                    total
                    page_size
                    data { ${repoFields} }
                }
            }
        `;

        const firstResult = await this.graphqlRequest<{
            find_product_listing_repositories: PyxisFindResponse<PyxisContainerRepository>;
        }>(firstPageQuery, { productListingId, pageSize });

        const firstPage = firstResult.find_product_listing_repositories;
        if (firstPage.error) {
            throw new Error(`Pyxis error: ${firstPage.error.detail}`);
        }

        allRepositories.push(...firstPage.data);
        const total = firstPage.total ?? firstPage.data.length;
        const totalPages = Math.ceil(total / pageSize);

        if (totalPages > 1) {
            this.logger.info(
                `Pyxis: found ${total} repositories for product listing \`${productListingId}\`, fetching ${totalPages} pages`,
            );
        }

        const subsequentQuery = `
            query FetchRepositoriesByProductListingPage(
                $productListingId: ObjectIDFilterScalar!,
                $page: Int!,
                $pageSize: Int!
            ) {
                find_product_listing_repositories(
                    id: $productListingId,
                    page: $page,
                    page_size: $pageSize,
                ) {
                    error { status detail }
                    page_size
                    data { ${repoFields} }
                }
            }
        `;

        for (let page = 1; page < totalPages; page++) {
            const result = await this.graphqlRequest<{
                find_product_listing_repositories: PyxisFindResponse<PyxisContainerRepository>;
            }>(subsequentQuery, { productListingId, page, pageSize });

            if (result.find_product_listing_repositories.error) {
                this.logger.warn(
                    `Pyxis error on page ${page}: ${result.find_product_listing_repositories.error.detail}`,
                );
                continue;
            }

            allRepositories.push(
                ...result.find_product_listing_repositories.data,
            );
        }

        return allRepositories;
    }
}
