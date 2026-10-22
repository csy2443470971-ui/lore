# Lore · 用户数据和存储

**结论**：账号放在我们已有的 Cloudflare 上（Worker + D1 数据库），只用「通过 Apple 登录」。日记内容先只存在手机上。以后做多设备同步和云备份时，内容在手机上加密后再存到 Cloudflare R2，服务器上只有读不懂的密文。不用 Supabase 或 Firebase。

## 现在的情况（要先修）

- **日记只在内存里。** `App.tsx` 里每天的内容是一个 `useState`，没有写到任何地方。关掉 App 再打开，写过的就没了。
- **录音在系统缓存目录。** iPhone 空间不够时，系统会清掉缓存。
- **所有人共用一把 App key。** 它打包在 App 里，拆包就能拿到。这样没法按人限额，也分不出免费档和付费档。

## 要存的东西

按每位活跃用户每天说 3 分钟、配 4 张照片估算：

| 数据 | 内容 | 每人每年 | 放哪里 |
|---|---|---|---|
| 账号 | Apple 给的用户 ID、邮箱（可能是 Apple 的中转邮箱）、档位、本月用量 | 很小 | 我们的服务器（D1） |
| 日记文字和排版 | 每天的原话、照片位置、分组 | 不到 1 MB | 手机；同步时加密后存 R2 |
| 照片 | 压到长边 2048 px 的 JPEG，每张约 0.5 MB | 约 0.7 GB | 同上 |
| 录音 | 现在用 HIGH_QUALITY（AAC 立体声 128 kbps，约 1 MB/分钟） | 约 1 GB；改成单声道 32 kbps 后约 0.26 GB | 同上，也可以设成只留在手机上 |

录音改小之前，要先确认转写准确率不下降。

## 方案

### 1. 登录：只用「通过 Apple 登录」

- 用户点一下、刷一下 Face ID 就登录，不用密码。用户可以选择把邮箱隐藏成 Apple 的中转邮箱。
- 流程：
  1. App 拿到 Apple 签名的身份令牌。
  2. Worker 用 Apple 的公钥验证它，在 D1 里建用户。
  3. Worker 发一个 Lore 自己的登录令牌，App 存进手机钥匙串（`expo-secure-store`）。
  4. 之后每个请求都带这个令牌，替换现在的共用 App key。
- 按人限额：免费档每月有一定的转写分钟数（数值待定），付费档放宽，并开放版面导演。
- 以后可以加 App Attest，挡住用脚本刷接口的人。Expo 有 `@expo/app-integrity`，目前是 alpha 版。
- **App Store 的硬性要求**：能注册账号的 App 必须能在 App 里删除账号，见审核指南 5.1.1(v)。删除时要一起删掉服务器上的数据，并调 Apple 的接口撤销登录令牌。
- **前提**：「通过 Apple 登录」需要付费的 Apple Developer Program（每年 99 美元）。用免费 Apple ID 装到手机上的版本不能用这个功能。上 TestFlight 和 App Store 本来也需要这个会员。开发阶段可以先在 Expo Go 里测。

### 2. 日记内容：先只存在手机上

- 每天的文字和排版存在 AsyncStorage 里，一天一条。录音和照片放在 App 的 Documents 目录，不放缓存目录。这一步已经做了，代码在 `mobile/src/store.ts`。
- 以后回看页要按月查询或搜索时，再换成 `expo-sqlite`。
- iPhone 的 iCloud 备份会自动带上 Documents 目录，所以换手机时从备份恢复，日记就能回来。这一步不花钱，我们的服务器也不存任何日记。
- 转写、修口吃、排版时，内容临时发给后端，处理完不保存。

### 3. 以后的同步和云备份：端到端加密，存在 R2

- 手机上生成一把密钥，存在钥匙串里。内容在手机上加密后再上传，算法用 AES-256-GCM。服务器上只有密文，我们、Cloudflare 或者攻破服务器的人都读不出来。
- 日期、文件大小这类元数据不加密，Day One 也是这样。
- 密钥丢了，内容就解不开了。所以要给用户一个「恢复密钥」让他们自己保存，再在用户自己的 iCloud 里存一份，这是 Day One 的做法。查到的 `expo-secure-store` 文档里没有 iCloud 钥匙串同步的选项，所以在新设备上要靠恢复密钥或者 iCloud 里那一份。
- 加密不影响 AI 功能。转写、周报和洞察，都是 App 把需要的那部分原文临时发给后端。

### 4. 付费订阅：RevenueCat

- 每月收入 2,500 美元以下免费，超过后收 1%。
- 用户在 App 里买了之后，RevenueCat 通知 Worker，Worker 改 D1 里的档位。
- 它需要原生模块，要用 Xcode 打的版本测。

### 5. 用户管理后台

- 一个只有你能打开的小网页，用 Cloudflare Access 限定只有你的邮箱能登录。
- 能看到用户数、每个人的档位、本月用量和成本。还能封禁滥用的账号，替用户删除账号。
- 后台看不到任何日记内容，这是设计上的选择。

## 为什么不选别的

- **Supabase**：登录、数据库、文件存储和后台都有，在 Expo 里也能用 Apple 登录。不选它，原因有四个：
  - 免费项目一周没人用就会暂停，上线要用 Pro，每月 25 美元起。
  - 文件存储每 GB 0.0213 美元，每月流量超过 250 GB 后每 GB 0.09 美元。R2 存储每 GB 0.015 美元，流量免费。
  - 日记加密以后，它最强的「按行查询 + 行级权限」就用不上了。
  - 我们只需要一种登录方式和几张表，放在已有的 Worker 里更简单。

  如果以后要加邮箱登录，或者需要现成的用户后台，可以再考虑它。
- **Firebase**：从 2026 年 2 月起，文件存储必须开按量付费的 Blaze 计划。它对我们没有额外的好处。
- **只用用户自己的 iCloud**（像 Apple 日记那样）：我们一分钱不花，但有三个问题：
  - 只能在 iPhone 上用。
  - 很多人只有免费的 5 GB iCloud，经常是满的，同步会悄悄失败。
  - 几台设备同时改同一天时的冲突要我们自己处理。

## 成本

- 录音改小以后，每位活跃用户每年约 1 GB。存在 R2 上，一年后每人每月约 0.015 美元。R2 的前 10 GB 免费，D1 用量在免费额度内。
- 1,000 位活跃用户一年后约 1 TB：
  - R2 每月约 15 美元。
  - 同样的量放在 Supabase，每月约 44 美元（25 美元 + 900 GB × 0.0213 美元）。
- 作为对比，这 1,000 位用户的转写每月约 410 美元。存储不是成本的大头，所以选方案主要看隐私和省事。
- Workers 免费档每天有 10 万次请求。上线后建议开 Workers Paid，每月 5 美元。

## 发给 AI 服务的数据（隐私政策里要写清楚）

| 服务 | 用来做什么 | 会不会保存 |
|---|---|---|
| OpenAI 转写接口 | ③ 转写 | OpenAI 的数据控制表里，转写接口既不保留滥用监控日志，也不保存应用状态。API 数据默认不用来训练。 |
| Together AI（DeepSeek V4 / V4.1 Flash） | ② ④ 修口吃、⑤ 修听错的词和语法 | **默认会存**提示词和回答，并可能用来改进产品。要在 Together 的组织设置 → Privacy 里把「Store prompts and model responses」改成 No。默认也不用来训练。 |
| Anthropic（Claude Haiku 5.5） | ④ ⑤ 的备用、⑧ 版面导演 | API 数据不用来训练。第三方资料说从 2025 年 9 月起默认保留 7 天，还要在 Anthropic 官方页面上确认。 |
| 我们的 Worker | 中转 | 代码里不打印录音和文字。开着的请求日志只记请求本身，不记内容。 |

## 一个会改变方案的决定：首发市场

上面的方案是按海外 App Store 设计的。如果先在中国大陆上架，要另做一套后端：

- 从 2023 年起，Apple 要求大陆上架的 App 有 ICP 备案号。
- 用了生成式 AI，还要做生成式 AI 的备案或登记。
- OpenAI 和 Anthropic 不对大陆提供服务，转写和模型都要换成国内的。
- 数据要放在国内的云上。

建议先上海外。存储层写成一个可替换的接口，以后做大陆版时换掉这一层就行。

## 建议的顺序

1. **把日记存在手机上**：已经做了（AsyncStorage + Documents 目录）。录音还没改小，要先测转写准确率。
2. **「通过 Apple 登录」+ D1 用户表 + 按人限额**，替换共用 App key。Expo Go 里可以测；装到手机上的版本要等加入付费开发者计划。
3. **在 App 里删除账号。**
4. **用户管理后台。**
5. **订阅（RevenueCat）。**
6. **端到端加密的同步。**

现在就可以做的一件小事：在 Together 的组织设置里关掉「存储提示词和回答」，一分钟就能改完。

## 来源

- Supabase 价格：[supabase.com/pricing](https://supabase.com/pricing)
- R2 价格：[developers.cloudflare.com/r2/pricing](https://developers.cloudflare.com/r2/pricing/)；D1 价格：[developers.cloudflare.com/d1/platform/pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- Firebase 存储改动：[Firebase FAQ](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024?hl=zh-CN)
- RevenueCat 价格：[revenuecat.com/pricing](https://www.revenuecat.com/pricing/)
- 删除账号的要求：[Apple 审核指南 5.1.1(v)](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)、[Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app)
- 免费 Apple ID 不能用「通过 Apple 登录」：[Apple 开发者论坛](https://developer.apple.com/forums/thread/755912)
- Supabase 的 Apple 登录：[supabase.com/docs/guides/auth/social-login/auth-apple](https://supabase.com/docs/guides/auth/social-login/auth-apple.md)
- App Attest：[Expo app-integrity](https://docs.expo.dev/versions/v57.0.0/sdk/app-integrity/)
- Day One 的端到端加密：[End-to-End Encryption FAQ](https://dayoneapp.com/guides/security/end-to-end-encryption/)
- Apple 日记的加密：[Journaling Suggestions & Privacy](https://www.apple.com/legal/privacy/data/en/journaling-suggestions)
- `expo-secure-store` 的 iCloud 同步问题：[Expo 论坛](https://forums.expo.dev/t/securestore-icloud-keychain-does-not-sync/44884)
- OpenAI 数据控制：[developers.openai.com/api/docs/guides/your-data](https://developers.openai.com/api/docs/guides/your-data)
- Together 零保留：[docs.together.ai/docs/zero-data-retention](https://docs.together.ai/docs/zero-data-retention)
- Anthropic 保留期（第三方，待官方确认）：[anarlog.so](https://anarlog.so/blog/anthropic-data-retention-policy)
- 大陆上架的 ICP 备案：[MediaNama](https://www.medianama.com/2023/10/223-apple-china-app-store-government-license/)、[AppInChina 生成式 AI 登记](https://appinchina.co/blog/the-complete-guide-to-chinas-aigc-registration/)
- iCloud 同步库：[react-native-cloud-storage](https://react-native-cloud-storage.oss.kuatsu.de/docs/installation/expo)
