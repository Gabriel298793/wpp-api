import { Router } from 'express'
import { getInstance } from '../instances.js'

const router = Router()

function formatNumber(number) {
  if (number.includes('@')) return number
  return `${number.replace(/\D/g, '')}@s.whatsapp.net`
}

function getSocket(instance, res) {
  const inst = getInstance(instance)
  if (!inst) {
    res.status(404).json({ error: 'Instance not found' })
    return null
  }
  if (inst.status !== 'open' || !inst.socket) {
    res.status(400).json({ error: 'Instance not connected', status: inst.status })
    return null
  }
  return inst.socket
}

// POST /message/sendText/:instance
router.post('/sendText/:instance', async (req, res) => {
  const { instance } = req.params
  const { number, textMessage, options } = req.body

  const sock = getSocket(instance, res)
  if (!sock) return

  try {
    const jid = formatNumber(number)

    const [exists] = await sock.onWhatsApp(jid).catch(() => [null])
    const resolvedJid = exists?.jid || jid

    const result = await sock.sendMessage(resolvedJid, {
      text: textMessage?.text || req.body.text || '',
    })

    return res.json({
      key: result.key,
      message: result.message,
      messageTimestamp: result.messageTimestamp,
      status: 'PENDING',
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// POST /message/sendMedia/:instance
router.post('/sendMedia/:instance', async (req, res) => {
  const { instance } = req.params
  const { number, mediaMessage } = req.body

  const sock = getSocket(instance, res)
  if (!sock) return

  try {
    const jid = formatNumber(number)
    const { mediatype, caption, media, fileName } = mediaMessage

    let content = {}

    if (mediatype === 'image') {
      content = { image: { url: media }, caption: caption || '' }
    } else if (mediatype === 'video') {
      content = { video: { url: media }, caption: caption || '' }
    } else if (mediatype === 'audio') {
      content = { audio: { url: media }, mimetype: 'audio/mp4', ptt: false }
    } else if (mediatype === 'document') {
      content = { document: { url: media }, fileName: fileName || 'file', caption: caption || '' }
    } else {
      return res.status(400).json({ error: 'Invalid mediatype. Use: image, video, audio, document' })
    }

    const result = await sock.sendMessage(jid, content)

    return res.json({
      key: result.key,
      message: result.message,
      messageTimestamp: result.messageTimestamp,
      status: 'PENDING',
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// POST /message/sendWhatsAppAudio/:instance
router.post('/sendWhatsAppAudio/:instance', async (req, res) => {
  const { instance } = req.params
  const { number, audio } = req.body

  const sock = getSocket(instance, res)
  if (!sock) return

  try {
    const jid = formatNumber(number)
    const result = await sock.sendMessage(jid, {
      audio: { url: audio },
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true,
    })

    return res.json({ key: result.key, status: 'PENDING' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// POST /message/sendButtons/:instance
router.post('/sendButtons/:instance', async (req, res) => {
  const { instance } = req.params
  const { number, buttonMessage } = req.body

  const sock = getSocket(instance, res)
  if (!sock) return

  try {
    const jid = formatNumber(number)
    // Buttons via texto simples (WhatsApp limitou botões interativos)
    const lines = [buttonMessage.title || '', '', buttonMessage.description || '']
    buttonMessage.buttons?.forEach((btn, i) => {
      lines.push(`${i + 1}. ${btn.buttonText?.displayText || btn.displayText || ''}`)
    })

    const result = await sock.sendMessage(jid, { text: lines.join('\n') })
    return res.json({ key: result.key, status: 'PENDING' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// POST /message/sendList/:instance
router.post('/sendList/:instance', async (req, res) => {
  const { instance } = req.params
  const { number, listMessage } = req.body

  const sock = getSocket(instance, res)
  if (!sock) return

  try {
    const jid = formatNumber(number)
    const sections = listMessage.sections?.map(s => ({
      title: s.title,
      rows: s.rows?.map(r => ({ title: r.title, description: r.description, rowId: r.rowId })),
    })) || []

    const result = await sock.sendMessage(jid, {
      listMessage: {
        title: listMessage.title || '',
        text: listMessage.description || '',
        footerText: listMessage.footerText || '',
        buttonText: listMessage.buttonText || 'Ver opções',
        sections,
        listType: 1,
      },
    })

    return res.json({ key: result.key, status: 'PENDING' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// POST /message/sendLocation/:instance
router.post('/sendLocation/:instance', async (req, res) => {
  const { instance } = req.params
  const { number, locationMessage } = req.body

  const sock = getSocket(instance, res)
  if (!sock) return

  try {
    const jid = formatNumber(number)
    const result = await sock.sendMessage(jid, {
      location: {
        degreesLatitude: locationMessage.latitude,
        degreesLongitude: locationMessage.longitude,
        name: locationMessage.name || '',
        address: locationMessage.address || '',
      },
    })

    return res.json({ key: result.key, status: 'PENDING' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

export default router
