/* All words in the app, in two languages that never mix: the UI and the sample journal (one Saturday in Hangzhou). */
export type Lang = 'zh' | 'en';
export type Scene = { id: string; zh: string; en: string; day: string; night: string; noNight?: boolean; variant?: boolean };

export const SCENES: Scene[] = [
  { id: 'dunes', zh: '沙丘与门', en: 'Dunes', day: 'dunes-day', night: 'dunes-night' },
  { id: 'lighthouse', zh: '海边灯塔', en: 'Lighthouse', day: 'lighthouse-day', night: 'lighthouse-night' },
  { id: 'snow', zh: '雪原小屋', en: 'Snowfield', day: 'snow-day', night: 'snow-night' },
  { id: 'meadow', zh: '山丘孤树', en: 'Meadow', day: 'meadow-day', night: 'meadow-night' },
  { id: 'forest', zh: '纸雕森林', en: 'Paper forest', day: 'forest-day', night: 'forest-night' },
  { id: 'island', zh: '浮空小岛', en: 'Floating isle', day: 'island-day', night: 'island-night' },
  { id: 'canyon', zh: '峡谷露营', en: 'Canyon camp', day: 'canyon-day', night: 'canyon-night' },
  { id: 'ring', zh: '旷野圆环', en: 'Salt flat ring', day: 'ring-day', night: 'ring-night' },
  { id: 'moonbase', zh: '月面基地', en: 'Moon base', day: 'moonbase-day', night: 'moonbase-night' },
  { id: 'futurecity', zh: '远方的未来城', en: 'Future city', day: 'futurecity-day', night: 'futurecity-night' },
  { id: 'rooftop', zh: '城市屋顶', en: 'Rooftop', day: 'rooftop-day', night: 'rooftop-night' },
  { id: 'road', zh: '郊外公路', en: 'Country road', day: 'road-day', night: 'road-night' },
  { id: 'platform', zh: '海边小站', en: 'Cliff station', day: 'platform-day', night: 'platform-night' },
  { id: 'greenhouse', zh: '草地温室', en: 'Greenhouse', day: 'greenhouse-day', night: 'greenhouse-night' },
  { id: 'mars', zh: '红色星球', en: 'Red planet', day: 'mars-day', night: 'mars-night' },
  { id: 'telescope', zh: '高原望远镜', en: 'Radio dish', day: 'telescope-day', night: 'telescope-night' },
  { id: 'orbit', zh: '近地轨道', en: 'Low orbit', day: 'orbit-day', night: 'orbit-night' },
  { id: 'midcentury', zh: '林边玻璃屋', en: 'Glass house', day: 'midcentury-day', night: 'midcentury-night' },
  { id: 'cabin', zh: '山坡小屋', en: 'Hillside cabin', day: 'cabin-day', night: 'cabin-night' },
  { id: 'town', zh: '白房子小镇', en: 'White town', day: 'town-day', night: 'town-night' },
  { id: 'retro', zh: '异星', en: 'Distant planet', day: 'retro-day', night: 'retro-day', noNight: true },
  { id: 'dunes-orange', zh: '落日沙丘', en: 'Sunset dunes', day: 'dunes-orange-day', night: 'dunes-night', variant: true },
  { id: 'meadow-pink', zh: '粉色山丘', en: 'Pink meadow', day: 'meadow-pink-day', night: 'meadow-night', variant: true },
];

export type Layout = 'mix' | 'big' | 'quote' | 'time';
export type Day = { n: number; d: string; t?: string; s?: string; p?: string; m?: string; today?: boolean; empty?: boolean; future?: boolean };

/* 1 = filler to remove, 2 = the speaker's own phrasing to keep and mark */
type Raw = [string, 0 | 1 | 2][];

const zh = {
  date: '10月17日  周六',
  greetDay: '下午好。\n想到什么就说一句。', greetNight: '晚上好。\n今天过得怎么样？',
  subDay: '不用想好再说。', subNight: '说一分钟就好。',
  todayLink: '今天这一页', todayTitle: '西湖慢慢走', segs: '3 段',
  hold: '按住说话', release: '松手就好', cleaning: '正在整理',
  cleaned: (cut: number, kept: string[]) => `去掉了 ${cut} 处填充词${kept.length ? '，留下了' + kept.map((k) => '“' + k.trim() + '”').join('') : ''}`,
  file: '收进今天',
  addPhotos: '添加照片', clearPhotos: '清空照片',
  photoHint: (n: number) => `按住说话，按编号说说这 ${n} 张：“1 号是……”`,
  photoDone: (n: number) => `已按编号把 ${n} 张照片配上文字`,
  raw: [['嗯，', 1], ['然后我今天', 0], ['就是，', 1], ['就是', 1], ['去了湖边那家咖啡馆，', 0], ['那个', 1], ['气氛', 0], ['真的是', 2], ['绝了。', 2], ['嗯……', 1], ['傍晚走到断桥，', 0], ['刚好赶上日落。', 0]] as Raw,
  today: '今天', back: '返回', archive: '回看',
  place: '杭州，晴，23°', voiceLen: '三段录音，共 4 分 12 秒',
  quote: '“突然觉得截止日期也没那么可怕了。”', playVoice: '听原声', playNew: '听刚才那段',
  t1: '今天去了湖边那家咖啡馆，气氛真的是绝了。点了一杯燕麦拿铁，坐了快两个小时，一直在想截止日期的事。',
  t2: '傍晚走到断桥，刚好赶上日落。整片湖是那种橘粉色，我在那儿站了好久，突然觉得截止日期也没那么可怕了。',
  t3: '回去的路上下了点小雨，顺手买了一份桂花糕。',
  bigQuote: '突然觉得截止日期\n也没那么可怕了。', quoteSrc: '17:42，断桥，第二段录音',
  cap: { cafe: '14:10  湖边的咖啡馆', latte: '燕麦拿铁', sunset: '17:42  断桥', osmanthus: '19:05  桂花糕' },
  routeFrom: '咖啡馆', routeTo: '断桥', routeLen: '步行 8.6 公里',
  stats: [['18,240', '步'], ['8.6', '公里'], ['12', '张照片'], ['4:12', '分钟录音']] as [string, string][],
  askPh: '想怎么改这一页？', ask: '应用', speak: '用说的', reflowing: '正在重新排……', undo: '撤销',
  notLearned: '这句还不太懂。可以试试：照片大一点、只留一句话、按时间排。',
  sugg: [['照片大一点', 'big'], ['只留一句话', 'quote'], ['按时间排', 'time']] as [string, Layout][],
  done: { mix: '换回了原来的排法。', big: '把日落那张放到了整页。', quote: '只留下一句话和一张照片。', time: '按时间从早到晚排好了。' } as Record<Layout, string>,
  week: '本周', month: '本月', weekTitle: '10月12日至18日', weekNo: '第 42 周',
  weekLede: '这周说了 24 分钟。有一天没开口，也没关系。',
  days: [
    { n: 12, d: '周一', t: '下雨天的面', s: '巷子口那碗面，雨一直没停。', p: 'noodles', m: '3 分钟' },
    { n: 13, d: '周二', empty: true },
    { n: 14, d: '周三', t: '给妈妈打电话', s: '她说桂花开了，让我周末回家。', p: 'osmanthus', m: '7 分钟' },
    { n: 15, d: '周四', t: '南山路的灯笼', s: '灯笼一下全亮起来的那一刻。', p: 'lanterns', m: '2 分钟' },
    { n: 16, d: '周五', t: '火锅局', s: '和小林吃到快十二点，聊到辞职。', p: 'hotpot', m: '8 分钟' },
    { n: 17, d: '周六', t: '西湖慢慢走', s: '突然觉得截止日期也没那么可怕了。', p: 'sunset', m: '4 分钟', today: true },
    { n: 18, d: '周日', future: true },
  ] as Day[],
  isToday: '今天', tomorrow: '明天', notYet: '还没到', silent: '没说话，也没关系',
  monthTitle: '十月', monthSub: '2026 年', monthLede: '慢慢变凉的一个月。“截止日期”说了九次，最后一次是笑着说的。',
  wd: ['一', '二', '三', '四', '五', '六', '日'], less: '说得少', more: '说得多',
  mstats: [['12', '天开口'], ['58', '分钟'], ['46', '张照片'], ['212', '公里']] as [string, string][],
  wordsTitle: '这个月反复说到', times: (n: number) => `${n} 次`,
  words: [['截止日期', 9], ['西湖', 6], ['妈妈', 5], ['咖啡', 4], ['跑步', 3]] as [string, number][],
  settings: '设置', setLede: '这里只有几件事。',
  sScene: '场景', change: '更换', sLook: '外观', sLookSub: '深色时，场景换成夜晚。', light: '浅色', dark: '深色', auto: '跟随系统',
  sLang: '语言', sLangSub: '界面和日记样例的语言。',
  sStyle: '我的写作风格', sStyleSub: '整理时怎么改你说的话。',
  wsClean: '去掉填充词', wsCleanSub: '只删“嗯”“那个”“就是就是”，其余一字不动。始终开启。',
  wsGrammar: '修复语法', wsGrammarSub: '理顺病句和语序，不换你的用词。',
  wsTrain: '学习我的文风', wsTrainSub: '导入你过去写的文字，让整理更像你写的。',
  wsImport: '导入过去的文字', wsImported: (n: number) => `已导入 ${n} 份文字`, wsImportHint: '支持 txt、Markdown、PDF。',
  sRemind: '提醒', sRemindSub: '每晚九点半提醒写一句；每周日晚上提醒回看这一周。',
  rNight: '每晚', rWeek: '每周', rOff: '关闭',
  edgeBack: '返回', justNow: '刚刚',
  sAuto: '自动带进来', sAutoSub: '当天的这些会自己排进页面。', sources: ['照片', '地点', '步数', '天气', '音乐'],
  sLocal: '只在手机上转写', sLocalSub: '原声不上传；整理用的文字离开手机前会去掉人名。',
  sExport: '导出', sExportSub: 'Markdown、PDF 或原声文件夹。',
  colophon: '安静日记 0.3。你已经写了 41 天。',
  pick: '选一个地方', pickSub: '你的日记会住在这里，白天和夜晚会自己切换。', close: '关闭',
  noNight: '只有白天', variant: '配色变体',
};

const en: typeof zh = {
  date: 'Saturday, October 17',
  greetDay: 'Good afternoon.\nSay whatever comes to mind.', greetNight: 'Good evening.\nHow was today?',
  subDay: 'No need to think it through first.', subNight: 'A minute is plenty.',
  todayLink: 'Today’s page', todayTitle: 'A slow walk by the lake', segs: '3 notes',
  hold: 'Hold to talk', release: 'Let go when you’re done', cleaning: 'Tidying up',
  cleaned: (cut, kept) => `Removed ${cut} filler word${cut === 1 ? '' : 's'}${kept.length ? ', kept ' + kept.map((k) => '“' + k.trim() + '”').join(' and ') : ''}`,
  file: 'Add to today',
  addPhotos: 'Add photos', clearPhotos: 'Clear photos',
  photoHint: (n) => `Hold to talk. Go by number: “Number 1 is…” (${n} photo${n === 1 ? '' : 's'})`,
  photoDone: (n) => `Matched your words to ${n} photo${n === 1 ? '' : 's'} by number`,
  raw: [['Um, ', 1], ['so today I ', 0], ['like, ', 1], ['went to that café by the lake, ', 0], ['and it was ', 0], ['honestly ', 2], ['so good. ', 2], ['Uh… ', 1], ['Then I walked to the bridge ', 0], ['right at sunset.', 0]],
  today: 'Today', back: 'Back', archive: 'Look back',
  place: 'Hangzhou, clear, 23°', voiceLen: 'Three voice notes, 4 min 12 s',
  quote: '“Suddenly the deadline didn’t feel so scary.”', playVoice: 'Play recording', playNew: 'Play what you just said',
  t1: 'Went to the café by the lake today, and it was honestly so good. Ordered an oat latte and sat there for almost two hours, thinking about the deadline.',
  t2: 'Walked to the Broken Bridge in the evening, right at sunset. The whole lake turned this orange-pink, and I stood there for ages. Suddenly the deadline didn’t feel so scary.',
  t3: 'It drizzled on the way home, so I picked up some osmanthus cake.',
  bigQuote: 'Suddenly the deadline\ndidn’t feel so scary.', quoteSrc: '17:42, Broken Bridge, second voice note',
  cap: { cafe: '14:10  The café by the lake', latte: 'Oat latte', sunset: '17:42  Broken Bridge', osmanthus: '19:05  Osmanthus cake' },
  routeFrom: 'Café', routeTo: 'Broken Bridge', routeLen: '8.6 km on foot',
  stats: [['18,240', 'steps'], ['8.6', 'km'], ['12', 'photos'], ['4:12', 'minutes spoken']],
  askPh: 'How should this page change?', ask: 'Apply', speak: 'Say it', reflowing: 'Rearranging…', undo: 'Undo',
  notLearned: 'Not sure about that one yet. Try: bigger photos, just one line, or in time order.',
  sugg: [['Bigger photos', 'big'], ['Just one line', 'quote'], ['In time order', 'time']],
  done: { mix: 'Back to the original layout.', big: 'The sunset now fills the page.', quote: 'Kept one line and one photo.', time: 'Arranged from morning to night.' },
  week: 'This week', month: 'This month', weekTitle: 'October 12–18', weekNo: 'Week 42',
  weekLede: 'You talked for 24 minutes this week. One quiet day, and that’s fine.',
  days: [
    { n: 12, d: 'Monday', t: 'Noodles in the rain', s: 'The noodle place at the corner. It rained all day.', p: 'noodles', m: '3 min' },
    { n: 13, d: 'Tuesday', empty: true },
    { n: 14, d: 'Wednesday', t: 'Called Mom', s: 'The osmanthus is blooming. She wants me home this weekend.', p: 'osmanthus', m: '7 min' },
    { n: 15, d: 'Thursday', t: 'Lanterns on Nanshan Road', s: 'The moment they all lit up at once.', p: 'lanterns', m: '2 min' },
    { n: 16, d: 'Friday', t: 'Hotpot night', s: 'Dinner with Lin until almost midnight. We talked about quitting.', p: 'hotpot', m: '8 min' },
    { n: 17, d: 'Saturday', t: 'A slow walk by the lake', s: 'Suddenly the deadline didn’t feel so scary.', p: 'sunset', m: '4 min', today: true },
    { n: 18, d: 'Sunday', future: true },
  ],
  isToday: 'today', tomorrow: 'Tomorrow', notYet: 'Not yet', silent: 'A quiet day, and that’s fine',
  monthTitle: 'October', monthSub: '2026', monthLede: 'A month of cooling down. You said “deadline” nine times, and laughed the last time.',
  wd: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'], less: 'Less', more: 'More',
  mstats: [['12', 'days spoken'], ['58', 'minutes'], ['46', 'photos'], ['212', 'km']],
  wordsTitle: 'What kept coming up', times: (n) => `${n} times`,
  words: [['Deadline', 9], ['The lake', 6], ['Mom', 5], ['Coffee', 4], ['Running', 3]],
  settings: 'Settings', setLede: 'Only a few things here.',
  sScene: 'Scene', change: 'Change', sLook: 'Appearance', sLookSub: 'In dark mode, the scene turns to night.', light: 'Light', dark: 'Dark', auto: 'System',
  sLang: 'Language', sLangSub: 'For the interface and the sample journal.',
  sStyle: 'My writing style', sStyleSub: 'How your words get tidied.',
  wsClean: 'Remove filler words', wsCleanSub: 'Only “um”, “like” and repeats go. Nothing else changes. Always on.',
  wsGrammar: 'Fix grammar', wsGrammarSub: 'Smooth broken sentences and word order without changing your words.',
  wsTrain: 'Learn my style', wsTrainSub: 'Add things you’ve written before so the tidying sounds like you.',
  wsImport: 'Add past writing', wsImported: (n) => `${n} document${n === 1 ? '' : 's'} added`, wsImportHint: 'Plain text, Markdown or PDF.',
  sRemind: 'Reminders', sRemindSub: 'Nightly at 9:30 pm to say a line; weekly on Sunday evening to look back.',
  rNight: 'Nightly', rWeek: 'Weekly', rOff: 'Off',
  edgeBack: 'Back', justNow: 'Just now',
  sAuto: 'Bring in automatically', sAutoSub: 'These arrange themselves on the page.', sources: ['Photos', 'Places', 'Steps', 'Weather', 'Music'],
  sLocal: 'Transcribe on this phone only', sLocalSub: 'Recordings never leave the phone. Names are removed from any text sent for tidying.',
  sExport: 'Export', sExportSub: 'Markdown, PDF or a folder of recordings.',
  colophon: 'Quiet Journal 0.3. You’ve written for 41 days.',
  pick: 'Pick a place', pickSub: 'Your journal lives here. Day and night switch on their own.', close: 'Close',
  noNight: 'Day only', variant: 'Colour variant',
};

export const STR = { zh, en };
export type Str = typeof zh;

export function parseAsk(q: string): Layout | null {
  if (/大|整版|整页|big|large|full/i.test(q)) return 'big';
  if (/一句|少|简|one line|quote|short/i.test(q)) return 'quote';
  if (/时间|顺序|早到晚|time|order|chrono/i.test(q)) return 'time';
  if (/原来|还原|默认|reset|original/i.test(q)) return 'mix';
  return null;
}

/* Minutes spoken on Oct 1–17. Oct 1 2026 is a Thursday. */
export const MONTH_MIN = [3, 0, 5, 8, 0, 2, 6, 4, 0, 0, 7, 3, 0, 6, 2, 8, 4];
