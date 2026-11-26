# Orbix — правила роботи з репозиторієм

Платформа DCA-ботів для крипто-ф'ючерсів і споту: один HTML-файл інтерфейсу на GitHub Pages плюс серверні функції Supabase. Мова інтерфейсу, документації, комітів і PR — українська.

Репозиторій `Koloss10/Orbix` (до 18.11.2026 — `Koloss10/-zorya-trading-bots`). Сайт: https://koloss10.github.io/Orbix/ (GitHub Pages з `main`, корінь).

## Межі (не порушувати)
- Лише **Bybit Demo** (`api-demo.bybit.com`) і **Binance Futures Testnet**. Реальні рахунки не підключати, адреси бірж не змінювати.
- Ключі й секрети ніколи не просити в чаті: користувач вносить їх лише через форми Orbix. Ключі з правом виведення відхиляються.
- Лише безкоштовні сервіси, без SMS.
- Дані користувача (email тощо) не передавати зовнішнім сервісам. Виняток, погоджений 23.11: Orbix AI передає AI-провайдеру **лише торгові дані** (налаштування, угоди, PnL, ризики, бектести) — без пошти, імен, ID акаунта/ботів/ордерів, назв і ключів (білий список у `ai-assistant/tools.js`, тест у `tests/ai.test.mjs`). Провайдер — безкоштовний тариф (Groq за замовчуванням).
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
- `supabase/functions/ai-assistant/{engine.js,risk.js}` ← `runner/engine.js`, `runner/risk.js` (Orbix AI рахує ризик тією самою логікою)

Вручну пишуться: `runner/index.ts`, `runner/core.js`, `runner/mirror.js`, `runner/risk.js`, `runner/signal.js`, `runner/commands.js`, `tg-card/*`, `exchange/index.ts`, `tg-notify/*`, `_shared/*`, `ai-assistant/{index.ts,agent.js,provider.js,tools.js,docs.js}`.

## Процес
- Робота в гілці, злиття в `main` лише через PR після зеленого CI «Validate Orbix» (`.github/workflows/validate.yml`), злиття з `expectedHeadSha`, потім fast-forward робочої гілки до `main`.
- Викладання на сервер — скіл **`orbix-deploy`** (`.claude/skills/orbix-deploy/`).
  - Проєкт Supabase `krmnaypaitruhqgaxkfw`.
  - `runner`: `verify_jwt false`. `exchange`: `verify_jwt true`. `tg-card`: `verify_jwt false` (автентифікація в коді: секрет розкладу або JWT користувача).
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
- Картки сигналів у Telegram (v18): `runner` будує опис картки (`signal.js`: причини входу з тих самих індикаторів рушія, рівні, налаштування `public.tg_card_prefs`) і передає його `tg-card` із секретом розкладу; `tg-card` малює PNG (`card.js` → resvg) і надсилає. Не вийшло — `runner` надсилає текст. Сповіщення мають категорії (`notify(text, cat)` у `mirror.js`) для фільтра подій.
- Стоп на біржі (v20): `guard` ставить кінцевий SL — після останньої досяжної докупівлі (`slStop`, за лімітними ордерами бота на біржі), бо SL моделі зсувається із середньою, а сервер оновлює стоп біржі лише раз на 5 хв. Картка показує той самий рівень.
- Ручні команди (v19): кнопки «⋯» на картці серверного бота пишуть у `public.bot_commands` (лише власник, 2FA, одна команда, що чекає, на бота); тригер одразу будить `runner` тілом `{ bot }` (pg_net, секрет розкладу). `runner/commands.js` застосовує команду до збереженого стану ДО рушія, дії для біржі (`mclose`, `mcancel`) — через чергу `pend`, як сигнали; `fl.cmd` — захист від повтору, `fl.sa` — «пауза до кінця угоди». Модель після ручного закриття — за ціною закриття на біржі (угода з позначкою `man`, скасована — `cx`). v22: `add` («Докупити зараз», `bot_commands.amount` — маржа; дія `madd`, модель докуповує за ціною й кількістю біржі, лімітна драбина не зсувається, стеля — `risk.js` `addCap`) і `resync` («Перезапустити угоду»: скидає `xe`/`fl.mis`, на Bybit `fl.rs` → `restore`). Статус «Помилка» на картці — `srvErr` (`19-server-bots.js`).
- Нейтральний бот (v23): `g.d = 0`; `entry()` дає 1 / −1 / 0 (сигнали й фільтри рахуються для обох боків, суперечливі — без входу), напрям угоди — `pos.d` (і `d` у записі угоди та подіях сервера). Рушій: `dOf(g, pos)`, `gOf(g, pos)` — налаштування угоди з її напрямом; сервер (`handleBot`) працює з біржею в напрямі угоди моделі, `fl.dd` пам'ятає його до закриття на біржі. У базі `bots.side` = 'neutral'. Лише ф'ючерси.
- Закриття в беззбиток (v25): `g.bz` — кількість останніх ордерів; рушій веде `pos.lots` (кількість кожного ордера), при поверненні до беззбитку всієї позиції закриває останні bz ордерів (запис `f` з `k:'b'`, `pos.nbz`), `p.n` зменшується, `p.last` — ціна останнього ордера, що лишився. Сервер: подія `bz` → дія `bz` (reduceOnly, та сама частка); на Bybit `fl.zg` — перше покоління драбини після закриття: `restore` не вважає виконані ордери старших поколінь перешкодою і виставляє закриті рівні з новими id.
- Адмін-статистика: `public.admin_stats()` (лише для `private.admins`, з 2FA-сесією) віддає кількості, налаштування ботів і результати у %, **без пошти, ключів і сум** — так і лишати. ID акаунта — `profiles.public_no` (не змінюється, тригер `profiles_keep_public_no`).
- Листи Auth (реєстрація, коди): вбудована пошта Supabase шле лише членам команди проєкту; для інших людей потрібен власний SMTP (Supabase → Authentication → Emails → SMTP).
- `auth`: адреса повернення = `location.origin + location.pathname`. Після зміни адреси сайту (наприклад, перейменування репозиторію) її треба додати в Supabase → Authentication → URL Configuration.

## Документи
- `docs/HANDOFF.md` — передача стану: що йде, що чекає на 25.11, що далі. Починати нову сесію з нього.
- `docs/readiness-report.md` — звіт про готовність і поточні обмеження.
- `docs/engine-audit.md` — аудит рушія й усі знайдені розбіжності.
- `docs/exchange-review.md` — порівняння роботи з біржами з Hummingbot і Freqtrade, прогалини за пріоритетом.
- `docs/veles-comparison.md` — функції Orbix у порівнянні з Veles (за публічною довідкою), план за пріоритетом.
- `docs/orbix-ai.md` — Orbix AI: рішення, архітектура, безпека, секрети, план викладання (етап 1 готовий у гілці `feature/orbix-ai-core`, викладання після 25.11).
- `archive/` — старі версії (Zorya, старі гілки, знімки Orbix) і правила відкату. Збирання й CI його не чіпають.

## Поточний етап
План «перевірка надійності» завершено: етапи A (PR #33), B (PR #36) і C (7-денний тест 18.11–25.11 без збоїв, `docs/soak-test.md`). Подробиці й історія — `docs/HANDOFF.md`.
- 25.11 викладено: `runner` v17 (PR #66: фільтри, часткове виставлення сітки, кількість за правилами біржі, правило «біржа головна»), Orbix AI етапи 1–2 (`ai-assistant`, секрет `AI_STAGE=2`), v18 — картки в Telegram (`tg-card`), v19 — ручні команди (`bot_commands`), v20 — кінцевий стоп на біржі. Викладання функцій — кнопкою GitHub Actions (`deploy-function.yml`, скіл `orbix-deploy`).
- Чекає перевірки наживо: перша ручна команда на Bybit Demo; нові картки (нумерація «Ордер 1…N», кінцевий SL).
- **Бета-тест з друзями (з 18.11)**: у Supabase вимкнено «Confirm email»; листи доходять лише членам команди проєкту. **Перед релізом**: власний SMTP (Brevo тощо) і повернути «Confirm email».
- Далі за пріоритетом — `docs/HANDOFF.md`, розділ «Далі» («Докупити зараз», статус «Помилка», лімітний вхід з відступом, підхоплення позиції з біржі — решта PR #60). Функції Veles v21 (N угод, реінвест, індикатори, вихід за сигналом) — `docs/HANDOFF.md`.

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
