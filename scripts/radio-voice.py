"""Generate the raw voice takes for the radio comms cues (#396) with Chatterbox (ResembleAI, MIT).

The takes are committed in assets/radio-voice/takes/, and `npm run radio-fx` builds the finished cues from them
(band-pass, squelch, static, gunfire). Run this script only to change a line or retune a take, then listen to it
and commit it. ADR-0003: a take is checked by its Whisper transcript (`--check`), never by ear alone.

    python3 -m venv .venv-voice && .venv-voice/bin/pip install chatterbox-tts "setuptools<81" faster-whisper
    .venv-voice/bin/python scripts/radio-voice.py            # all takes
    .venv-voice/bin/python scripts/radio-voice.py victory    # one take
    .venv-voice/bin/python scripts/radio-voice.py --check    # transcribe the committed takes

The models download from Hugging Face on first run (about 3 GB, CPU is fine: about 30 s per take).

How a take gets its delivery: Chatterbox copies the delivery of a short sample clip. A calm sample gives a calm
line, whatever the text says, so each take names a sample that has the mood it needs:
  samples/shout.flac  shouted soldier lines (Kenney Voiceover Pack, CC0: get_down, cover_me, medic,
                      fire_in_the_hole, suppressing_fire, call_for_backup, look_out, loudness-normalised)
  samples/win.flac    upbeat announcer lines (same pack: you_win, congratulations, level_up, new_highscore,
                      objective_achieved)
`exaggeration` is Chatterbox's emotion setting and `cfg` its pacing weight. A take is generated from its seed, then
cut: `keep` lists the (start, end) spans in seconds to keep, joined with short fades (the maintainer cut "Good work"
from victory and the repeated "Fall back" from defeat, 2026-11-04). The output is the same on the same machine,
torch version and model revision. Elsewhere it can differ a little, so after a re-run, check the transcript and listen.
Chatterbox adds its inaudible Perth watermark to every take.
"""

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, 'assets', 'radio-voice')

TAKES = {
    'waveStart': dict(text='Contact front! Enemy inbound. Over.', sample='shout', exaggeration=1.1, cfg=0.3, seed=2007),
    'waveReinforcements': dict(
        text='Be advised, enemy reinforcements inbound. Over.', sample='shout', exaggeration=0.9, cfg=0.35, seed=2007
    ),
    'victory': dict(
        text='Area secure! Good work. Out.',
        sample='win',
        exaggeration=0.8,
        cfg=0.4,
        seed=502,
        keep=[(0.0, 1.22), (2.04, None)],
        says='Area secure! Out.',
    ),
    'defeat': dict(
        text="They're breaking through! Fall back! Fall back, now!",
        sample='shout',
        exaggeration=1.3,
        cfg=0.3,
        seed=7,
        keep=[(0.0, 1.62)],
        says="They're breaking through! Fall back!",
    ),
}
FADE = 0.03  # s, at each cut


def cut(wav, sr, keep):
    import torch

    parts = []
    for start, end in keep:
        part = wav[:, int(start * sr) : None if end is None else int(end * sr)].clone()
        n = min(int(FADE * sr), part.shape[1] // 2)
        ramp = torch.linspace(0, 1, n)
        if start > 0:
            part[:, :n] *= ramp
        if end is not None:
            part[:, -n:] *= ramp.flip(0)
        parts.append(part)
    return torch.cat(parts, dim=1)


def generate(names):
    import torch
    import torchaudio
    from chatterbox.tts import ChatterboxTTS

    torch.set_num_threads(os.cpu_count() or 4)
    tts = ChatterboxTTS.from_pretrained(device='cpu')
    os.makedirs(os.path.join(DIR, 'takes'), exist_ok=True)
    for name in names:
        t = TAKES[name]
        torch.manual_seed(t['seed'])
        wav = tts.generate(
            t['text'],
            audio_prompt_path=os.path.join(DIR, 'samples', f"{t['sample']}.flac"),
            exaggeration=t['exaggeration'],
            cfg_weight=t['cfg'],
        )
        if 'keep' in t:
            wav = cut(wav, tts.sr, t['keep'])
        out = os.path.join(DIR, 'takes', f'{name}.flac')
        torchaudio.save(out, wav, tts.sr, format='flac')
        print(f'{out}: {wav.shape[1] / tts.sr:.2f} s')


def check():
    """Transcribes each committed take; exits 1 if a transcript doesn't match its line (words only)."""
    import re

    import numpy as np
    import soundfile as sf
    from faster_whisper import WhisperModel

    model = WhisperModel('small.en', device='cpu', compute_type='int8')
    words = lambda s: re.sub(r"[^a-z' ]", ' ', s.lower()).split()
    bad = 0
    for name, t in TAKES.items():
        audio, sr = sf.read(os.path.join(DIR, 'takes', f'{name}.flac'), dtype='float32')
        audio = np.interp(np.arange(0, len(audio), sr / 16000), np.arange(len(audio)), audio).astype(np.float32)
        segments, _ = model.transcribe(audio, language='en', beam_size=5, condition_on_previous_text=False)
        heard = ' '.join(s.text.strip() for s in segments)
        ok = words(heard) == words(t.get('says', t['text']))
        bad += not ok
        print(f"{'ok ' if ok else 'BAD'} {name}: {heard}")
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    args = sys.argv[1:]
    if args == ['--check']:
        check()
    else:
        unknown = [a for a in args if a not in TAKES]
        if unknown:
            sys.exit(f'Unknown take(s): {", ".join(unknown)}. Takes: {", ".join(TAKES)}')
        generate(args or list(TAKES))
