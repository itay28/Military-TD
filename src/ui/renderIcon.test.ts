// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderFor, type RenderedSprite, type SingleImageRender } from '../data/renders';
import { renderIcon, renderIconLayers } from './renderIcon';

describe('renderIcon', () => {
  it("is a turret render's hull then turret, on its canvas", () => {
    const tank = renderFor('tank', 'russia') as RenderedSprite;
    expect(renderIcon(tank)).toEqual({ layerUrls: [tank.hullUrl, tank.turretUrl], canvasPx: tank.canvasPx });
  });

  it("is a single-image render's one image", () => {
    const jeep = renderFor('jeep', 'russia') as SingleImageRender;
    expect(renderIcon(jeep)).toEqual({ layerUrls: [jeep.imageUrl], canvasPx: jeep.canvasPx });
  });
});

describe('renderIconLayers', () => {
  it('stacks one layer per image, the canvas scaled to the box', () => {
    const layers = renderIconLayers(document, { layerUrls: ['hull.png', 'turret.png'], canvasPx: 160 }, 40);
    expect(layers).toHaveLength(2);
    expect(layers[0]!.style.backgroundImage).toContain('hull.png');
    expect(layers[1]!.style.backgroundImage).toContain('turret.png');
    for (const layer of layers) {
      expect(layer.className).toBe('build-icon-layer');
      expect(layer.style.transform).toContain('scale(0.25)');
    }
  });
});
