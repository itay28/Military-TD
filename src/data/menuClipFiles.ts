import webm from '../../assets/menu-clip/menu-clip.webm?url';
import mp4 from '../../assets/menu-clip/menu-clip.mp4?url';
import webmSmall from '../../assets/menu-clip/menu-clip-small.webm?url';
import mp4Small from '../../assets/menu-clip/menu-clip-small.mp4?url';
import still from '../../assets/menu-clip/menu-clip-still.webp?url';
import type { BackdropSources } from '../ui/menuBackdrop';

/** The menu clip's video and still (assets/manifest.json: menu-clip, recorded by `npm run menu:clip`, #568). */
export const MENU_CLIP_FILES: BackdropSources = { webm, mp4, webmSmall, mp4Small, still };
