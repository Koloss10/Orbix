---
name: exchange-api
description: Довідка по API Bybit V5 (Demo Trading) і Binance USDⓈ-M Futures (Testnet/Demo) для Orbix — ліміти, підпис, правила кількості й ціни, ідентифікатори ордерів, TP/SL і трейлінг, зберігання історії, коди помилок. Завантажуй перед будь-якою зміною в supabase/functions/_shared/exchanges.ts, sign.js, runner (core/mirror/risk), src/js/02-market-data.js, або коли розбираєш помилку біржі чи розбіжність моделі з біржею.
---

# API бірж для Orbix

Зібрано з офіційної документації 19.11.2026 (Bybit: bybit-exchange.github.io/docs/v5, Binance: developers.binance.com/docs/derivatives/usds-margined-futures). API змінюються: якщо щось тут суперечить відповіді біржі — правда за біржею, онови цей файл. Межі з CLAUDE.md діють завжди: лише Demo/Testnet, адреси бірж не змінювати без погодження з користувачем.

## Bybit V5 — Demo Trading

**Середовище** (docs/v5/demo)
- REST: `https://api-demo.bybit.com`. Приватний WS: `wss://stream-demo.bybit.com`; публічні дані — з основного `wss://stream.bybit.com`. WS Trade не підтримується.
- Окремий акаунт з власним UID; ключі створюються в режимі Demo Trading основного акаунта.
- Ліміти — стандартні, не підвищуються.
- **Ордери Demo зберігаються лише 7 днів.**
- Підтримуються: усі market-запити; `order/create|amend|cancel|cancel-all|realtime|history`, `execution/list`, batch-варіанти; `position/list|set-leverage|switch-mode|trading-stop|closed-pnl|add-margin`; `account/wallet-balance|info|transaction-log|set-margin-mode`; поповнення `POST /v5/account/demo-apply-money`. `user/query-api` у списку не значиться — у коді використовується, тож при помилці дивитися сюди першим.

**Ліміти запитів** (docs/v5/rate-limit)
- IP: 600 запитів за 5 с; перевищення → HTTP 403 «access too frequent», бан щонайменше 10 хв.
- Per-UID (linear): `order/create` 10/с, `order/cancel` 10/с, `order/realtime` 50/с, `order/history` 50/с, `position/list` 50/с, `position/trading-stop` 10/с, `position/set-leverage` 10/с, `wallet-balance` 50/с.
- Заголовки: `X-Bapi-Limit`, `X-Bapi-Limit-Status`, `X-Bapi-Limit-Reset-Timestamp`. retCode `10006` — ліміт перевищено.

**Створення ордера** `POST /v5/order/create` (docs/v5/order/create-order)
- Обов'язкові: `category`, `symbol`, `side`, `orderType`, `qty` (рядок).
- `orderLinkId`: ≤36 символів, лише `[A-Za-z0-9_-]`, унікальний. Формат Orbix `ox<12 hex>-<t36>-<вид>` вкладається.
- `positionIdx`: 0 — one-way, 1/2 — hedge Buy/Sell (у hedge обов'язковий).
- `timeInForce`: GTC (типово), IOC, FOK, PostOnly, RPI; Market завжди IOC.
- `reduceOnly: true` — обов'язково для закриття/зменшення; з ним TP/SL у самому ордері не ставиться. `closeOnTrigger` — закриваючий, може скасувати інші ордери, якщо бракує маржі.
- `qty="0"` + `reduceOnly` + `closeOnTrigger` закриває позицію до `maxMktOrderQty`.
- `triggerPrice` робить ордер умовним; `triggerDirection` 1 — на зростання, 2 — на падіння.
- **Відповідь асинхронна**: підтверджує лише прийом запиту. Факт і ціну виконання брати з `order/history`/`realtime` або WS (у коді — 3 спроби по 300 мс у `market()`).

**Історія й активні ордери** (docs/v5/order/order-list)
- `GET /v5/order/history`: без дат — останні 7 днів; `endTime - startTime ≤ 7 днів`; `limit` 1–50 (типово 20), сторінки через `cursor`/`nextPageCursor`.
- Зберігання: `Cancelled`/`Rejected`/`Deactivated` — **лише 24 год**; інші закриті — 7 днів; старше 7 днів — тільки ордери з виконанням. Дані можуть запізнюватися (асинхронність).
- ⚠️ Для Orbix: `byLink` повертає `null`, якщо ордера немає ні в `realtime`, ні в `history`. Для скасованого без виконання ордера старше 24 год (або будь-якого старше 7 днів на Demo) це **не означає, що ордера не було**. Не трактувати такий `null` як дозвіл повторно надіслати старий ордер.
- `orderStatus`: відкриті `New`, `PartiallyFilled`, `Untriggered`; закриті `Rejected`, `PartiallyFilledCanceled`, `Filled`, `Cancelled`, `Triggered`, `Deactivated`.
- `createType` показує, хто створив ордер — корисно для правила «біржа головна» (закриття біржею): `CreateByUser`, `CreateByTakeProfit`, `CreateByPartialTakeProfit`, `CreateByStopLoss`, `CreateByPartialStopLoss`, `CreateByTrailingStop`, `CreateByTrailingProfit`, `CreateByLiq`, `CreateByAdminClosing`, `CreateByClosing`, `CreateByStopOrder`, `CreateByAdl_PassThrough` та ін.
- `stopOrderType`: `TakeProfit`, `StopLoss`, `TrailingStop`, `Stop`, `PartialTakeProfit`, `PartialStopLoss`, `tpslOrder`, `OcoOrder`, `MmRateClose`, `BidirectionalTpslOrder`.
- `cancelType` (чому скасовано), зокрема `CancelByUser`, `CancelByReduceOnly`, `CancelByPrepareLiq`, `CancelByTpSlTsClear`, `CancelByCannotAffordOrderCost`, `CancelByAdmin`.

**TP/SL/трейлінг позиції** `POST /v5/position/trading-stop` (docs/v5/position/trading-stop)
- Параметри: `category`, `symbol`, `tpslMode`, `positionIdx`, `takeProfit`, `stopLoss`, `trailingStop`, `activePrice`, `tpTriggerBy`/`slTriggerBy` (`LastPrice`, `IndexPrice`, `MarkPrice`), `tpSize`/`slSize`, `tpOrderType`/`slOrderType`, `tpLimitPrice`/`slLimitPrice`.
- `tpslMode: Full` — на всю позицію, лише `Market`; `Partial` — частина позиції, можна `Limit`.
- `"0"` у `takeProfit`/`stopLoss`/`trailingStop` — прибрати.
- `trailingStop` — **відстань у ціні**, не у відсотках. `activePrice` — трейлінг вмикається лише після досягнення цієї ціни.
- Система сама створює умовні ордери, коригує їх кількість під розмір позиції й **скасовує їх, коли позиція закрита**. Одностороння зміна TP або SL розриває пару TP/SL.
- retCode `34040` — без змін (те саме значення або бракує параметра).

**Інструменти** `GET /v5/market/instruments-info` (docs/v5/market/instrument)
- linear `lotSizeFilter`: `qtyStep`, `minOrderQty`, `maxOrderQty` (ліміт/PostOnly), `maxMktOrderQty` (ринковий), `minNotionalValue`; `priceFilter`: `tickSize`, `minPrice`, `maxPrice`.
- spot: `basePrecision`, `quotePrecision`, `minOrderAmt`; `minOrderQty`/`maxOrderQty`/`maxOrderAmt` застарілі (замість них `maxLimitOrderQty`, `maxMarketOrderQty`).
- `limit` 1–1000 (типово 500), сторінки через `cursor`; linear-символів уже понад 500. Spot без пагінації. Типово повертаються статуси `Trading` і `PendingOpen`.
- У Orbix `02-market-data.js` бере `limit=1000` без `cursor` — якщо символів стане більше 1000, решта не потрапить у список.

**Коди помилок** (docs/v5/error)

| Код | Значення |
|---|---|
| 10001 | помилка параметра |
| 10002 | час запиту поза `recv_window` |
| 10003 | недійсний ключ (ключ не від того середовища: mainnet/testnet/mainnet-demo/testnet-demo) |
| 10004 | невірний підпис |
| 10005 | немає дозволу для ключа |
| 10006 | перевищено ліміт запитів |
| 10016 | помилка сервера |
| 33004 | ключ прострочений |
| 34040 | TP/SL без змін |
| 110001 | ордера не існує |
| 110003 | ціна поза допустимим діапазоном |
| 110004 / 110007 / 110012 | недостатньо балансу / доступного балансу |
| 110009 | забагато умовних ордерів |
| 110017 | кількість після округлення = 0 |
| 110020 | понад 500 активних ордерів |
| 110043 | плече вже таке |
| 110072 | `orderLinkId` дублюється (ордер з таким ID уже є) |
| 110092 / 110093 | `triggerPrice` з неправильного боку від поточної ціни |
| 110094 | номінал нижче мінімуму |
| 170136 / 170137 / 170140 | spot: кількість нижче мінімуму / забагато знаків / сума нижче мінімуму |

## Binance USDⓈ-M Futures — Testnet / Demo

**Середовище** (general-info)
- ⚠️ Офіційна документація зараз називає тестовим REST `https://demo-fapi.binance.com` (Futures Demo Trading), а Orbix використовує `https://testnet.binancefuture.com`. За повідомленнями користувачів, ключі тепер створюються через Demo Trading. Змінювати адресу лише за погодженням з користувачем (межа з CLAUDE.md) і не під час 7-денного тесту.
- Підписані запити: HMAC SHA256 над `totalParams` (рядок запиту + тіло), обов'язковий `timestamp`, `recvWindow` типово 5000, заголовок `X-MBX-APIKEY`. Запит приймається, якщо `timestamp < serverTime + 1000` і `serverTime - timestamp ≤ recvWindow` (інакше `-1021`).
- Ліміти: `REQUEST_WEIGHT` (заголовок `X-MBX-USED-WEIGHT-1M`) і `ORDERS` (`X-MBX-ORDER-COUNT-10S`, `-1M`). HTTP 429 — ліміт; 418 — IP забанено за ігнорування 429.
- ⚠️ HTTP 503 «Unknown error, please check your request or try again later» і `-1007` — **статус виконання невідомий** (ордер міг пройти). Не надсилати новий ордер, спершу перевірити через `GET /fapi/v1/order` за `origClientOrderId` (так і робить `once` у `mirror.js`).

**Ордер** `POST /fapi/v1/order` (trade/rest-api)
- Обов'язкові: `symbol`, `side`, `type`, `timestamp`; LIMIT — `quantity`, `price` (+`timeInForce`); MARKET — `quantity`; STOP/TAKE_PROFIT — `quantity`, `price`, `stopPrice`; STOP_MARKET/TAKE_PROFIT_MARKET — `stopPrice` і `quantity` або `closePosition=true`; TRAILING_STOP_MARKET — `quantity`, `callbackRate` (`activationPrice` типово — поточна ціна).
- `newClientOrderId`: ≤36, регулярний вираз `^[\.A-Z\:/a-z0-9_-]{1,36}$`. ⚠️ Унікальний **лише серед відкритих ордерів** («A unique id among open orders»): виконаний ринковий ордер з тим самим id біржа прийме вдруге. На Bybit `orderLinkId` унікальний завжди (`110072`).
- `reduceOnly` не можна в hedge-режимі й разом з `closePosition`. `positionSide`: `BOTH` (one-way), `LONG`/`SHORT` (hedge, обов'язково).
- `newOrderRespType`: `ACK` (типово) або `RESULT` (Orbix просить `RESULT`, щоб отримати `executedQty`/`avgPrice`).
- Вага: 1 в ордерних лімітах 10 с і 1 хв, 0 в IP-ліміті.
- Умовні ордери (TP/SL, трейлінг) тепер ідуть через `POST /fapi/v1/algoOrder` (`algoType=CONDITIONAL`; типи `STOP_MARKET`, `TAKE_PROFIT_MARKET`, `STOP`, `TAKE_PROFIT`, `TRAILING_STOP_MARKET`). Зараз Orbix на Binance веде TP/SL на сервері (`native: false`), тож це важливо лише при переході на нативні TP/SL.

**Пошук ордера** `GET /fapi/v1/order`
- За `orderId` або `origClientOrderId`.
- ⚠️ Не знаходиться (→ `-2013`), якщо ордер `CANCELED`/`EXPIRED` **без виконання** і створений понад 3 дні тому, або будь-який ордер старший за 90 днів. Тобто `-2013` для старого ID ≠ «ордера ніколи не було» (стосується `byLink` → `null`).
- Відкриті ордери: вага 1 з `symbol`, 40 без нього.

**Рахунок і позиції** (account/rest-api)
- Orbix використовує `/fapi/v2/account` і `/fapi/v2/positionRisk`. Є `/fapi/v3/account` (вага 5), але в його `positions` немає `leverage` і `entryPrice`. Тож перехід на v3 не механічний.
- Плече: `POST /fapi/v1/leverage`.

**Ринкові дані** (market-data/rest-api)
- `exchangeInfo` (вага 1), фільтри символу: `PRICE_FILTER` (`minPrice`, `maxPrice`, `tickSize`), `LOT_SIZE` (`minQty`, `maxQty`, `stepSize`), `MARKET_LOT_SIZE`, `MIN_NOTIONAL` (`notional`), `PERCENT_PRICE` (`multiplierUp`, `multiplierDown`), `MAX_NUM_ORDERS`, `MAX_NUM_ALGO_ORDERS`. `pricePrecision`/`quantityPrecision` **не використовувати** замість `tickSize`/`stepSize`.
- Свічки: `limit` до 1500 (типово 500); вага 1 / 2 / 5 / 10 для [1,100) / [100,500) / [500,1000] / >1000.
- `premiumIndex`: `markPrice`, `indexPrice`, `lastFundingRate`, `nextFundingTime`, `time`.

**Коди помилок** (error-code)

| Код | Значення |
|---|---|
| -1003 | забагато запитів (або IP забанено) |
| -1007 | тайм-аут бекенду, **статус невідомий** |
| -1021 | `timestamp` поза `recvWindow` / на 1000 мс попереду сервера |
| -1022 | невірний підпис |
| -1102 | бракує обов'язкового параметра |
| -1111 | забагато знаків після коми |
| -2011 | скасування відхилено (ордера немає в книзі) |
| -2013 | ордера не існує |
| -2014 / -2015 | невірний формат ключа / ключ, IP чи дозволи |
| -2018 / -2019 | недостатньо балансу / маржі |
| -2021 | ордер спрацював би одразу |
| -2022 | reduceOnly відхилено (конфлікт з відкритими ордерами) |
| -2027 | перевищено макс. позицію при цьому плечі |
| -4014 | ціна не кратна `tickSize` |
| -4015 | недійсний client order id (>36 символів) |
| -4023 | кількість не кратна `stepSize` |
| -4061 | `positionSide` не відповідає режиму |
| -4116 | `clientOrderId` дублюється |
| -4118 | reduceOnly не пройшов (разом з ордером того ж боку відкрив би протилежну позицію) |
| -4131 | ціна контрагента поза `PERCENT_PRICE` |
| -4164 | номінал ордера менше 5 USDT (крім reduceOnly) |
| -5021 / -5022 | FOK не виконано / PostOnly не став мейкером |
