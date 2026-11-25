---
name: orbix-deploy
description: Викласти зміни Orbix: тести й збірка, розгортання Edge Functions Supabase (runner, exchange, tg-notify) з побайтною звіркою, перевірка запуску розкладу, PR у main і злиття після зеленого CI. Використовуй, коли треба «викласти», «задеплоїти», «перенести на сервер» або злити зміни платформи Orbix.
---

# orbix-deploy

Повний цикл викладання змін Orbix. Кроки йдуть по черзі. Якщо крок не пройшов, зупинись, виправ і почни з нього знову. Невдачу не обходь.

## Сталі дані
- Репозиторій `Koloss10/Orbix` (раніше `Koloss10/-zorya-trading-bots`; старі git-адреси GitHub перенаправляє), сайт https://koloss10.github.io/Orbix/, робоча гілка `claude/trading-bots-platform-nk0qa3`, злиття в `main` лише через PR.
- Проєкт Supabase `krmnaypaitruhqgaxkfw`.
- Функції:
  - `runner`: `verify_jwt: false`, захист через `x-runner-secret`. Файли `index.ts, mirror.js, core.js, risk.js, signal.js, commands.js, engine.js, exchanges.ts, sign.js` (9).
  - `exchange`: `verify_jwt: true`, потрібна MFA. Файли `index.ts, exchanges.ts, sign.js`.
  - `tg-card`: `verify_jwt: false` (автентифікація в коді). Файли `index.ts, card.js`.
  - `ai-assistant`: `verify_jwt: true`. Файли `index.ts, agent.js, provider.js, tools.js, docs.js, market.js, monitor.js, risk.js, engine.js` (9).
  - `tg-notify`: `index.ts`. Поточний `verify_jwt` дізнайся через `list_edge_functions` і залиш таким самим.
- Розклад `orbix-runner` (pg_cron, кожні 5 хв) викликає `runner` через pg_net.

## Межі
- Лише Bybit Demo та Binance Testnet. Реальні рахунки й ключі з правом виведення заборонені.
- Секрети не просити й не виводити в чаті. Ключі вносяться лише через форми Orbix.
- Не вмикати `verify_jwt` для `runner` і не вимикати для `exchange`.

## 1. Перевірка локально
```bash
npm run build    # перегенерувати orbix.html, runner/engine.js і копії _shared/*
npm run check    # усе актуальне
npm test         # усі тести
```
Згенеровані файли вручну не редагуй:
- `runner/engine.js` збирається з `src/js/01–06`;
- `exchange/`, `runner/exchanges.ts` і `sign.js` копіюються з `supabase/functions/_shared/`.

## 2. Коміт і push
- Коміт у робочу гілку з описом українською. Наприкінці додай рядки атрибуції, які дає сесія.
- `git push -u origin claude/trading-bots-platform-nk0qa3`. Якщо push не вдався через мережу, повтори.

## 3. Які функції розгортати
`git diff --name-only origin/main...HEAD -- supabase/functions` показує, що змінилося:
- `src/js/01–06`, `runner/*` → `runner`;
- `_shared/*` → `runner` **і** `exchange`;
- `exchange/index.ts` → `exchange`;
- `tg-notify/*` → `tg-notify`.

## 4. Розгортання
- **Основний спосіб (з 25.11):** GitHub Actions «Deploy Supabase function» (`.github/workflows/deploy-function.yml`). Запуск: `gh api repos/Koloss10/Orbix/actions/workflows/deploy-function.yml/dispatches -f ref=<гілка> -f inputs[function]=<runner|exchange|ai-assistant|tg-card>`, потім дочекатися завершення (`actions/runs`). Офіційний CLI викладає всю теку функції; секрет `SUPABASE_ACCESS_TOKEN` у репозиторії. Ручний `deploy_edge_function` — лише для малих функцій: `runner` уже завеликий для одного виклику.
- `deploy_edge_function` завжди отримує **всі** файли функції, а не лише змінені, бо файл, якого немає у виклику, зникає з функції.
- Вміст файлів бери з актуальних локальних файлів (`cat`) дослівно.
- `entrypoint_path: index.ts`, `verify_jwt` як у списку вище.

## 5. Побайтна звірка
- Виклич `get_edge_function`. Відповідь велика й збережеться у файл.
- Звір її скриптом:
  ```bash
  python3 .claude/skills/orbix-deploy/verify.py <шлях_до_збереженої_відповіді> runner   # або exchange / tg-notify
  ```
- Кожен файл має дати `True`, а версія має бути на 1 більша за попередню.

## 6. Запуск розкладу (лише для `runner`)
Дочекайся найближчої кратної 5 хвилини плюс ~40 с. Для очікування використовуй `Monitor` з until-циклом, бо `sleep` на передньому плані заблоковано. Потім виконай:
```sql
select status_code, left(content::text,200), created from net._http_response order by id desc limit 2;
select b.config->>'pair', s.state->'fl', s.updated_at from bots b join bot_state s on s.bot_id=b.id
 where b.config->>'_srv'='true' order by 1;
select level, left(message,200), created_at from bot_events
 where created_at > now() - interval '15 minutes' and level in ('error','warn') order by created_at desc;
```
Очікується:
- `200` і `ok:true`;
- `processed` дорівнює `bots`;
- немає нових `error` чи `warn`;
- немає несподіваних `fl.mis` (якщо позицій ні в моделі, ні на біржі немає, `fl` має бути `{}`).

## 7. PR і злиття
- `create_pull_request` з `head` = робоча гілка, `base` = `main`. Опиши, що змінено, і окремо розгортання (версії, звірку). Опис закінчи рядками атрибуції, які дає сесія.
- Дочекайся зеленого `Validate Orbix` (`actions_list`, `list_workflow_runs` для гілки).
- `merge_pull_request` з `expectedHeadSha`.
- Підтягни гілку до `main`:
  ```bash
  git fetch origin main && git merge --ff-only FETCH_HEAD && git push -u origin claude/trading-bots-platform-nk0qa3
  ```

## 8. Звіт користувачу (українською, коротко)
Що змінилося для користувача, версії функцій, результат звірки й запуску розкладу, що лишилося неперевіреним наживо.

## 8. Реліз (для стабільних змін)
- Додай рядок у таблицю релізів в `archive/README.md`: коміт злиття в `main`, що змінено, версії `runner`/`exchange`.
- За потреби збережи знімок: `archive/orbix/<дата>-<назва>/orbix.html` (`git show <коміт>:orbix.html`).
- Теги git із хмарної сесії не пушаться (проксі пропускає лише робочу гілку), тож не намагайся.
