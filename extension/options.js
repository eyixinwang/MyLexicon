import { DEFAULT_SERVICE, serviceAddress } from './config.js'
const input = document.querySelector('#service')
const status = document.querySelector('#status')
input.value = (await chrome.storage.local.get('serviceUrl')).serviceUrl || DEFAULT_SERVICE
document.querySelector('#settings').addEventListener('submit', async (event) => {
  event.preventDefault()
  try {
    const serviceUrl = serviceAddress(input.value.trim())
    await chrome.storage.local.set({ serviceUrl })
    input.value = serviceUrl
    status.textContent = 'Service address saved.'
  } catch (error) {
    status.textContent = error.message
  }
})
document.querySelector('#open').addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ action: 'open-service' })
  if (!response?.ok) status.textContent = response?.error || 'Could not open MyLexicon.'
})
