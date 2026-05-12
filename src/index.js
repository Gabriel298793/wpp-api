import 'dotenv/config'
import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import instanceRoutes from './routes/instance.js'
import messageRoutes from './routes/message.js'
import { loadPersistedSessions } from './instances.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = express()

app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// Dashboard — sem autenticação
app.use(express.static(join(__dirname, '../public')))

// API Key auth
app.use((req, res, next) => {
  if (req.path === '/') return next()
  const apiKey = req.headers['apikey'] || req.headers['api_key'] || req.query.apikey
  if (process.env.API_KEY && apiKey !== process.env.API_KEY) {
    return res.status(401).json({ status: 'ERROR', error: true, message: 'Unauthorized' })
  }
  next()
})

app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', service: 'WPP API' })
})

app.use('/instance', instanceRoutes)
app.use('/message', messageRoutes)

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' })
})

const PORT = process.env.PORT || 3333

app.listen(PORT, async () => {
  console.log(`WPP API running on port ${PORT}`)
  await loadPersistedSessions()
  console.log('Sessions loaded')
})
