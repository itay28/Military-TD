import { describe, expect, it } from 'vitest';
import { missingModels } from './faction-art';

const models = [
  { id: 'us-tank', kind: 'tank', faction: 'us' },
  { id: 'us-jet', kind: 'jet', faction: 'us' },
  { id: 'china-tank', kind: 'tank', faction: 'china' },
  { id: 'china-jet', kind: 'jet', faction: 'china' },
  { id: 'ru-tank', kind: 'tank', faction: 'russia' },
];

describe('missingModels', () => {
  it('is empty when every faction with art has all of it', () => {
    expect(missingModels(models, () => true)).toEqual([]);
  });

  it('skips a faction that has none of the art yet', () => {
    expect(missingModels(models, (m) => m.faction === 'us')).toEqual([]);
  });

  it('names the models a half-finished faction lacks', () => {
    expect(missingModels(models, (m) => m.id !== 'china-jet')).toEqual(['china-jet']);
  });

  it('checks each group on its own when the art lands in parts', () => {
    const group = (m: { kind: string }): string => (m.kind === 'jet' ? 'air' : 'ground');
    expect(missingModels(models, (m) => m.id === 'china-tank', group)).toEqual([]);
    expect(
      missingModels(
        models,
        (m) => m.id === 'china-tank',
        () => '',
      ),
    ).toEqual(['china-jet']);
  });
});
