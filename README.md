# AI Platform Core

Единое платформенное ядро для AI-продуктов: Government Intelligence, Grant AI, Agro AI, Tourism AI, Education AI и других вертикалей.

## Architecture Truth v0.50

`ai-platform-core` является production monorepo:

```text
AI Platform Core
│
├── apps/
│   └── web              # пользовательские интерфейсы
│
├── packages/
│   ├── core             # ядро платформы
│   ├── schemas          # общие контракты данных
│   ├── runtime          # runtime компоненты
│   └── observability    # метрики и контроль
│
├── ingestion            # источники и адаптеры
├── evidence              # доказательный слой
├── learning              # управляемое улучшение системы
├── Supabase              # data plane
└── Vercel                # deployment layer
```

## Platform Flow

```text
Request
  ↓
Planner
  ↓
Capability Resolution
  ↓
Orchestration
  ↓
Ingestion / Evidence
  ↓
Result
  ↓
Learning Loop
```

## Quality Gates

Перед попаданием в production проходят:

- strict types
- workspace build
- tests
- security checks
- migration validation
- replay validation
- deployment verification

## Development

```bash
npm ci
npm run verify
npm run build:info
npm run platform:verify
```

## Deployment

```text
GitHub
  ↓
GitHub Actions
  ↓
Vercel Preview
  ↓
Production

Supabase
  ↓
Database + Storage + Intelligence Data

Hugging Face compatible runtime
  ↓
AI models and evaluation workloads
```

## Core Principles

- Evidence before conclusions.
- Modular capabilities instead of duplicated products.
- Controlled learning instead of uncontrolled self-modification.
- Versioned contracts between platform layers.
- Reproducible builds.

## Current Version

```text
AI Platform Core v0.50.0
```
