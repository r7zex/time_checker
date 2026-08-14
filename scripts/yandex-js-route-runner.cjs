#!/usr/bin/env node

/**
 * Minimal Node host for Yandex Maps JavaScript API 2.1 MultiRoute.
 *
 * The public API is normally loaded by a browser. Measurements do not render a
 * map, so this host supplies only the DOM surface needed by the official
 * loader and MultiRoute. Requests are still built and parsed by Yandex's own
 * JavaScript API bundle. The API key is read from the environment and is never
 * printed or persisted.
 */

const vm = require('node:vm')

const DEFAULT_REFERER = 'http://localhost:5173/'
const API_LOADER_URL = 'https://api-maps.yandex.ru/2.1/'
const YANDEX_API_HOST = 'api-maps.yandex.ru'
const USER_AGENT = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  'AppleWebKit/537.36 (KHTML, like Gecko)',
  'Chrome/151.0 Safari/537.36',
].join(' ')

function writeMessage(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

function safeError(error, apiKey) {
  return String(error?.stack || error?.message || error)
    .replaceAll(apiKey, '<API key>')
    .replace(/([?&](?:apikey|service-token)=)[^&\s)]+/gi, '$1<redacted>')
}

function readStandardInput() {
  return new Promise((resolve, reject) => {
    let value = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => { value += chunk })
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(value))
      } catch (error) {
        reject(new Error(`Invalid JSON input: ${error.message}`))
      }
    })
    process.stdin.on('error', reject)
  })
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName).toUpperCase()
    this.nodeType = 1
    this.style = Object.create(null)
    this.children = []
    this.childNodes = this.children
    this.attributes = Object.create(null)
    this.className = ''
    this.innerHTML = ''
    this.parentNode = null
    this.parentElement = null
    this.ownerDocument = globalThis.document
    this.offsetWidth = 0
    this.offsetHeight = 0
    this.clientWidth = 0
    this.clientHeight = 0
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value)
    this[name] = String(value)
  }

  getAttribute(name) {
    return this.attributes[name] ?? null
  }

  removeAttribute(name) {
    delete this.attributes[name]
  }

  addEventListener(name, callback) {
    this[`on${name}`] = callback
  }

  removeEventListener() {}

  appendChild(child) {
    child.parentNode = this
    child.parentElement = this
    this.children.push(child)
    return child
  }

  insertBefore(child) {
    return this.appendChild(child)
  }

  insertAdjacentElement(_position, child) {
    return this.appendChild(child)
  }

  removeChild(child) {
    this.children = this.children.filter((item) => item !== child)
    return child
  }

  cloneNode() {
    return new FakeElement(this.tagName)
  }

  getContext() {
    return null
  }

  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
    }
  }

  querySelector(selector) {
    const match = selector.match(/^script\[([^=]+)='([^']+)'\]$/)
    if (!match) return null
    return this.children.find(
      (child) =>
        child.tagName === 'SCRIPT' &&
        child.getAttribute(match[1]) === match[2],
    ) ?? null
  }

  querySelectorAll() {
    return []
  }
}

function installDomHost({ apiKey, referer }) {
  const cookies = new Map()

  function rememberYandexCookies(response) {
    const values = response.headers.getSetCookie?.() ?? []
    for (const value of values) {
      const pair = value.split(';', 1)[0]
      const separator = pair.indexOf('=')
      if (separator > 0) {
        cookies.set(pair.slice(0, separator), pair.slice(separator + 1))
      }
    }
  }

  function cookieHeader() {
    return [...cookies]
      .map(([name, value]) => `${name}=${value}`)
      .join('; ')
  }

  async function loadScript(element) {
    try {
      const scriptUrl = new URL(element.src)
      const isYandexApi = scriptUrl.hostname === YANDEX_API_HOST
      const response = await fetch(scriptUrl, {
        headers: {
          Accept: '*/*',
          Referer: referer,
          'User-Agent': USER_AGENT,
          'Sec-Fetch-Dest': 'script',
          'Sec-Fetch-Mode': 'no-cors',
          'Sec-Fetch-Site': 'cross-site',
          ...(isYandexApi && cookies.size
            ? { Cookie: cookieHeader() }
            : {}),
        },
      })
      if (isYandexApi) rememberYandexCookies(response)
      if (!response.ok) {
        const details = (await response.text()).slice(0, 300)
        throw new Error(`HTTP ${response.status}: ${details}`)
      }
      vm.runInThisContext(await response.text(), {
        filename: scriptUrl.href,
      })
      element.onload?.()
    } catch (error) {
      element.onerror?.(error)
    }
  }

  const head = new FakeElement('head')
  const appendChild = head.appendChild.bind(head)
  head.appendChild = (child) => {
    appendChild(child)
    if (child.tagName === 'SCRIPT' && child.src) void loadScript(child)
    return child
  }
  head.insertAdjacentElement = (_position, child) => head.appendChild(child)

  const loaderUrl = new URL(API_LOADER_URL)
  loaderUrl.searchParams.set('apikey', apiKey)
  loaderUrl.searchParams.set('lang', 'ru_RU')
  const document = {
    nodeType: 9,
    readyState: 'complete',
    compatMode: 'CSS1Compat',
    currentScript: { src: loaderUrl.href },
    head,
    body: new FakeElement('body'),
    documentElement: new FakeElement('html'),
    createElement: (tag) => new FakeElement(tag),
    createElementNS: (_namespace, tag) => new FakeElement(tag),
    createTextNode: (text) => ({
      nodeType: 3,
      data: String(text),
      textContent: String(text),
    }),
    addEventListener: (_name, callback) => setTimeout(callback, 0),
    removeEventListener() {},
    getElementById() { return null },
    getElementsByTagName(name) { return name === 'head' ? [head] : [] },
    querySelector: (selector) => head.querySelector(selector),
    querySelectorAll: () => [],
  }
  globalThis.document = document
  head.ownerDocument = document
  document.body.ownerDocument = document
  document.documentElement.ownerDocument = document

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      userAgent: USER_AGENT,
      platform: 'Win32',
      language: 'ru-RU',
      languages: ['ru-RU', 'ru'],
      maxTouchPoints: 0,
    },
  })
  Object.assign(globalThis, {
    window: globalThis,
    self: globalThis,
    top: globalThis,
    parent: globalThis,
    location: new URL(referer),
    HTMLElement: FakeElement,
    Element: FakeElement,
    Node: FakeElement,
    Image: FakeElement,
    getComputedStyle: () => ({
      getPropertyValue: () => '',
      display: 'block',
      position: 'static',
    }),
    requestAnimationFrame: (callback) =>
      setTimeout(() => callback(Date.now()), 0),
    cancelAnimationFrame: clearTimeout,
    matchMedia: () => ({
      matches: false,
      addListener() {},
      removeListener() {},
    }),
    screen: { width: 1920, height: 1080, colorDepth: 24 },
  })

  return {
    loaderUrl,
    rememberYandexCookies,
  }
}

async function loadYandexMaps(apiKey, referer) {
  const host = installDomHost({ apiKey, referer })
  const response = await fetch(host.loaderUrl, {
    headers: {
      Accept: '*/*',
      Referer: referer,
      'User-Agent': USER_AGENT,
      'Sec-Fetch-Dest': 'script',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'cross-site',
    },
  })
  host.rememberYandexCookies(response)
  if (!response.ok) {
    throw new Error(`Yandex JS API loader returned HTTP ${response.status}`)
  }
  vm.runInThisContext(await response.text(), { filename: 'yandex-js-api.js' })
  await new Promise((resolve, reject) => globalThis.ymaps.ready(resolve, reject))
  return globalThis.ymaps
}

function numericProperty(manager, name) {
  const property = manager.get(name)
  return typeof property?.value === 'number' ? property.value : null
}

function textProperty(manager, name) {
  const property = manager.get(name)
  return typeof property?.text === 'string' ? property.text : null
}

function summarizeRoute(route, alternative) {
  const segments = []
  route.getPaths().each((path) => {
    path.getSegments().each((segment) => {
      const type = segment.properties.get('type')
      const transports = segment.properties.get('transports')
      segments.push({
        type,
        durationSeconds:
          numericProperty(segment.properties, 'duration') ?? 0,
        transports: Array.isArray(transports) ? transports : [],
      })
    })
  })
  const transitSegments = segments.filter((segment) => segment.type === 'transport')
  const transportTypes = new Set()
  const transitLines = new Set()
  for (const segment of transitSegments) {
    for (const transport of segment.transports) {
      if (typeof transport.type === 'string') transportTypes.add(transport.type)
      if (typeof transport.name === 'string') transitLines.add(transport.name)
    }
  }
  const metroOnlyVerified =
    transitSegments.length > 0 &&
    transitSegments.every(
      (segment) =>
        segment.transports.length > 0 &&
        segment.transports.every(
          (transport) => transport.type === 'underground',
        ),
    )
  return {
    alternative,
    durationSeconds: numericProperty(route.properties, 'duration'),
    durationText: textProperty(route.properties, 'duration'),
    lengthMeters: numericProperty(route.properties, 'distance'),
    segmentCount: segments.length,
    transitSegmentCount: transitSegments.length,
    walkingSeconds: segments
      .filter((segment) => segment.type === 'walk')
      .reduce((total, segment) => total + segment.durationSeconds, 0),
    transferSeconds: segments
      .filter((segment) => segment.type === 'transfer')
      .reduce((total, segment) => total + segment.durationSeconds, 0),
    transitSeconds: transitSegments.reduce(
      (total, segment) => total + segment.durationSeconds,
      0,
    ),
    transportTypes: [...transportTypes].sort(),
    transitLines: [...transitLines].sort(),
    metroOnlyVerified,
  }
}

function measureRoute(ymaps, request) {
  return new Promise((resolve, reject) => {
    const referencePoints = Array.isArray(request.referencePoints)
      ? request.referencePoints
      : [request.origin, request.destination]
    const multiRoute = new ymaps.multiRouter.MultiRoute(
      {
        referencePoints,
        params: {
          routingMode: request.routingMode || 'masstransit',
          reverseGeocoding: false,
          results: 3,
          ...(Array.isArray(request.viaIndexes)
            ? { viaIndexes: request.viaIndexes }
            : {}),
        },
      },
      {
        routeActiveVisible: false,
        routeVisible: false,
        wayPointVisible: false,
      },
    )
    const timeout = setTimeout(
      () => reject(new Error(`Route timed out: ${request.id}`)),
      45_000,
    )
    multiRoute.model.events.add('requestsuccess', () => {
      clearTimeout(timeout)
      const routes = []
      multiRoute.getRoutes().each((route) => {
        routes.push(summarizeRoute(route, routes.length + 1))
      })
      resolve(routes)
    })
    multiRoute.model.events.add('requestfail', (event) => {
      clearTimeout(timeout)
      const details = event?.get?.('error')
      reject(new Error(`Yandex route failed: ${details || request.id}`))
    })
  })
}

async function main() {
  const apiKey = (
    process.env.YANDEX_MAPS_API_KEY ||
    process.env.YANDEX_ROUTER_API_KEY ||
    ''
  ).trim()
  if (!apiKey) throw new Error('Set YANDEX_MAPS_API_KEY.')
  const input = await readStandardInput()
  const referer = input.referer || DEFAULT_REFERER
  const requests = Array.isArray(input.requests) ? input.requests : []
  const ymaps = await loadYandexMaps(apiKey, referer)
  for (const request of requests) {
    writeMessage({ event: 'request', id: request.id })
    const routes = await measureRoute(ymaps, request)
    writeMessage({ event: 'result', id: request.id, routes })
  }
}

main().catch((error) => {
  const apiKey =
    process.env.YANDEX_MAPS_API_KEY ||
    process.env.YANDEX_ROUTER_API_KEY ||
    ''
  writeMessage({ event: 'error', error: safeError(error, apiKey) })
  process.exitCode = 1
})
