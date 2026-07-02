export function shouldShowCollectionSetup({
  collectionStarted = false,
  loading = false,
  hasData = false,
  configuringCollection = false,
} = {}) {
  if (loading) return false;
  return Boolean(configuringCollection || (!collectionStarted && !hasData));
}
