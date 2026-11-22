# Orbix — правила роботи з репозиторієм

Платформа DCA-ботів для крипто-ф'ючерсів і споту: один HTML-файл інтерфейсу на GitHub Pages плюс серверні функції Supabase. Мова інтерфейсу, документації, комітів і PR — українська.

Репозиторій `Koloss10/Orbix` (до 18.11.2026 — `Koloss10/-zorya-trading-bots`). Сайт: https://koloss10.github.io/Orbix/ (GitHub Pages з `main`, корінь).

## Межі (не порушувати)
- Лише **Bybit Demo** (`api-demo.bybit.com`) і **Binance Futures Testnet**. Реальні рахунки не підключати, адреси бірж не змінювати.
- Ключі й секрети ніколи не просити в чаті: користувач вносить їх лише через форми Orbix. Ключі з правом виведення відхиляються.
- Лише безкоштовні сервіси, без SMS.
- Дані користувача (email тощо) не передавати зовнішнім сервісам.
- До завершення поточного етапу не додавати великих нових функцій; не ламати наявне.

## Команди
```sh
npm run build    # зібрати orbix.html, runner/engine.js і копії _shared/*
npm run check    # усе згенероване актуальне (так робить CI)
npm test         # усі тести (115+)
npm run verify   # check + test
```

## Згенеровані файли — вручну не редагувати
- `orbix.html` ← `src/orbix.template.html`, `src/orbix.css`, `src/js/*`, `src/vendor/*`
- `supabase/functions/runner/engine.js` ← `src/js/01–06`
- `supabase/functions/{exchange,runner}/{exchanges.ts,sign.js}` ← `supabase/functions/_shared/`

Вручну пишуться: `runner/index.ts`, `runner/core.js`, `runner/mirror.js`, `runner/risk.js`, `exchange/index.ts`, `tg-notify/*`, `_shared/*`.

## Процес
- Робота в гілці, злиття в `main` лише через PR після зеленого CI «Validate Orbix» (`.github/workflows/validate.yml`), злиття з `expectedHeadSha`, потім fast-forward робочої гілки до `main`.
- Викладання на сервер — скіл **`orbix-deploy`** (`.claude/skills/orbix-deploy/`).
  - Проєкт Supabase `krmnaypaitruhqgaxkfw`.
  - `runner`: `verify_jwt false`. `exchange`: `verify_jwt true`.
  - У `deploy_edge_function` завжди передаються **всі** файли функції. Після розгортання — `verify.py` і перевірка запуску розкладу (200, усі боти оброблено, без `error`).
- Міграції: новий файл `supabase/migrations/<YYYYMMDDHHMMSS>_<назва>.sql`, застосування через `apply_migration`. Наявні міграції не змінювати.
- Стабільний реліз: рядок у таблиці релізів `archive/README.md` (коміт злиття, версії `runner`/`exchange`). Теги з хмарної сесії не пушаться (дозволена лише робоча гілка).

## Тести й перевірка змін
- Біржі в тестах підставні: `fakeEx` у `tests/mirror.test.mjs`, `simEx` у `tests/sim.test.mjs`. Ручні ордери й збої мережі там уже змодельовані (`flaky`, `chaos`, `manual`).
- Для важливих виправлень робити мутаційну перевірку: тимчасово повернути старий код і переконатися, що тест падає.
- Мобільний інтерфейс перевіряти Playwright (iPhone 13 і 360 px): без горизонтального прокручування сторінки, без помилок JS.

## Підводні камені
- Ключ localStorage `zorya3` (боти без акаунта) **не перейменовувати**: інакше зникнуть дані користувачів.
- Ідентифікатор ордера: `ox<12 hex id бота>-<t36>-<вид>`. Знімаються лише ордери з префіксом бота (`cancelMine`, `cancelPrefix`); `cancelAll` біржі не викликати.
- Якщо `byLink` упав, статус ордера невідомий: новий ордер не надсилати, дію лишити в черзі (`once` у `mirror.js`).
- Стан бота зберігається з перевіркою версії (CAS) **до** будь-яких дій на біржі.
- Ліміти ризику (`profiles.risk_*`, `runner/risk.js`) пригнічують вхід у самій моделі (`processBot`, `entryOk`), а не лише на біржі: так модель і біржа не розходяться. Без профілю діють ліміти за замовчуванням (`DEF_LIMITS`).
- Адмін-статистика: `public.admin_stats()` (лише для `private.admins`, з 2FA-сесією) віддає кількості, налаштування ботів і результати у %, **без пошти, ключів і сум** — так і лишати. ID акаунта — `profiles.public_no` (не змінюється, тригер `profiles_keep_public_no`).
- Листи Auth (реєстрація, коди): вбудована пошта Supabase шле лише членам команди проєкту; для інших людей потрібен власний SMTP (Supabase → Authentication → Emails → SMTP).
- `auth`: адреса повернення = `location.origin + location.pathname`. Після зміни адреси сайту (наприклад, перейменування репозиторію) її треба додати в Supabase → Authentication → URL Configuration.

## Документи
- `docs/readiness-report.md` — звіт про готовність і поточні обмеження.
- `docs/engine-audit.md` — аудит рушія й усі знайдені розбіжності.
- `docs/exchange-review.md` — порівняння роботи з біржами з Hummingbot і Freqtrade, прогалини за пріоритетом.
- `docs/veles-comparison.md` — функції Orbix у порівнянні з Veles (за публічною довідкою), план за пріоритетом.
- `archive/` — старі версії (Zorya, старі гілки, знімки Orbix) і правила відкату. Збирання й CI його не чіпають.

## Поточний етап
План «перевірка надійності»:
- етап A (ризики виконання ордерів) завершено — PR #33;
- етап B (ліміти ризику, аварійна зупинка) завершено — PR #36, `runner` v16;
- **етап C триває**: 7-денний тест 18.11 09:00 — 25.11 09:00 UTC, журнал `docs/soak-test.md`. Код `runner` і `exchange` не змінювати (зміна обнуляє відлік); щоденна звірка — заплановане завдання о 09:47 за Києвом.
- **бета-тест з друзями (з 18.11)**: у Supabase вимкнено «Confirm email» — реєстрація поштою й паролем без листа; листи (коди, «Забули пароль?») доходять лише членам команди проєкту. **Перед релізом**: налаштувати власний SMTP (Brevo тощо) і ввімкнути «Confirm email» назад.
- **чекає на 25.11**: фільтр китів, часткове виставлення ордерів, фільтри ліквідності / сплеску активності / каскаду ліквідацій і тренду старшого таймфрейму (змінюють рушій і `runner`, зокрема історію до 1000 свічок) збережено в історії й тимчасово скасовано комітом `dc1053f` (`git revert`, без переписування історії). Після тесту: `git revert dc1053f`, `npm run verify`, PR, злиття й одразу `runner` v17 (скіл `orbix-deploy`).
  - **Скасування `dc1053f` уже зроблено й перевірено в гілці `ccr-486e7a15-g580fp-veles`** (183 тести, `npm run verify` зелений, axe 0): `git revert dc1053f` поверх функцій Veles давав 9 конфліктів (`04-engine.js`, `14-builder-backtests.js`, `runner/mirror.js`, `runner/index.ts`, `tools/build.js`, `tests/mirror.test.mjs`), їх розв'язано. Тому **на 25.11**: злити #59 у `main`, потім гілку `…-veles` у `main` (повторювати `git revert` не треба — він уже в гілці), `npm run verify`, PR, `runner` v17.
  - Реінвест (`bf`) масштабує й часткову сітку: `execute`, `restore` і `topUp` у `mirror.js` будують драбину з `base × bf`.
  - Старий рецепт — лише якщо гілку `…-veles` НЕ зливати, а скасовувати `dc1053f` на чистому `main`. Конфлікт revert у `src/js/14-builder-backtests.js` (перевірено пробним запуском): рядки `cfg`/`bad`/`fill`/`pv` взяти з версії з фільтрами, блок від `/* округлення кількості` до `minR` лишити перед `function pv(){`; у `bad()` перед `return''}` додати `{const r=minFirst(g);if(r&&g.base<r.min-1e-9)return minText(r)}`; у `pv()` після `fgSum(c);` — `minLoad(c.g);minR(c.g);`. `orbix.html` — `npm run build`. Підказки [?] і Вікі для фільтрів (`19-hints.js`) з'являться самі.
  - Того ж оновлення: модель (сервер і бектест) рахує кількість за правилами біржі бота — крок кількості, мінімум, крок ціни Bybit Demo / Binance Testnet (`MD.xflt`, `xRules`; на сервері — правила з біржі), щоб ордери моделі й біржі збігались (знахідка тесту: ETH 0,0171 → 0,01).
  - Того ж оновлення — гілка `ccr-486e7a15-g580fp-veles` (функції з `docs/veles-comparison.md`): зупинка після N угод (`g.maxd`, лічильник `b.nd` у стані сервера), реінвест (`g.rv`, множник `pos.bf`, драбина на біржі в тому ж масштабі), індикатори `st`/`kc`/`psar`/`hma`/`pc`, ручне керування угодою (`Bot.manual`, `config._cmd` → `state.mc`, дія біржі `madd`), вихід за сигналом (`g.xs`, `g.xmin`, масив `e.x` з `entry()`), статус «Помилка» з перезапуском (команда `resync` → `fl.rs`, скидання `state.xe`), лімітний вхід з відступом (`g.fo`/`g.pu`/`g.fw`, `b.pe`, події `pend`/`pcan`, дії біржі `plim`/`pcan`, `open.pt`; `sync` не знімає ордер входу, звірка `pf` — без тривоги), підхоплення позиції з біржі (команда `adopt` → `Bot.adopt`, дія біржі `adopt` — драбина й захист шляхом входу). Тип маржі для бота окремо на Bybit (єдиний акаунт) неможливий — див. `docs/veles-comparison.md`. Злити через PR після #59, перед розгортанням `runner` v17.
  - Того ж оновлення — правило «біржа головна» (погоджено з користувачем 19.11): якщо біржа закрила позицію бота за TP, SL чи трейлінгом (звірка бачить `xc`: у моделі позиція є, на біржі немає, ордерів бота немає), модель закриває свою угоду за ціною закриття на біржі (з `xr`), а не чекає власного виходу за свічками. Так картка, статистика й журнал показують те, що сталося на біржі. Знахідка тесту: ETH 4 год — біржа закрила трейлінгом 19.11 о 01:34 за 1771,61 (відкат усередині 4-годинної свічки), модель тримала угоду далі. Потрібні тести в `mirror.test.mjs` / `sim.test.mjs` (закриття біржею → модель закрита за ціною біржі, без нових ордерів) і мутаційна перевірка.

## Додаткові правила й агенти (everything-claude-code)
Загальні настанови з [everything-claude-code](https://github.com/affaan-m/everything-claude-code) (MIT, `.claude/ECC-LICENSE`). **Правила цього файлу (вище) мають пріоритет**: мова комітів і PR — українська, межі Demo/Testnet, згенеровані файли, заборона змін `runner`/`exchange` під час етапу C тощо.

@.claude/ecc-rules/common/code-review.md
@.claude/ecc-rules/common/coding-style.md
@.claude/ecc-rules/common/development-workflow.md
@.claude/ecc-rules/common/git-workflow.md
@.claude/ecc-rules/common/patterns.md
@.claude/ecc-rules/common/performance.md
@.claude/ecc-rules/common/security.md
@.claude/ecc-rules/common/testing.md
@.claude/ecc-rules/typescript/coding-style.md
@.claude/ecc-rules/typescript/patterns.md
@.claude/ecc-rules/typescript/security.md
@.claude/ecc-rules/typescript/testing.md
@.claude/ecc-rules/web/coding-style.md
@.claude/ecc-rules/web/design-quality.md
@.claude/ecc-rules/web/patterns.md
@.claude/ecc-rules/web/performance.md
@.claude/ecc-rules/web/security.md
@.claude/ecc-rules/web/testing.md

Агенти (`.claude/agents/`): planner, architect, code-reviewer, typescript-reviewer (JS/TS), database-reviewer (Postgres/Supabase), security-reviewer, tdd-guide, build-error-resolver, refactor-cleaner, doc-updater, silent-failure-hunter, performance-optimizer.
Команди: `/plan`, `/code-review`, `/build-fix`, `/refactor-clean`, `/test-coverage`, `/update-docs`, `/feature-dev`.
Скіли: `exchange-api` (довідка по API Bybit Demo і Binance Testnet — завантажувати перед змінами в коді бірж), `supabase` і `supabase-postgres-best-practices` (офіційні від Supabase, MIT; міграції в Orbix — як описано вище, через `apply_migration`), `security-review` (поряд із власним `orbix-deploy`).

Хуки (`.claude/settings.json`): заборона ручного редагування згенерованих файлів; перед завершенням відповіді — `npm run check`.
