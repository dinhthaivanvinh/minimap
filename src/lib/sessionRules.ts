// Only a missing account or a rejected token should discard a saved login; outages can be retried.
export function shouldDropSession(known: boolean | null, status?: number): boolean {
  return known === false || status === 401;
}
