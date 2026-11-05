// Synthetic evidence for tests only. Never loaded by production scanners.
import { listingEvidenceKey } from './scoring.mjs';
export const photoFixture = ['https://images1.vinted.net/test/garment.webp','https://images1.vinted.net/test/labels.webp'];
export function fixtureReviews(item, now) {
  const id = /\/items\/(\d+)/.exec(item.url)[1];
  return { [id]: { brand: item.brand, verdict: 'supported', reviewedBy: 'Synthetic test reviewer', reviewedAt: new Date(now).toISOString(),
    evidenceKey: listingEvidenceKey(item), reference: 'Synthetic model reference; no real authentication',
    evidence: [{view:'garment',url:photoFixture[0]},{view:'brand_label',url:photoFixture[1]},{view:'care_label',url:photoFixture[1]}] } };
}
