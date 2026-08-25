import assert from "node:assert/strict";
import test from "node:test";

import {
  CANONICAL_CINEMATIC_SOLUTIONS_FINGERPRINT,
  cinematicSolutionsFingerprint
} from "../../assets/js/cinematic-solutions-integrity.js";

const mapping = {
  apartment: {
    direction_ids: ["electrical-design", "lighting", "smart-home-integration"],
    relation_id: "smart-home-integration--climate"
  },
  autonomy: {
    direction_ids: ["backup-power", "smart-home-integration"],
    relation_id: "backup-power--backup"
  }
};

test("fingerprints mapping key order, direction order, and relation IDs without owning topology", () => {
  const canonical = cinematicSolutionsFingerprint(mapping, ["apartment", "autonomy"]);
  assert.match(canonical, /^[a-f0-9]{8}$/u);
  assert.notEqual(cinematicSolutionsFingerprint(mapping, ["autonomy", "apartment"]), canonical);

  const relationSwap = structuredClone(mapping);
  relationSwap.autonomy.relation_id = "smart-home-integration--climate";
  assert.notEqual(cinematicSolutionsFingerprint(relationSwap, ["apartment", "autonomy"]), canonical);

  const orderSwap = structuredClone(mapping);
  orderSwap.apartment.direction_ids.reverse();
  assert.notEqual(cinematicSolutionsFingerprint(orderSwap, ["apartment", "autonomy"]), canonical);
  assert.match(CANONICAL_CINEMATIC_SOLUTIONS_FINGERPRINT, /^[a-f0-9]{8}$/u);
});
