# AI Platform Core

Единое платформенное ядро для независимых AI-продуктов: PROIDU, Grant AI, Agro AI, Tourism AI, Education AI и Government Intelligence.

## Принцип

Каждый продукт остаётся отдельным приложением и репозиторием. `ai-platform-core` предоставляет только переиспользуемые контракты, реестры возможностей, оркестрацию, health checks и архитектурные quality gates.

## Первый vertical slice

`product request → product registry → capability resolution → orchestrator → result`

## Быстрый запуск

```bash
npm install
npm run check
npm run dev
```

После запуска:

- `GET /health` — статус ядра;
- `GET /products` — зарегистрированные продукты;
- `GET /capabilities` — общие возможности платформы.

## Структура

```text
src/
  contracts.ts
  registry.ts
  orchestrator.ts
  server.ts
platform.manifest.json
```

## Границы

В ядро не помещаются продуктовые экраны, тексты, бизнес-правила поступления, грантов, агротуризма или других вертикалей. Они подключаются снаружи через стабильные контракты.
