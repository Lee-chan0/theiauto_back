export const tagFiltering = (tagArray) => {
  const seen = new Set();
  const result = [];

  for (const tag of tagArray) {
    const lowerTag = tag.trim().toLowerCase();

    if (!seen.has(lowerTag)) {
      seen.add(lowerTag);
      result.push(tag.trim());
    }
  }

  return result;
}