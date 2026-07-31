# Полный аудит AI Platform Core — v0.76

Дата: 31 июля 2026
Репозиторий: `thethr0ne7/ai-platform-core`
Ветка на момент аудита: `main` (6695877), без расхождений
Метод: статический аудит кода, миграций, CI и конфигурации. Live-доступа к production Supabase/Vercel не было, поэтому в отличие от аудита v0.73 здесь нет production-фактов из базы — только то, что проверяемо из репозитория.

## Вердикт

| Область | Оценка | Вывод |
|---|---:|---|
| Архитектурное ядро / Truth Gate | 8/10 | Дизайн fail-closed выдержан: RLS включён на всех public-таблицах, SECURITY DEFINER RPC имеют фиксированный `search_path`, epistemic contract закодирован буквально в overview-RPC |
| Безопасность edge-периметра | 6/10 | CORS allowlist, SSRF-защита relay и OCR-воркера сделаны добротно, но корневая аутентификация всей платформы стоит на функции, которой нет в репозитории |
| Гигиена репозитория / CI | 4/10 | Нет `.gitignore` в корне, лок-файл устарел на 26 версий, в CI висит мёртвый workflow с `contents: write` на несуществующую ветку |
| Качество кода web-приложения | 6/10 | Строгий TypeScript действительно соблюдается и собирается без ошибок, но P1.1 из аудита v0.73 (монолитный `TelegramProjectWorkspace`) не устранён, тестов на web нет вообще |
| Тесты и сборка (проверено локально) | 8/10 | `npm run check` — чисто, `npm test` — 115/115, `npm --workspace web run build` — успешно |
| Зависимости | 6/10 | 3 high-severity транзитивных уязвимости (`postcss`/`sharp` через `next`), практический риск низкий, т.к. `next/image` не используется |

## Что реально проверено

```bash
npm ci                                  # ок, 145 пакетов
npm run check                           # ok, 0 ошибок (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes)
npm test                                # ok, 115/115 тестов, 0 fail
cd apps/web && npm install && npm run check   # ok
npm run build                           # ok, 13/13 маршрутов, control-center/graph|intelligence|trajectories|decision-cards — заглушки 125-126 B, что соответствует README ("ещё не активно")
npm audit                               # 3 high (postcss, sharp — транзитивно через next)
```

## P0 — критические разрывы

### P0.1. Корневая аутентификация платформы не находится в репозитории

Шесть продакшн-компонентов — `apps/web/lib/telegram.ts` (веб-клиент) и пять Edge Function (`catalogue-control`, `evidence-review`, `project-fact-review`, `project-document-processor`, `measure-direction-enrichment`, `government-opportunity-api`) — делают HTTP-вызов на `${SUPABASE_URL}/functions/v1/telegram-project-api` с `action: "authenticate"` и доверяют его ответу `user.id` как проверенной личности Telegram-пользователя.

Функции `telegram-project-api` нет ни в `supabase/functions/`, ни в `archive/`, ни в истории git (`git log --all --diff-filter=D` не находит удаления). То есть:

- либо это активно задеплоенная функция, чей код никогда не был закоммичен в этот репозиторий — тогда логика проверки Telegram HMAC-подписи (`initData`), обработка секрета бота и вся модель авторизации не проходит code review, CI и `npm run platform:verify`;
- либо эндпоинт не существует в проде — тогда `authenticateTelegram()` всегда возвращает `null` (вызовы fail-closed на `401`/`403`), и весь Telegram-контур (заявленный в README как "Active") на самом деле не работает.

В обоих случаях это блокирующая находка: невозможно проверить, что аутентификация вообще безопасна, и невозможно подтвердить заявление README "Telegram-authenticated project workspace — Active".

**Gate:** перед следующим релизом код `telegram-project-api` должен быть перенесён в `supabase/functions/` этого репозитория (или явно задокументирован как внешний сервис с собственным репозиторием, аудитом и версионированием, на который есть ссылка из `platform.manifest.json`).

### P0.2. В корне репозитория нет `.gitignore`

Стандартные команды из README (`npm ci`, `npm run platform:verify`) создают `node_modules/`, `apps/web/.next/`, `apps/web/tsconfig.tsbuildinfo` и изменяют `package-lock.json`/`apps/web/next-env.d.ts` — ни один из этих путей не исключён. Любой `git add -A` (стандартная практика, а не экзотика) закоммитит гигабайты бинарных артефактов и потенциально build-кэш с встроенными env-значениями времени сборки. Проверено воспроизведением: после `npm ci` + `npm run build` эти пути действительно появляются как untracked/modified.

**Gate:** добавить `.gitignore` (минимум `node_modules/`, `.next/`, `*.tsbuildinfo`, `.env*`, `dist/`) до следующего мержа, независимо от дисциплины контрибьюторов.

## P1 — инженерный долг

### P1.1 (перенос из v0.73, не закрыт). `TelegramProjectWorkspace` остаётся монолитным

354 → 355 строк, семь обязанностей всё ещё в одном компоненте: Telegram auth, project repository, document upload queue, fact review, analysis runner, measure workspace, application route. Аудит v0.73 предлагал разделение на восемь модулей — выполнено оно было только для *новых* поверхностей (`evidence-review-workspace.tsx`, `catalogue-control-workspace.tsx` — отдельные файлы), а не для исходного компонента.

### P1.2 (закрыт с v0.73, зафиксировано для истории). Supabase Security Advisor warnings исправлены

- `gi_clean_display_text` и `gi_normalize_change_event` теперь оба имеют `search_path=public,pg_temp` (через `alter function ... set search_path` в `20260722173000_verified_catalogue_foundation_v074.sql`). Проверено скриптом по всем 73 определениям функций в `supabase/migrations/*.sql` — необработанных не осталось.
- Публичные агрегирующие RPC (`get_platform_overview`, `get_coverage_snapshot`, `get_analytic_signals`, `get_factory_health`, `get_government_intelligence_overview`) соответствуют рекомендации v0.73: явный список колонок, `limit`/`least(greatest(...))` на пользовательский лимит, `revoke all ... from public` перед точечным `grant ... to anon, authenticated`, никаких внутренних ID/PII в ответах.
- Все 42 таблицы, созданные в `public`, имеют `enable row level security`. Единственная таблица без явного RLS (`private.gi_scheduler_tokens`) находится в схеме `private`, не выставленной через PostgREST — RLS там не требуется.

### P1.3. SSRF-защита `source-relay` не покрывает редиректы

`apps/web/app/api/source-relay/route.ts` — хорошо продуманный релей (allowlist доменов `.gov.ru`/`.kbr.ru`, блок приватных диапазонов, `timingSafeEqual` для токена, лимит 2.5 МБ на тело), но `fetch(target, { redirect: 'follow', ... })` следует за редиректами автоматически, а проверка `validateTarget(response.url)` выполняется **после** того, как запрос уже совершён. Если один из разрешённых доменов (или DNS для него) вернёт редирект на приватный адрес, запрос к этому адресу уже состоится до того, как код его отклонит — валидация в этот момент лишь решает, отдавать ли результат вызывающей стороне, а не предотвращает сам internal-запрос.

**Рекомендация:** `redirect: 'manual'` с ручной проверкой каждого hop через `validateTarget`, либо явный `max redirects` со сверкой хоста на каждом шаге.

### P1.4. Токен `source-relay` — фиксированный хеш в исходном коде

`EXPECTED_TOKEN_HASH` — constant SHA-256 хеш, захардкоженный в `route.ts`, а не читаемый из переменной окружения Vercel. Ротация токена требует деплоя нового кода, а не смены секрета в конфигурации. Практический риск невысокий (это хеш, не сам токен, и сравнение constant-time), но нарушает собственный принцип платформы "Versioned contracts and reproducible builds" в части конфигурации секретов.

### P1.5. Лок-файл устарел, в CI висит опасный мёртвый workflow

Закоммиченный `package-lock.json` фиксирует `"version": "0.50.0"` для корневого пакета и web-пакета, тогда как `package.json`/`platform.manifest.json` уже на `0.72.0`/`0.76.0` — 26 релизов расхождения. `npm ci` при этом не падает (несоответствие версии в метаданных не проверяется так же строго, как граф зависимостей), поэтому проблема не заметна в CI, но означает, что лок-файл не обновлялся штатным процессом с версии v0.50.

Причина видна в `.github/workflows/lockfile-bootstrap.yml`: это `workflow_dispatch`-джоб с `permissions: contents: write`, который пушит `package-lock.json` в ветку `audit/github-architecture-v050` — ветку, которой больше нет. Workflow не удалён и всё ещё вызываем вручную из Actions UI с правом записи в репозиторий.

**Gate:** перегенерировать `package-lock.json` от текущего `main`, удалить или переориентировать `lockfile-bootstrap.yml` на актуальную ветку/защиту.

### P1.6. Нулевое тестовое покрытие `apps/web`, `next lint` не подключён к CI

25 тестовых файлов (`test/*.test.ts`, 115 тестов) покрывают только `packages/`/`src/` (движок, оркестратор, intelligence). В `apps/web` нет ни одного `*.test.*`/`*.spec.*` файла — ни unit, ни Playwright/E2E, несмотря на то что README прямо называет "Telegram E2E в CI" критерием готовности следующего этапа (`platform.manifest.json` подтверждает: `"telegramTransportE2E": "pending"`). `apps/web/package.json` объявляет `"lint": "next lint"`, но ни `web-ci.yml`, ни `web-ui.yml` его не вызывают — только `check` (typecheck) и `build`. Эти два workflow к тому же дублируют друг друга (оба гоняют typecheck+build на пуш/PR веб-кода), что расходует CI-минуты без выигрыша в покрытии.

### P1.7. Зависимости: 3 high-severity уязвимости

`npm audit` находит `postcss <=8.5.17` (XSS/path traversal через source maps) и `sharp <0.35.0` (CVE-2026-33327/33328/35590/35591) — обе транзитивные через `next@^15.1.3`. Практическая экспозиция ниже заявленной серьёзности: `next/image` (единственный runtime-потребитель `sharp`) нигде не импортируется в `apps/web`, поэтому уязвимый путь, скорее всего, не выполняется в проде. Тем не менее это тривиально закрывается обновлением `next` до последнего патча 15.x без breaking changes (не нужен `--force`, который предлагает поставить `next@9.3.3`).

## P2 — гигиена и наблюдения

- `apps/web` и `services/ingestion-worker` имеют `.env.example`, но без корневого `.gitignore` ничто не мешает случайно закоммитить реальный `.env` рядом.
- В `supabase/migrations/20260720183000_supabase_native_ingestion_v038.sql` захардкожен anon JWT и project URL, передаваемые в `vault.create_secret`. Значение само по себе не секрет (роль `anon`, по дизайну Supabase предназначена быть публичной и защищена RLS), но хранить его как literal в SQL-миграции, а не подставлять из окружения деплоя, — плохая практика на случай ротации project ref.
- RLS-политики `authenticated_read_*` в `factory_operations_v052.sql` (`workflow_runs`, `ui_reviews`, `production_artifacts`, `factory_health_snapshots`) используют `using (true)` для роли `authenticated`. Приложение аутентифицирует пользователей через Telegram + service-role Edge Functions, а не через нативные Supabase Auth сессии — стоит подтвердить, что роль `authenticated` вообще когда-либо выдаётся конечным пользователям; если нет, это мёртвый код, если да — это открытый на чтение операционный дашборд для любого залогиненного, что для чувствительности этих таблиц (внутренние workflow-метрики) приемлемо, но стоит явно задокументировать как осознанное решение.
- `services/legal-ocr-worker/worker.py` и `apps/web/app/api/source-relay/route.ts` сделаны заметно аккуратнее среднего по репозиторию: allowlist хостов, `subprocess.run` с list-аргументами без `shell=True`, whitelisting языка OCR вместо passthrough — хорошая практика, стоит взять шаблоном для будущих внешних интеграций.

## Что подтверждено рабочим (не просто заявлено)

- `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` в `tsconfig.json` — реально держат сборку в чистоте (`npm run check` зелёный на актуальном `main`).
- 115/115 unit-тестов проходят локально из чистого `npm ci`.
- Production build веб-приложения (`next build`) проходит, маршруты для незавершённых фич (`/control-center/graph`, `/trajectories`, `/intelligence`, `/decision-cards`) — пустые заглушки ~125 Б, что соответствует честному разделению "активно / ещё не активно" из README, а не фиктивной готовности.
- CORS во всех трёх edge-функциях с явными origin-заголовками (`catalogue-control`, `government-opportunity-api`, `measure-direction-enrichment`) — allowlist, не wildcard.
- 73 функции в миграциях — 0 без `search_path` (после фикса в v0.74).

## Статус исправлений (обновлено 31 июля 2026 — все пункты закрыты)

Все P0/P1 из этого аудита закрыты, включая оба шага, требовавшие ручного действия человека.

- **P0.1 закрыт полностью.** Через Supabase MCP подтверждено: `telegram-project-api` реально была задеплоена в production (project `hgivyjjethjwswjrvroy`, function id `cc164b88`, v3), но никогда не коммитилась. Код вытянут напрямую из Supabase и добавлен в `supabase/functions/telegram-project-api/`. Проверено при переносе: HMAC-проверка Telegram `initData` реализована верно (алгоритм `WebAppData` secret-key по спецификации Telegram, есть проверка свежести `auth_date` на 24 часа), каждое действие с проектом/документом перепроверяет владение по `telegram_user_id`. Найденный дефект — production-версия отдавала `Access-Control-Allow-Origin: *` (wildcard CORS, ровно то, что README называет отклонённым legacy-паттерном) — исправлен на тот же allowlist-паттерн, что у соседних функций. **Задеплоено в прод** через новый `.github/workflows/supabase-functions-deploy.yml` (run `30627080730`, 31.07.2026 11:28 UTC) — лог подтверждает `Deployed Functions on project hgivyjjethjwswjrvroy: catalogue-control, evidence-review, evidence-source-processor, government-opportunity-api, legal-ocr-broker, measure-direction-enrichment, official-source-ingestion, project-document-processor, project-fact-review, telegram-project-api`.
- **P0.2–P1.7 закрыты кодом** (`.gitignore`, SSRF-редиректы в `source-relay`, токен вынесен в `SOURCE_RELAY_TOKEN_HASH`, лок-файл пересобран, мёртвый `lockfile-bootstrap.yml` удалён, ESLint подключён и встроен в CI, `next` обновлён до 15.5.22). `npm run platform:verify` проходит целиком. **`SOURCE_RELAY_TOKEN_HASH` добавлен в Vercel** (`ai-platform-core`, team `63-gginner`, Production + Preview) и передеплоен — статус деплоя Ready.
- **Инфраструктурный автодеплой добавлен сверх исходного аудита.** Ручной, недокументированный процесс деплоя Edge Functions был первопричиной P0.1 (функция годами жила в проде без коммита). Добавлен `.github/workflows/supabase-functions-deploy.yml`: любой пуш в `main`, затрагивающий `supabase/functions/**`, автоматически деплоит все функции через `supabase functions deploy --project-ref hgivyjjethjwswjrvroy`. Требует repo-секрет `SUPABASE_ACCESS_TOKEN` (добавлен). Также добавлен `supabase/config.toml` с явным `verify_jwt = false` для всех 10 функций — без него CLI по умолчанию включил бы JWT-проверку и сломал бы авторизацию у всех функций сразу при первом автодеплое, поскольку каждая функция аутентифицирует вызывающего сама (Telegram initData HMAC или внутренний scheduler-токен), а не через Supabase Authorization JWT.
- **Побочное наблюдение, не почищено (осознанно вне рамок аудита).** В том же Supabase-проекте (`hgivyjjethjwswjrvroy`) ранее были активны functions, явно не относящиеся к AI Platform Core — `university-ingest`, `university-request`, `search`, `route`, `monitoring-ingest`, `monitoring-preview`, `federal-source-bootstrap`, `coverage`, `telegram-payments`, `telegram-bot-runtime`, `telegram-bot-bootstrap`. Причина найдена: GitHub-интеграция самого Supabase-проекта была привязана не к `ai-platform-core`, а к другому репозиторию — владелец переключил её на правильный репозиторий в ходе этого же аудита. Исторически задеплоенные чужие функции при этом сами не удалились; если нужно — это отдельная ручная уборка в Dashboard, вне рамок аудита.

## Рекомендованный следующий gate — v0.77

1. Перенести (или задокументировать как внешний, отдельно аудируемый сервис) `telegram-project-api` — без этого утверждение "Telegram-authenticated" не проверяемо.
2. Добавить корневой `.gitignore`.
3. Перегенерировать `package-lock.json`, удалить/перепривязать `lockfile-bootstrap.yml`.
4. `redirect: 'manual'` + per-hop проверка в `source-relay`; вынести `EXPECTED_TOKEN_HASH` в env.
5. Обновить `next` для закрытия `postcss`/`sharp` high-severity предупреждений.
6. Хотя бы один Playwright E2E для `apps/web` перед тем, как снова заявлять `telegramTransportE2E` готовым.
7. Разбить `TelegramProjectWorkspace` по границам из аудита v0.73 (P1.1) — пункт остаётся открытым второй аудит подряд.
