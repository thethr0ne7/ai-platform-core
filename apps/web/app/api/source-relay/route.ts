import { createHash, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const EXPECTED_TOKEN_HASH = '2293a393e8c637c9de4ab67fc882af3ecd2e18222d70ef50495fde2b284a76e5'
const MAX_RESPONSE_BYTES = 2_500_000
const ALLOWED_HOST_SUFFIXES = ['.gov.ru', '.kbr.ru']
const ALLOWED_HOSTS = new Set([
  'government.ru',
  'www.government.ru',
  'publication.pravo.gov.ru',
  'economy.gov.ru',
  'minfin.gov.ru',
  'minpromtorg.gov.ru',
  'mcx.gov.ru',
  'rosreestr.gov.ru',
  'zakupki.gov.ru',
  'torgi.gov.ru',
  'gisp.gov.ru',
  'frprf.ru',
  'www.frprf.ru',
  'fasie.ru',
  'www.fasie.ru',
  'exportcenter.ru',
  'www.exportcenter.ru',
  'myexport.exportcenter.ru',
  'xn--90ab5f.xn--p1ai',
  'www.xn--90ab5f.xn--p1ai',
  'xn--l1agf.xn--p1ai',
  'www.xn--l1agf.xn--p1ai',
  'xn--07-9kcqjffxnf3b.xn--p1ai',
  'www.xn--07-9kcqjffxnf3b.xn--p1ai',
  'frp-kbr.ru',
  'www.frp-kbr.ru',
  'visit.kbr.ru',
])

const USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'

export async function POST(request: NextRequest) {
  const token = request.headers.get('x-source-relay-token')?.trim() ?? ''
  if (!validToken(token)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let target: URL
  try {
    const body = (await request.json()) as { url?: unknown }
    if (typeof body.url !== 'string') throw new Error('url_required')
    target = validateTarget(body.url)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'invalid_request' },
      { status: 400 },
    )
  }

  const startedAt = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 45_000)

  try {
    const response = await fetch(target, {
      redirect: 'follow',
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,text/plain;q=0.7,*/*;q=0.3',
        'accept-language': 'ru-RU,ru;q=0.9,en;q=0.6',
        'cache-control': 'no-cache',
      },
    })

    const finalUrl = validateTarget(response.url || target.toString()).toString()
    const contentType = response.headers.get('content-type') ?? ''
    const bytes = await readLimited(response, MAX_RESPONSE_BYTES)

    return NextResponse.json(
      {
        ok: response.ok,
        status: response.status,
        requestedUrl: target.toString(),
        finalUrl,
        contentType,
        latencyMs: Date.now() - startedAt,
        bodyBase64: Buffer.from(bytes).toString('base64'),
        truncated: bytes.byteLength >= MAX_RESPONSE_BYTES,
      },
      { status: response.ok ? 200 : 502, headers: { 'cache-control': 'no-store' } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      {
        ok: false,
        status: 0,
        requestedUrl: target.toString(),
        finalUrl: target.toString(),
        contentType: '',
        latencyMs: Date.now() - startedAt,
        error: message,
      },
      { status: 502, headers: { 'cache-control': 'no-store' } },
    )
  } finally {
    clearTimeout(timer)
  }
}

function validToken(token: string): boolean {
  if (!token) return false
  const actual = createHash('sha256').update(token).digest()
  const expected = Buffer.from(EXPECTED_TOKEN_HASH, 'hex')
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected)
}

function validateTarget(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== 'https:') throw new Error('https_required')

  const hostname = url.hostname.toLowerCase()
  const allowed = ALLOWED_HOSTS.has(hostname) || ALLOWED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  if (!allowed) throw new Error('host_not_allowed')
  if (
    hostname === 'localhost' ||
    hostname === '::1' ||
    /^(?:127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(hostname)
  ) {
    throw new Error('private_network_target_rejected')
  }

  url.hash = ''
  return url
}

async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (!value) continue
    const remaining = maxBytes - total
    if (remaining <= 0) break
    const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value
    chunks.push(chunk)
    total += chunk.byteLength
    if (total >= maxBytes) break
  }
  await reader.cancel().catch(() => undefined)

  const combined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return combined
}
