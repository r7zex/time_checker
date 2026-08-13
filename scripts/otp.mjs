import { access, copyFile, mkdir, rename, stat } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

// Newer OTP releases removed the travel-time surface API. Version 2.4 is the
// last Java 17 release that exposes the one-to-many GeoTIFF surface we need.
const OTP_VERSION = '2.4.0'
const ROOT = new URL('../', import.meta.url)
const RUNTIME_DIRECTORY = new URL('../otp/runtime/', import.meta.url)
const DATA_DIRECTORY = new URL('../otp/data/', import.meta.url)
const JAR = new URL(`otp-${OTP_VERSION}-shaded.jar`, RUNTIME_DIRECTORY)
const OSM = new URL('Moscow.osm.pbf', DATA_DIRECTORY)
const GRAPH = new URL('graph.obj', DATA_DIRECTORY)
const JAR_URL = `https://repo1.maven.org/maven2/org/opentripplanner/otp/${OTP_VERSION}/otp-${OTP_VERSION}-shaded.jar`
const OSM_URL = 'https://download.bbbike.org/osm/bbbike/Moscow/Moscow.osm.pbf'
const MEMORY = process.env.OTP_MEMORY ?? '8G'
const ROOT_PATH = fileURLToPath(ROOT)
const DATA_DIRECTORY_PATH = fileURLToPath(DATA_DIRECTORY)
const JAR_PATH = fileURLToPath(JAR)

async function exists(file) {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

async function download(url, destination, label) {
  if (await exists(destination)) {
    const info = await stat(destination)
    console.log(`${label} already exists (${Math.round(info.size / 1024 / 1024)} MB).`)
    return
  }
  console.log(`Downloading ${label}…`)
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || !response.body) {
    throw new Error(`${label}: HTTP ${response.status} ${response.statusText}`)
  }
  const temporary = new URL(`${destination.href}.part`)
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary))
  await rename(temporary, destination)
  console.log(`${label} downloaded.`)
}

function javaMajorVersion() {
  const result = spawnSync('java', ['-version'], { encoding: 'utf8', shell: false })
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  const match = /version "(\d+)/.exec(output)
  return match ? Number(match[1]) : null
}

function assertJava() {
  const version = javaMajorVersion()
  if (version === null || version < 17) {
    throw new Error(
      'OpenTripPlanner 2.4.0 requires Java 17+. Install Temurin/OpenJDK 17 and make sure `java -version` sees it.',
    )
  }
}

function runNodeScript(relativePath) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(relativePath, ROOT))], {
    cwd: ROOT_PATH,
    stdio: 'inherit',
  })
  if (result.status !== 0) throw new Error(`${relativePath} failed`)
}

async function copyConfiguration() {
  await mkdir(DATA_DIRECTORY, { recursive: true })
  for (const name of ['otp-config.json', 'router-config.json', 'build-config.json']) {
    await copyFile(new URL(`../otp/${name}`, import.meta.url), new URL(name, DATA_DIRECTORY))
  }
}

async function setup() {
  await mkdir(RUNTIME_DIRECTORY, { recursive: true })
  await mkdir(DATA_DIRECTORY, { recursive: true })
  await copyConfiguration()
  await download(JAR_URL, JAR, `OpenTripPlanner ${OTP_VERSION}`)
  await download(OSM_URL, OSM, 'BBBike Moscow OpenStreetMap extract')
  runNodeScript('scripts/generate-metro-gtfs.mjs')
  console.log('OTP input data is ready. Next: npm run otp:build')
}

function runJava(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'java',
      [`-Xmx${MEMORY}`, '-jar', JAR_PATH, ...args, DATA_DIRECTORY_PATH],
      { cwd: ROOT_PATH, stdio: 'inherit', shell: false },
    )
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`OpenTripPlanner stopped by signal ${signal}`))
      } else if (code === 0) {
        resolve()
      } else {
        reject(new Error(`OpenTripPlanner exited with code ${code ?? 1}`))
      }
    })
  })
}

async function build() {
  assertJava()
  if (!(await exists(JAR)) || !(await exists(OSM))) {
    throw new Error('OTP is not set up. Run: npm run otp:setup')
  }
  await copyConfiguration()
  runNodeScript('scripts/generate-metro-gtfs.mjs')
  await runJava(['--build', '--save'])
}

async function serve() {
  assertJava()
  if (!(await exists(GRAPH))) {
    throw new Error('OTP graph is missing. Run: npm run otp:build')
  }
  await copyConfiguration()
  await runJava(['--load'])
}

const command = process.argv[2] ?? 'start'
try {
  if (command === 'setup') await setup()
  else if (command === 'build') await build()
  else if (command === 'serve') await serve()
  else if (command === 'start') {
    if (!(await exists(JAR)) || !(await exists(OSM))) await setup()
    if (!(await exists(GRAPH))) {
      console.log('No graph found; building it once before startup…')
      await build()
    } else {
      await serve()
    }
  } else {
    throw new Error(`Unknown command: ${command}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
