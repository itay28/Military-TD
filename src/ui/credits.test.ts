// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import manifest from '../../assets/manifest.json';
import pkg from '../../package.json';
import { creditEntries, gameCredits, mountCredits } from './credits';

let app: HTMLElement;
let root: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div><div id="menu" hidden></div>';
  app = document.getElementById('app')!;
  root = document.getElementById('menu')!;
});

describe('creditEntries', () => {
  it('has one entry per pack in the manifest, in manifest order, with its name, author, license, link and attribution', () => {
    expect(creditEntries(manifest)).toEqual(
      manifest.packs.map((p) => ({
        name: p.name,
        author: p.author,
        license: p.license,
        link: p.source,
        attribution: p.attribution,
      })),
    );
  });
});

describe('gameCredits', () => {
  it('names the engine and the code license from package.json', () => {
    const credits = gameCredits(pkg);
    expect(credits.engine).toMatch(/Phaser/);
    expect(credits.codeLicense).toBe(pkg.license);
  });
});

describe('Credits screen', () => {
  it('lists every pack of the manifest with its author, license and a link that opens in a new tab', () => {
    mountCredits(root, { app, onBack: () => {} });
    const sections = [...root.querySelectorAll('section.credit')];
    expect(sections).toHaveLength(manifest.packs.length);
    manifest.packs.forEach((pack, i) => {
      const section = sections[i]!;
      expect(section.querySelector('h2')?.textContent).toBe(pack.name);
      expect(section.textContent).toContain(pack.author);
      expect(section.textContent).toContain(pack.license);
      const link = section.querySelector('a')!;
      expect(link.getAttribute('href')).toBe(pack.source);
      expect(link.target).toBe('_blank');
      expect(link.rel).toBe('noopener noreferrer');
    });
  });

  it('shows each recorded attribution text verbatim', () => {
    mountCredits(root, { app, onBack: () => {} });
    const lines = [...root.querySelectorAll('.credit-attribution')].map((e) => e.textContent);
    expect(lines).toEqual(manifest.packs.map((p) => p.attribution));
  });

  it("shows the game's own credits: the engine and the code license", () => {
    mountCredits(root, { app, onBack: () => {} });
    const game = root.querySelector('section.game-credits')!;
    expect(game.textContent).toContain('Phaser');
    expect(game.textContent).toContain(pkg.license);
  });

  it('marks the app as on a menu screen, shows the root, and focuses Back', () => {
    mountCredits(root, { app, onBack: () => {} });
    expect(root.hidden).toBe(false);
    expect(app.dataset.screen).toBe('menu');
    expect(root.querySelector('h1')?.textContent).toBe('Credits');
    expect(document.activeElement).toBe(root.querySelector('button'));
  });

  it('calls onBack when the player presses Back', () => {
    const onBack = vi.fn();
    mountCredits(root, { app, onBack });
    const back = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Back');
    back?.click();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('after destroy, is empty and hidden, and an old Back button does nothing', () => {
    const onBack = vi.fn();
    const credits = mountCredits(root, { app, onBack });
    const back = root.querySelector('button')!;
    credits.destroy();
    back.click();
    expect(onBack).not.toHaveBeenCalled();
    expect(root.hidden).toBe(true);
    expect(root.childElementCount).toBe(0);
    expect(app.dataset.screen).toBeUndefined();
  });
});
