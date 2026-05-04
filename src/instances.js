import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import path from 'path'
import fs from 'fs'
import axios from 'axios'
import QRCode from 'qrcode'

const instances = new Map()
const SESSIONS_DIR = process.env.SESSIONS_DIR || './sessions'

fs.mkdirSync(SESSIONS_DIR, { recursive: true })

async function notifyWebhook(webhookUrl, event, data) {
  if (!webhookUrl) return
  try {
    await axios.post(webhookUrl, { event, data }, { timeout: 5000 })
  } catch (_) {}
}

export async function createInstance(name, webhookUrl = null) {
  if (instances.has(name)) {
    return { error: 'Instance already exists', instance: name }
  }

  const authDir = path.join(SESSIONS_DIR, name)
  fs.mkdirSync(authDir, { recursive: true })

  const instance = {
    qrCode: null,
    qrBase64: null,
    status: 'connecting',
    webhookUrl,
    socket: null,
  }

  instances.set(name, instance)

  await connectInstance(name)

  return { success: true, instance: name, status: 'connecting' }
}

export async function connectInstance(name) {
  const instance = instances.get(name)
  if (!instance) return

  const authDir = path.join(SESSIONS_DIR, name)
  const { state, saveCreds } = await useMultiFileAuthState(authDir)
  const { version } = await fetchLatestBaileysVersion()

  const logger = pino({ level: 'silent' })

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    logger,
    browser: ['WPP-API', 'Chrome', '120.0.0'],
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 30000,
  })

  instance.socket = sock

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      instance.qrCode = qr
      instance.status = 'qr'
      try {
        instance.qrBase64 = await QRCode.toDataURL(qr)
      } catch (_) {}
      await notifyWebhook(instance.webhookUrl, 'QRCODE_UPDATED', {
        instance: name,
        qrcode: { base64: instance.qrBase64, code: qr },
      })
    }

    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut

      instance.status = shouldReconnect ? 'connecting' : 'disconnected'
      instance.qrCode = null
      instance.qrBase64 = null

      await notifyWebhook(instance.webhookUrl, 'CONNECTION_UPDATE', {
        instance: name,
        state: instance.status,
      })

      if (shouldReconnect) {
        setTimeout(() => connectInstance(name), 3000)
      }
    }

    if (connection === 'open') {
      instance.status = 'open'
      instance.qrCode = null
      instance.qrBase64 = null

      await notifyWebhook(instance.webhookUrl, 'CONNECTION_UPDATE', {
        instance: name,
        state: 'open',
      })
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) {
      await notifyWebhook(instance.webhookUrl, 'MESSAGES_UPSERT', {
        instance: name,
        data: msg,
      })
    }
  })
}

export function getInstance(name) {
  return instances.get(name) || null
}

export function getInstanceStatus(name) {
  const inst = instances.get(name)
  if (!inst) return null
  return {
    instance: name,
    state: inst.status === 'open' ? 'open' : inst.status === 'qr' ? 'connecting' : inst.status,
    statusReason: 200,
  }
}

export function listInstances() {
  return Array.from(instances.entries()).map(([name, inst]) => ({
    instance: { instanceName: name, status: inst.status },
  }))
}

export async function deleteInstance(name) {
  const inst = instances.get(name)
  if (!inst) return false

  try {
    if (inst.socket) await inst.socket.logout()
  } catch (_) {}

  try {
    fs.rmSync(path.join(SESSIONS_DIR, name), { recursive: true, force: true })
  } catch (_) {}

  instances.delete(name)
  return true
}

export async function loadPersistedSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) return
  const dirs = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)

  for (const name of dirs) {
    if (!instances.has(name)) {
      instances.set(name, { qrCode: null, qrBase64: null, status: 'connecting', webhookUrl: null, socket: null })
      await connectInstance(name)
    }
  }
}
