// The time-heading and topic nodes on entries that really came out of the app (code-mixed Chinese and English, raw
// spoken English). It prints what the production calls (DeepSeek V4 Flash, JSON) return, to be read by eye.
import { viaTogether } from '../clean.mjs';
import { sections, topics } from '../sections.mjs';

const json = { type: 'json_object' };
const call = (p) => viaTogether('deepseek-ai/DeepSeek-V4-Flash-0731', '', { reasoning: { enabled: false }, response_format: json, prompt: p });
const CASES = {
  'zh-en mixed, 22 Oct': [
    '今天我在家里开发这个APP。',
    '中午我出门吃了个饭，去了Ku Ramen，那里的拉面特别好吃。',
    '傍晚的时候从窗外看出去，我觉得这个区域特别colorful，很喜欢。',
    '我有个promise给Dhwani，这个花姐红颜饮，就是我之前寄了七八盒，都喝完了。',
    '我一直都跟她说要给她，但是一直都没给。',
    '下周一给她吧。',
  ],
  'spoken English, 21 Oct': [
    'Okay, so today I went to an event that John Peng recommended us to go to, and John Peng was presenting there.',
    'And it was an event about public data and design, and they talked about how to turn, like, democratized public data and make a better data experience for users.',
    'And, but I was hungry, I was starving.',
    'After the event, I grabbed food, grabbed the free meal, and just stood alone and ate it while everyone else was chatting and networking.',
    'There was one speaker, Shawn, who talked about small business data in NYC, Harlem, and that is something related to our capstone project, small business owners in NYC.',
    'And I did talk to Sean while I was finishing my eating, so that was quite fun, but it was a very tiring day.',
    'And during the day, I went to NYU library to have a tutorial session with Kashish.',
    'I taught Kashish a lot of vibe coding, literacy, AI literacy, and it was very fun, but I starved today.',
  ],
};
for (const [name, ss] of Object.entries(CASES)) {
  console.log(`\n== ${name}`);
  for (let rep = 0; rep < 3; rep++) {
    const [s, t] = await Promise.all([sections(ss, call), topics(ss, call)]);
    console.log(`run ${rep + 1}: headings ${JSON.stringify(s.sections.map((x) => [x.sentence, x.heading]))} via ${s.via}; breaks ${JSON.stringify(t.breaks)}`);
  }
}
