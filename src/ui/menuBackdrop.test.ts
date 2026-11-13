// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountMenuBackdrop, type BackdropSources, type MenuBackdropOptions } from './menuBackdrop';

const SOURCES: BackdropSources = {
  webm: 'clip.webm',
  mp4: 'clip.mp4',
  webmSmall: 'clip-small.webm',
  mp4Small: 'clip-small.mp4',
  still: 'clip-still.webp',
};

let root: HTMLElement;
let volume: number;
let reducedMotion: boolean;
const html = document.documentElement;

beforeEach(() => {
  document.body.innerHTML = '<div id="menu-backdrop" hidden></div>';
  root = document.getElementById('menu-backdrop')!;
  delete html.dataset.backdrop;
  volume = 0.5;
  reducedMotion = false;
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { value: false, configurable: true });
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { value: true, configurable: true });
  });
});

const mount = (options: Partial<MenuBackdropOptions> = {}) =>
  mountMenuBackdrop(root, {
    sources: SOURCES,
    small: false,
    reducedMotion: () => reducedMotion,
    volume: () => volume,
    ...options,
  });
const video = () => root.querySelector('video')!;
const still = () => root.querySelector('img')!;

describe('mountMenuBackdrop', () => {
  it('holds a muted, looping, inline video of the clip, WebM first then MP4, hidden until shown', () => {
    mount();
    expect(root.hidden).toBe(true);
    expect(video().muted).toBe(true);
    expect(video().loop).toBe(true);
    expect(video().hasAttribute('playsinline')).toBe(true);
    expect([...video().querySelectorAll('source')].map((s) => [s.getAttribute('src'), s.type])).toEqual([
      ['clip.webm', 'video/webm'],
      ['clip.mp4', 'video/mp4'],
    ]);
    expect(root.getAttribute('aria-hidden')).toBe('true');
  });

  it('uses the small encodes on a phone', () => {
    mount({ small: true });
    expect([...video().querySelectorAll('source')].map((s) => s.getAttribute('src'))).toEqual([
      'clip-small.webm',
      'clip-small.mp4',
    ]);
  });

  it('show() plays it and marks the page, so the menu turns into a see-through scrim; hide() pauses and unmarks', () => {
    const backdrop = mount();
    backdrop.show();
    expect(root.hidden).toBe(false);
    expect(html.dataset.backdrop).toBe('video');
    expect(video().paused).toBe(false);
    expect(still().hidden).toBe(true);
    backdrop.hide();
    expect(root.hidden).toBe(true);
    expect(html.dataset.backdrop).toBeUndefined();
    expect(video().paused).toBe(true);
  });

  it('stays muted until audio is unlocked, then plays at the sound effects volume', () => {
    const backdrop = mount();
    backdrop.show();
    expect(video().muted).toBe(true);
    backdrop.unlock();
    expect(video().muted).toBe(false);
    expect(video().volume).toBe(0.5);
    volume = 0.2;
    backdrop.refreshVolume();
    expect(video().volume).toBe(0.2);
  });

  it('a volume of 0 (mute, or a hidden tab) mutes it', () => {
    const backdrop = mount();
    backdrop.unlock();
    volume = 0;
    backdrop.refreshVolume();
    expect(video().muted).toBe(true);
  });

  it('with reduced motion shows the still, and plays the video hidden only for its sound, once unlocked', () => {
    reducedMotion = true;
    const backdrop = mount();
    backdrop.show();
    expect(html.dataset.backdrop).toBe('still');
    expect(still().hidden).toBe(false);
    expect(still().getAttribute('src')).toBe('clip-still.webp');
    expect(video().style.visibility).toBe('hidden');
    expect(video().paused).not.toBe(false);
    backdrop.unlock();
    expect(video().paused).toBe(false);
    expect(video().muted).toBe(false);
  });

  it('falls back to the plain background when the video fails to load', () => {
    const backdrop = mount();
    backdrop.show();
    const sources = video().querySelectorAll('source');
    sources[sources.length - 1]!.dispatchEvent(new Event('error'));
    expect(html.dataset.backdrop).toBeUndefined();
    expect(root.hidden).toBe(true);
    backdrop.show();
    expect(root.hidden).toBe(true);
  });
});
