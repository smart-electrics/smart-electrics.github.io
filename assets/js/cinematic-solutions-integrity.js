// An opaque integrity value for the data-owned #29 mapping. It intentionally
// carries no routes, relations, or direction topology of its own.
export const CANONICAL_CINEMATIC_SOLUTIONS_FINGERPRINT = "6c46d53a";

const isId = (value) => typeof value === "string" && value.trim().length > 0;

/**
 * FNV-1a over a canonical ASCII serialization. Both the browser and Ruby
 * validator use the same small fingerprint instead of a second mapping table.
 */
export function cinematicSolutionsFingerprint(mapping, orderedSolutionIds) {
  if (
    mapping === null ||
    typeof mapping !== "object" ||
    Array.isArray(mapping) ||
    !Array.isArray(orderedSolutionIds) ||
    orderedSolutionIds.length === 0 ||
    !orderedSolutionIds.every(isId) ||
    new Set(orderedSolutionIds).size !== orderedSolutionIds.length ||
    Object.keys(mapping).length !== orderedSolutionIds.length ||
    !orderedSolutionIds.every((solutionId, index) => Object.keys(mapping)[index] === solutionId)
  ) return null;

  const serialized = [];
  for (const solutionId of orderedSolutionIds) {
    const entry = mapping[solutionId];
    if (
      entry === null ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      !Array.isArray(entry.direction_ids) ||
      !entry.direction_ids.every(isId) ||
      !isId(entry.relation_id)
    ) return null;
    serialized.push(`${solutionId}:${entry.direction_ids.join(",")}:${entry.relation_id}`);
  }

  let hash = 0x811c9dc5;
  for (const character of serialized.join("|")) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
