import { ANNOTATION_LOCATION, ANNOTATION_ORIGIN_LOCATION, Entity } from "@backstage/catalog-model";
import { PyxisProductListing, PyxisTeam, UniqueUser } from "./types";

export function sanitizeName(input: string): string {
    return input
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 63) || 'unnamed';
}

export function sanitizeTag(tag: string): string {
    return tag
      .toLowerCase()
      .replace(/[^a-z0-9:+#]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 63);
}

export function toComponentEntity(
    pl: PyxisProductListing,
    teamNameById: Map<string, string>,
): Entity {
    const name = sanitizeName(pl.name || pl._id);
    const location = `pyxis:product-listing/${pl._id}`;

    let ownerRef = 'unknown';
    if (pl.team_id) {
      const teamName = teamNameById.get(pl.team_id);
      if (teamName) {
        ownerRef = `group:default/${sanitizeName(teamName)}`;
      }
    }

    const tags: string[] = [pl.category, pl.type]
      .filter((t): t is string => Boolean(t))
      .map(t => sanitizeTag(t));

    if (pl.functional_categories) {
      tags.push(
        ...pl.functional_categories
          .filter(Boolean)
          .map(t => sanitizeTag(t)),
      );
    }

    return {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
            name,
            title: pl.name || undefined,
            description:
                pl.descriptions?.short ||
                pl.descriptions?.long ||
                `Product listing: ${pl.name || pl._id}`,
            annotations: {
                [ANNOTATION_LOCATION]: location,
                [ANNOTATION_ORIGIN_LOCATION]: location,
                'redhat.com/pyxis-id': pl._id,
                'redhat.com/pyxis-type': 'product-listing',
            },
            tags: tags.length > 0 ? tags : undefined,
            links: [
                {
                    url: `https://pyxis.engineering.redhat.com/v1/product-listings/id/${pl._id}`,
                    title: 'Pyxis REST API',
                    type: 'api',
                },
            ],
        },
        spec: {
            type: 'product-listing',
            lifecycle: pl.published ? 'production' : 'experimental',
            owner: ownerRef,
        },
    };
}

  export function toGroupEntity(team: PyxisTeam): Entity {
    const name = sanitizeName(team.name);
    const location = `pyxis:team/${team._id}`;

    return {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Group',
        metadata: {
            name,
            title: team.name,
            annotations: {
                [ANNOTATION_LOCATION]: location,
                [ANNOTATION_ORIGIN_LOCATION]: location,
                'redhat.com/pyxis-id': team._id,
                'redhat.com/pyxis-type': 'container-team',
            },
        },
        spec: {
            type: 'team',
            profile: {
                displayName: team.name,
            },
            children: [],
            members: (team.members || []).map(m => sanitizeName(m.user_id)),
        },
    };
}

  export function toUserEntity(user: UniqueUser): Entity {
    const name = sanitizeName(user.user_id);
    const location = `pyxis:user/${user.user_id}`;

    return {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'User',
        metadata: {
            name,
            annotations: {
                [ANNOTATION_LOCATION]: location,
                [ANNOTATION_ORIGIN_LOCATION]: location,
                'redhat.com/rhat-uuid': user.user_id,
                'redhat.com/pyxis-type': 'team-member',
            },
        },
        spec: {
            profile: {
                displayName: user.user_id,
            },
            memberOf: user.teamNames.map(tn => sanitizeName(tn)),
        },
    };
}

export function collectUniqueUsers(
    teams: PyxisTeam[],
): Map<string, UniqueUser> {
    const userMap = new Map<string, UniqueUser>();

    for (const team of teams) {
        for (const member of team.members || []) {
            const existing = userMap.get(member.user_id);
            if (existing) {
                if (!existing.teamNames.includes(team.name)) {
                    existing.teamNames.push(team.name);
                }
            } else {
                userMap.set(member.user_id, {
                    user_id: member.user_id,
                    role: member.role,
                    teamNames: [team.name],
                });
            }
        }
    }

    return userMap;
}