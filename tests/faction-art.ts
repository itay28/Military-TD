/** A model of `scripts/render-sprite.json`, as far as the art tests need. */
export interface ArtModel {
  readonly id: string;
  readonly kind: string;
  readonly faction: string;
}

/**
 * The ids of models that lack a piece of art (turntable, jet sprite, pivot…) in a faction that already has some of it.
 * "Done" is worked out from the data, not a hand-kept list: a faction that has one must have all of them (#551).
 * Art that lands in parts (a faction's towers first, its units later) passes `groupOf`: "done" is then per
 * faction and group.
 */
export function missingModels(
  models: readonly ArtModel[],
  hasArt: (model: ArtModel) => boolean,
  groupOf: (model: ArtModel) => string = () => '',
): string[] {
  const key = (m: ArtModel): string => `${m.faction}/${groupOf(m)}`;
  const done = new Set(models.filter(hasArt).map(key));
  return models.filter((m) => done.has(key(m)) && !hasArt(m)).map((m) => m.id);
}
