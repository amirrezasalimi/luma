# Phonon TTS: Hugging Face remote usage + voice IDs

Remote = runtime from jsDelivr, model weights from `hf://` (Hugging Face), voices from the `gradium/phonon-voices` repo. No local `models/` or `vendor/` files needed.

## 1. Load the model from HF

From `index.html` (CDN runtime) plus the `hf://` option documented in `vendor/phonon-tts/README.md`:

```js
const imp = u => import(u);
const M = await imp('https://cdn.jsdelivr.net/npm/phonon-tts/index.js');

// The worker must be same-origin, so wrap the CDN worker in a blob module
const workerUrl = URL.createObjectURL(new Blob(
  ['import "https://cdn.jsdelivr.net/npm/phonon-tts/worker.js"'],
  { type: 'text/javascript' }
));

const o = {
  lang: 'en',
  workerUrl,
  // pin a commit so the browser cache is never stale (branch/tag also work; `main` if omitted)
  model: 'hf://gradium/phonon-31m-en@92741c5b07d085ff840e26fea8ce43110b87852f',
  onProgress: p => console.log('TTS', Math.round(100 * p.loaded / (p.total || 1)) + '%'),
};

let tts;
try { tts = await M.PhononTTS.load({ ...o, device: 'webgpu' }); }
catch (e) { tts = await M.PhononTTS.load({ ...o, device: 'cpu' }); }
```

Omitting `model` uses the runtime's built-in default: `hf://gradium/phonon-31m-en@8c64b55ec301728e2d1695bfea87a08a267d0c2d`.

In Jarvis, entering `hf://gradium/phonon-31m-en@<sha>` in the Settings TTS model field already switches to this path (`if ((options.tts||'').startsWith('hf://')) o.model = options.tts`).

## 2. Use a catalog voice (remote)

The catalog is `https://huggingface.co/gradium/phonon-voices`. Its `voices.jsonl` lists name, language and file. Each voice file is:

```
https://huggingface.co/gradium/phonon-voices/resolve/main/voices/<VOICE_ID>.safetensors
```

```js
const HF_VOICES = 'https://huggingface.co/gradium/phonon-voices/resolve/main/';

// optional: read the catalog remotely
const catalog = (await (await fetch(HF_VOICES + 'voices.jsonl')).text())
  .split('\n').filter(s => s.trim()).map(s => JSON.parse(s))
  .filter(v => v.language === 'en');

async function useVoice(tts, voiceId, name = voiceId) {
  if (!tts.voices.includes(name))
    await tts.addVoice(name, HF_VOICES + 'voices/' + voiceId + '.safetensors');
  return name;
}

// speak (streaming)
const voice = await useVoice(tts, 'NbpkqMVS3CJeq2j8', 'Zoey');
for await (const chunk of tts.stream('Hello. I am Jarvis.', { voice })) {
  // chunk = Float32Array mono PCM @ tts.sampleRate (80 ms each)
}

// or one-shot WAV (used by the voice preview)
const wav = await tts.synthWav('Hello. I am Jarvis.', { voice });
```

In Jarvis, the only change needed is in `resolveVoice` / `VOICE_CATALOG`:

```js
const VOICE_CATALOG = 'https://huggingface.co/gradium/phonon-voices/resolve/main/';
// ...inside resolveVoice: VOICE_CATALOG + v.filename   (filename = "voices/<id>.safetensors")
```

## 3. Voice IDs (English catalog)

From `models/phonon-voices-local/voices.jsonl`, filtered to `language == 'en'`.

### en-us

| Name | Voice ID | Gender |
|---|---|---|
| Zoey | `NbpkqMVS3CJeq2j8` | F |
| Juniper | `NIWIOv5vTi5eRMj8` | F |
| Everly | `vjFyp2BcCyTlUmYb` | F |
| Harper | `4SZHfMpw-p46Ywgs` | F |
| Hadley | `bXwrkHhURL1VFJdG` | F |
| Delia | `nGzMHMPAWGaJFHOo` | F |
| Easton | `LMDIYE0Oa377Qh6Z` | M |
| Micah | `40QrMVgAxFiUnP9f` | M |
| Trevor | `0zLApsZfVLLNaEGl` | M |
| Russell | `_6Aslh2DxfmnRLmP` | M |
| Preston | `qIxlZ7Ei8KvWlyQH` | M |
| Miles | `d9XCyhjo4JhkHF1d` | M |

### en-gb

| Name | Voice ID | Gender |
|---|---|---|
| Maeve | `6PWnV0Nq4wu7RVBT` | F |
| Freya | `GgfEkEJtxZR7gnpy` | F |
| Pippa | `uem82D50GRv2Dwma` | F |
| Elodie-Rose | `y9bQqIDnyxwqK01t` | F |
| Imogen | `gDT1nz7Ie36ZhL-C` | F |
| Lottie | `m9MxpY6IUGXtWp76` | F |
| Bryony | `gfP44RlHwr2kEwk7` | F |
| Alfie | `X6NceqF285Gr04gb` | M |
| Hugh | `YyKcxPG7iIgS3jsK` | M |
| Edwin | `zUCxzrOrugTSis03` | M |
| Spencer | `JOW0vchyswkQUMDS` | M |
| Toby | `dME3IWyZBvmh1n1q` | M |
| Teddy | `Zn7g6NxLqXlJb7Qi` | M |

### characters

| Name | Voice ID |
|---|---|
| Captain Silas Blackwater | `xPDpsV3F592srkjA` |
| Morwenna of the Deep | `nOykTmcH9ydsGGIc` |
| Old Mortlake | `lX3LavMNdlIbgEHH` |
| Azgorath | `dGyGDKo2osj7h3s7` |
| Fennick the Young Elf | `cXoIXJ2llS8S0WOW` |
| The Thing Under the Stairs | `GXaSqMEmOg12OIYb` |
| Vyrmathrax the Ancient | `xO8xQo3BrB8FuI6J` |
| Grub the Ogre | `cYtsRSxV5q9IMehn` |
| Master Aldric | `gSgG5Tor0GPEnqzC` |
| The Snow Queen | `NIWoEurJHMJjyUTe` |
| Sir Bramwell | `y2eiKxtQo2B67deU` |
| Fairy Godmother | `QXNr0SvkukLB4wPq` |

## Notes

- Voice IDs are used as the file name: `voices/<id>.safetensors`.
- Jarvis stores catalog voices as `catalog:<voice_id>`. With `addVoice` you choose the name yourself (e.g. `'Zoey'`).
- Cloning from an audio sample is not supported in the browser build; only ready-made voices.
- Voice asset licenses: check upstream before redistributing. The 31m weights are Apache 2.0.
