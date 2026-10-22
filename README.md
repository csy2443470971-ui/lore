# Lore

Lore is a voice-first journal app. Users talk about their day, and Lore keeps their own words with the filler words removed. When the user taps Lay out, Lore sets the words and the day's photos as a page, with the text flowing around the photos.

The app is an Expo / React Native prototype. The model pipeline runs on a Cloudflare Worker.

![How a day becomes a page](agent/docs/lore-architecture.png)

## How it works

1. **Transcribe.** The recording goes to the backend, which sends it to OpenAI gpt-transcribe with a hint that the speaker mixes Mandarin and English.
2. **Take out the stutter.** One call to DeepSeek V4 Flash on Together AI, with thinking off, removes:
   - fillers ("um", "嗯", "那个" used as a pause);
   - stutters;
   - false starts;
   - the half of a sentence the speaker took back.

   Everything else stays as it was said, including English inside Chinese, which is never translated. Code then sweeps out leftover filler sounds and checks the result. It must not lose English words, add Chinese characters or numbers, add formal connectives, or grow longer. If the check fails, Claude Haiku 5.5 tries once. If that also fails, a no-API rule set does the job.
3. **Read it.** Until the user taps Lay out, the page shows only the tidied transcript, in the order it was said.
4. **Match photos.** Users describe photos by number ("一号是…", "number two is…", "three to six are…"). Code splits the transcript into a part per photo or group.
5. **Lay out.**
   - **Free tier:** layout runs in code, with no model. Lines are broken in JavaScript around each photo's rectangle, using advance widths taken from the app's font files. Users can drag any photo and the paragraphs reflow on every frame.
   - **Premium tier:** the layout director (Claude Haiku 5.5, structured output) picks a title, a template, a quote and a hero photo. Code checks that the title uses only the writer's words and that the quote appears in the text exactly.

## Choosing the models

The test set in `agent/eval/cases.json` has 24 recordings: 8 in Chinese, 8 in English and 8 mixed. Each one lists the phrases that must survive and the fillers that must go.

**Fix the stutter**, run twice per recording (48 runs):

| Model | Passed | Median latency | USD per 1,000 test recordings |
|---|---|---|---|
| **DeepSeek V4 Flash, thinking off** | **48/48** | 1.6 s | **0.05** |
| DeepSeek V4.1 Flash | 48/48 | 0.2 s | 0.13 |
| Claude Opus 5.5 (reference) | 48/48 | 1.1 s | 3.48 |
| Claude Haiku 5.5 | 46/48 | 0.8 s | 0.07 |
| No-API rules | 26/48 | — | 0 |

**Transcription**, then the tidy step, on audio made from the same scripts with macOS system voices. Synthetic speech, so this ranks the options rather than settling the choice.

| Transcription | Raw error rate | English words kept | Final text passed | USD per minute, both steps |
|---|---|---|---|---|
| **OpenAI gpt-transcribe** | **2.4%** | **97%** | **21/24** | **0.0051** |
| OpenAI gpt-4o-mini-transcribe | 4.7% | 95% | 19/24 | 0.0036 |
| Together Whisper large-v3 | 6.4% | 95% | 19/24 | 0.0021 |

A day with five minutes of talk costs about $0.024 on the free tier and $0.025 on the premium tier, almost all of it transcription. The full notes are in [`agent/ARCHITECTURE.md`](agent/ARCHITECTURE.md), written in Chinese.

## Layout of this repository

- **`app/`:** the Expo app. `src/Doc.tsx` holds the flowing-text layout, `src/Home.tsx` the writing page, `src/agent.ts` the backend client and `src/match.ts` the photo matching.
- **`agent/`:** the model pipeline.
  - `core.mjs` holds the prompt, the checks and the rules.
  - `worker/` is the Cloudflare Worker.
  - `director.mjs` is the layout director.
  - `eval/` holds the test sets and comparison scripts, and `results/` the runs.

## Running it

The app runs in Expo Go:

```bash
cd app && npm install && npx expo start
```

It needs `app/.env` with `EXPO_PUBLIC_LORE_AGENT_URL` and `EXPO_PUBLIC_LORE_KEY`. Without them, it shows a demo transcript.

The backend is a Cloudflare Worker:

```bash
cd agent/worker && npx wrangler deploy
```

Then set four secrets with `npx wrangler secret put`: `OPENAI_API_KEY`, `TOGETHER_API_KEY`, `ANTHROPIC_API_KEY` and `LORE_APP_KEY`.

To rerun the evaluations:

```bash
cd agent && npm install
node eval/run.mjs
node eval/stt.mjs
```

They need API keys in the environment.
