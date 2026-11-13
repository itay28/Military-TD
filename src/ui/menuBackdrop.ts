/** The menu clip's files (#568): 1280×720 and phone-sized encodes, and its first frame as a still. */
export interface BackdropSources {
  readonly webm: string;
  readonly mp4: string;
  readonly webmSmall: string;
  readonly mp4Small: string;
  readonly still: string;
}

export interface MenuBackdropOptions {
  readonly sources: BackdropSources;
  /** A phone: the small encodes. */
  readonly small: boolean;
  /** Read at each show(), so the setting's latest value counts. */
  readonly reducedMotion: () => boolean;
  /** The battle sound's volume, 0–1: the sound effects channel (0 when muted or the tab is hidden). */
  readonly volume: () => number;
}

export interface MenuBackdrop {
  /** Plays it behind the Main menu or the Level select; a playing one carries on. */
  show(): void;
  /** Pauses and hides it, when a game starts. */
  hide(): void;
  /** Audio is unlocked (the first input): its sound comes in, with the menu music. */
  unlock(): void;
  /** Follows a volume change. */
  refreshVolume(): void;
}

/**
 * The video behind the Main menu and the Level select (#568): the menu clip, a long battle that loops seamlessly, with
 * its own battle sound muffled under the menu music. It starts muted, as browsers require, and its sound comes in on
 * unlock. With reduced motion it shows the clip's first frame and plays the video hidden, for the sound alone. If the
 * video can't load, the menus keep their plain background. While it shows the page is marked `data-backdrop` (`video`
 * or `still`), which turns the menus' background into a see-through scrim.
 */
export function mountMenuBackdrop(root: HTMLElement, options: MenuBackdropOptions): MenuBackdrop {
  const { sources, small } = options;
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  const video = document.createElement('video');
  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.preload = 'auto';
  video.disablePictureInPicture = true;
  const files: readonly (readonly [string, string])[] = [
    [small ? sources.webmSmall : sources.webm, 'video/webm'],
    [small ? sources.mp4Small : sources.mp4, 'video/mp4'],
  ];
  for (const [src, type] of files) {
    const source = document.createElement('source');
    source.src = src;
    source.type = type;
    video.append(source);
  }
  const still = document.createElement('img');
  still.src = sources.still;
  still.alt = '';
  still.hidden = true;
  root.append(still, video);

  let shown = false;
  let unlocked = false;
  let failed = false;
  const html = document.documentElement;
  const play = () => {
    // A blocked or interrupted play() only means it waits for the next show() or unlock.
    video.play()?.catch(() => {});
  };
  const refresh = () => {
    if (!shown || failed) return;
    const stillOnly = options.reducedMotion();
    html.dataset.backdrop = stillOnly ? 'still' : 'video';
    still.hidden = !stillOnly;
    video.style.visibility = stillOnly ? 'hidden' : '';
    const v = Math.min(Math.max(options.volume(), 0), 1);
    video.volume = v;
    video.muted = !unlocked || v === 0;
    // With reduced motion the video plays only to be heard.
    const wanted = !stillOnly || !video.muted;
    if (wanted && video.paused) play();
    if (!wanted && !video.paused) video.pause();
  };
  const fail = () => {
    failed = true;
    root.hidden = true;
    video.pause();
    delete html.dataset.backdrop;
  };
  video.lastElementChild!.addEventListener('error', fail);
  video.addEventListener('error', fail);

  return {
    show() {
      if (failed) return;
      shown = true;
      root.hidden = false;
      refresh();
    },
    hide() {
      shown = false;
      root.hidden = true;
      video.pause();
      delete html.dataset.backdrop;
    },
    unlock() {
      unlocked = true;
      refresh();
    },
    refreshVolume: refresh,
  };
}
