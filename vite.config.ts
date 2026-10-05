import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { localGeminiProxy } from './src/ai/localProxy'

export default defineConfig(({ mode, command, isPreview }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = process.env.VITE_BASE_PATH || env.VITE_BASE_PATH || '/'
  const key = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY || ''
  const localProxy = command === 'serve' && !isPreview && !!key && mode !== 'test'
  return {
    plugins: [react(), ...(localProxy ? [localGeminiProxy(key, base)] : [])],
    define: { 'import.meta.env.VITE_GEMINI_LOCAL_PROXY': JSON.stringify(localProxy) },
    base,
    test: { environment: 'node' },
  }
})
