import { Router } from 'express'
import {
  createInstance,
  getInstance,
  getInstanceStatus,
  listInstances,
  deleteInstance,
} from '../instances.js'

const router = Router()

// POST /instance/create
router.post('/create', async (req, res) => {
  const { instanceName, token, webhook, qrcode } = req.body

  if (!instanceName) {
    return res.status(400).json({ error: 'instanceName is required' })
  }

  const result = await createInstance(instanceName, webhook || null)

  if (result.error) {
    return res.status(409).json(result)
  }

  return res.status(201).json({
    instance: { instanceName, status: 'created' },
    hash: { apikey: token || process.env.API_KEY || '' },
    webhook: { webhook: webhook || null },
    qrcode: { pairingCode: null, code: null, base64: null },
  })
})

// GET /instance/connect/:instance
router.get('/connect/:instance', async (req, res) => {
  const { instance } = req.params
  const inst = getInstance(instance)

  if (!inst) {
    return res.status(404).json({ error: 'Instance not found' })
  }

  if (inst.status === 'open') {
    return res.json({ instance, status: 'open', qrcode: null })
  }

  return res.json({
    instance,
    status: inst.status,
    qrcode: inst.qrBase64
      ? { base64: inst.qrBase64, code: inst.qrCode }
      : null,
  })
})

// GET /instance/connectionState/:instance
router.get('/connectionState/:instance', (req, res) => {
  const { instance } = req.params
  const status = getInstanceStatus(instance)

  if (!status) {
    return res.status(404).json({ error: 'Instance not found' })
  }

  return res.json(status)
})

// GET /instance/fetchInstances
router.get('/fetchInstances', (req, res) => {
  return res.json(listInstances())
})

// DELETE /instance/delete/:instance
router.delete('/delete/:instance', async (req, res) => {
  const { instance } = req.params
  const deleted = await deleteInstance(instance)

  if (!deleted) {
    return res.status(404).json({ error: 'Instance not found' })
  }

  return res.json({ status: 'SUCCESS', error: false, response: { message: 'Instance deleted' } })
})

// DELETE /instance/logout/:instance
router.delete('/logout/:instance', async (req, res) => {
  const { instance } = req.params
  const deleted = await deleteInstance(instance)

  if (!deleted) {
    return res.status(404).json({ error: 'Instance not found' })
  }

  return res.json({ status: 'SUCCESS', error: false, response: { message: 'Instance logged out' } })
})

export default router
