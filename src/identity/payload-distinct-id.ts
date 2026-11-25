/** Creates a collision-resistant distinct ID for a Payload authenticated user. */
export function payloadDistinctId(collectionSlug: string, userId: string | number): string {
  return `${collectionSlug}:${userId}`
}
