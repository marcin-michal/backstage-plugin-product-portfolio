import { K8sResourceCommonWithClusterInfo } from '@internal/backstage-plugin-konflux-common';

/**
 * Safely parse a Kubernetes list response body.
 *
 * The API client may return either a raw JSON string (when the response content
 * type is unexpected) or an already-parsed object. Both forms are handled here.
 */
export function parseResponseBody(data: unknown):
    | {
          items: K8sResourceCommonWithClusterInfo[];
          metadata?: { continue?: string };
      }
    | undefined {
    if (typeof data === 'string') {
        try {
            return JSON.parse(data) as {
                items: K8sResourceCommonWithClusterInfo[];
                metadata?: { continue?: string };
            };
        } catch {
            return undefined;
        }
    }
    if (typeof data === 'object' && data !== null) {
        return data as {
            items: K8sResourceCommonWithClusterInfo[];
            metadata?: { continue?: string };
        };
    }
    return undefined;
}

/**
 * Remove the `managedFields` array from every resource's metadata.
 *
 * `managedFields` is large, internal Kubernetes bookkeeping data that the
 * frontend never needs. Stripping it here keeps response payloads small.
 */
export function stripManagedFields(
    items: K8sResourceCommonWithClusterInfo[],
): K8sResourceCommonWithClusterInfo[] {
    return items.map(item => {
        if (!item.metadata?.managedFields) {
            return item;
        }
        const { managedFields: _managedFields, ...metadata } = item.metadata;
        return { ...item, metadata };
    });
}
