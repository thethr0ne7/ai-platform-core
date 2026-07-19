# Reproducible execution example

## 1. Install and start

```bash
npm install
npm run dev
```

The service listens on `http://localhost:3000` by default.

## 2. Check readiness

```bash
curl --fail http://localhost:3000/health/ready
```

Expected shape:

```json
{
  "status": "ready",
  "products": 6,
  "actions": 1
}
```

## 3. Execute the foundation action

```bash
curl --fail \
  --request POST \
  --header "content-type: application/json" \
  --data '{"productId":"proidu","action":"system.echo","payload":{"message":"hello"}}' \
  http://localhost:3000/v1/execute
```

Expected shape:

```json
{
  "ok": true,
  "requestId": "generated UUID",
  "traceId": "generated UUID",
  "productId": "proidu",
  "action": "system.echo",
  "durationMs": 0,
  "capabilitiesUsed": ["orchestration"],
  "data": {
    "message": "hello"
  }
}
```

`requestId`, `traceId`, and `durationMs` are generated at runtime and will differ.

## 4. Verify an expected rejection

```bash
curl \
  --request POST \
  --header "content-type: application/json" \
  --data '{"productId":"grant-ai","action":"system.echo","payload":{}}' \
  http://localhost:3000/v1/execute
```

Expected error code:

```json
{
  "ok": false,
  "error": {
    "code": "PRODUCT_NOT_ACTIVE"
  }
}
```
