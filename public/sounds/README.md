# Exam alert sound

`donkey-bray.mp3` is “Donkey, braying #2” (sound 1550) by Joseph SARDIN, from BigSoundBank / LaSonothèque.

Source: https://bigsoundbank.com/donkey-braying-2-s1550.html
Download: https://bigsoundbank.com/UPLOAD/mp3/1550.mp3
License: CC0 (public domain), verified on the source page on October 9, 2026.
The source permits use, editing and redistribution, including in apps, without attribution.
This file is bundled locally; exam monitoring does not fetch audio from a third-party service.

## Previous alert

`uh-oh.wav` is “Cartoon - Uh-Oh!” by Breviceps, from Freesound, normalized to 98% peak amplitude. Both alert players use full playback gain.

Source: https://freesound.org/people/Breviceps/sounds/445964/
Public preview: https://cdn.freesound.org/previews/445/445964_9159316-hq.mp3
License: CC0 (public domain), verified on the source page on October 9, 2026.
The recording is bundled locally; there are no third-party audio requests during an exam.
The original donkey MP3 above remains for compatibility with previously deployed pages.

## Previous natural alternate alert

`oh-no-natural.wav` is the recorded human voice “OH NO.” by Legnalegna55, from Freesound. It preserves the original voice, pitch, speed and duration; only volume is normalized to 98% peak amplitude.

Source: https://freesound.org/people/Legnalegna55/sounds/539278/
Public preview: https://cdn.freesound.org/previews/539/539278_10485775-hq.mp3
License: CC0 (public domain), verified on October 9, 2026.

It is bundled locally alongside `uh-oh.wav`; each proctor alert chooses either clip with equal probability. No remote audio requests occur during exams. Student devices do not play either clip. The old processed `oh-no.wav` remains for compatibility with previously deployed pages, but current players use the new filename to avoid cached playback of the old voice.

## Previous Arabic voice alerts

`egyptian-uh-oh.wav`, `egyptian-oh-no.wav` and `egyptian-alalalala.wav` are synthesized using Microsoft’s `ar-EG-ShakirNeural` voice, listed as male, Arabic (Egypt). They say “Uh-oh!”, “Oh, no!” and “alalalalalal” respectively. The last phrase is spelled phonetically as `أَلَلَلَلَلَلَل` for the Arabic voice.

Voice reference: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts
Generated once using edge-tts with default pitch and rate; converted to PCM WAV and normalized to 98% peak amplitude. No pitch shifting, slowed playback or looped syllables. Each proctor alert independently chooses one of the three clips with equal probability at full volume. The audio is bundled locally, with no speech API or other audio requests during exams. Student devices remain silent.

Older filenames above remain for compatibility with previously deployed pages; the current player uses only the three Egyptian voice assets.

## Current English alerts with Egyptian male voices

The five `egyptian-english-*.wav` clips are synthesized using VoiceTut-TTS, a model fine-tuned on Egyptian speech that supports English and Arabic/English code-switching. Use its supplied male speaker presets in **English mode**, at normal pitch and speed; this replaces the Arabic-locale Microsoft voice used in the previous set.

| File | Spoken phrase | Supplied speaker |
| --- | --- | --- |
| `egyptian-english-uh-oh.wav` | Uh-oh! | Kamal |
| `egyptian-english-oh-no.wav` | Oh, no! | Mohamed |
| `egyptian-english-alalalala.wav` | Ah la la la la la la! | Hossam |
| `egyptian-english-come-back.wav` | Come back! | Mohamed |
| `egyptian-english-where-going.wav` | Where are you going? | Omar |

Model/source: https://huggingface.co/mohammedaly22/VoiceTut-TTS
Code: https://github.com/MohammedAly22/VoiceTuT-TTS
Model license: Apache-2.0.
Generation: language=en, num_step=32, guidance_scale=2.5, speed=1. Only normalize volume to 98% peak amplitude; no pitch shifting, looped syllables or slowed playback. The supplied built-in voices are used without uploading or cloning a user’s recording.

## Borat quote

`borat-very-nice.wav` is the user-requested original short “Very nice!” Borat quote, obtained from the publicly available download at https://www.myinstants.com/en/instant/borat-very-nice-10406/ (https://www.myinstants.com/media/sounds/borat-very-nice.mp3). Original pitch and speed, volume normalized only. This is an original film quote, not a generated imitation or CC0 asset; the source does not state an explicit redistribution license.

Current playback chooses independently among these six clips with equal probability. All files are bundled locally: no speech service runs during exams, and student devices remain silent. Older sound filenames remain for compatibility with previously deployed pages.
