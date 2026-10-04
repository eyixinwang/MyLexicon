;(() => {
  if (globalThis.__myLexiconCapture) return
  globalThis.__myLexiconCapture = true
  let current

  function selectedInput(fallback) {
    const selection = window.getSelection()
    const text = (fallback || selection?.toString() || '').trim()
    let context = ''
    let rect
    if (selection?.rangeCount && selection.toString().trim() === text) {
      const range = selection.getRangeAt(0)
      rect = range.getBoundingClientRect()
      const start =
        range.startContainer.nodeType === Node.ELEMENT_NODE
          ? range.startContainer
          : range.startContainer.parentElement
      const block = start?.closest('p,li,blockquote,h1,h2,h3,h4,h5,h6,td,figcaption') || start
      if (block && !block.closest('input,textarea,[contenteditable="true"]')) {
        const passage = block.textContent || ''
        let offset = passage.indexOf(text)
        try {
          const before = document.createRange()
          before.selectNodeContents(block)
          before.setEnd(range.startContainer, range.startOffset)
          offset = before.toString().length
        } catch {
          /* Selection may span multiple blocks. */
        }
        const segments = [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(passage)]
        const segment = segments.find(
          (item) => offset >= item.index && offset < item.index + item.segment.length,
        )
        // Preserve a selection spanning sentences, with nearby text when possible.
        const from = segment?.index ?? Math.max(0, offset - 250)
        const end = Math.max(from + (segment?.segment.length ?? 500), offset + text.length)
        context = passage.slice(from, Math.min(end, from + 5000)).trim()
      }
    }
    return {
      input: { text, context, title: document.title.slice(0, 500), url: location.href },
      rect,
    }
  }
  async function send(request) {
    const response = await chrome.runtime.sendMessage({ action: 'capture-request', request })
    if (!response?.ok) throw new Error(response?.error || '连接已中断。请重试或打开 MyLexicon。')
    return response.result
  }
  function close() {
    if (!current) return
    const old = current
    const restoreFocus = document.activeElement === old.host
    current = undefined
    old.host.remove()
    old.resize.disconnect()
    document.removeEventListener('keydown', old.onKey, true)
    if (old.requestId) void send({ action: 'cancel', requestId: old.requestId }).catch(() => {})
    if (old.token) void send({ action: 'discard', token: old.token }).catch(() => {})
    if (restoreFocus && old.previousFocus?.isConnected)
      old.previousFocus.focus({ preventScroll: true })
  }
  function show(fallback = '') {
    const { input, rect } = selectedInput(fallback)
    close()
    const host = document.createElement('div')
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;display:block;'
    const shadow = host.attachShadow({ mode: 'open' })
    // This template is static. All page text and AI output are assigned as textContent.
    shadow.innerHTML = `<style>
      :host{font:14px/1.55 system-ui,-apple-system,"PingFang SC",sans-serif;color:#234638;color-scheme:light}
      *{box-sizing:border-box}section{font:14px/1.55 system-ui,-apple-system,"PingFang SC",sans-serif;color:#234638;color-scheme:light;width:min(390px,calc(100vw - 24px));max-height:min(560px,calc(100vh - 32px));overflow:auto;background:#fffef8;border:1px solid #d5dfcf;border-radius:16px;padding:20px;box-shadow:0 12px 44px #12352130;text-align:left}
      header{display:flex;align-items:center;justify-content:space-between;gap:12px}.brand{font-size:11px;letter-spacing:1.5px;font-weight:700;color:#6f8069}
      h2{font-size:21px;line-height:1.35;overflow-wrap:anywhere;margin:12px 0}p{white-space:pre-wrap;overflow-wrap:anywhere;margin:9px 0}.meaning{font-size:17px;font-weight:600}.small{font-size:12px;color:#70826d}.error{color:#a0392d}button{font:inherit;cursor:pointer;border:0;border-radius:8px;padding:9px 12px;background:#285742;color:white}button:disabled{cursor:default;opacity:.65}button:focus-visible,summary:focus-visible{outline:2px solid #285742;outline-offset:3px}.close{background:transparent;color:#617661;font-size:23px;padding:0 4px}.secondary{background:#edf1e7;color:#31583f}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}blockquote{font-size:12px;margin:14px 0 0;padding:10px 12px;border-left:3px solid #b6cbb1;background:#f4f6ee;white-space:pre-wrap;overflow-wrap:anywhere}details{margin-top:10px}summary{cursor:pointer;font-size:12px;color:#587655}
    </style><section aria-label="MyLexicon 中文解释" role="region"><header><span class="brand">MYLEXICON · 阅读助手</span><button class="close" aria-label="关闭解释">×</button></header><h2></h2><p class="status small" role="status" aria-live="polite"></p><div class="answer" hidden><p class="meaning" lang="zh"></p><p class="usage" lang="zh"></p><p class="notes small" lang="zh"></p><details><summary>查看原文语境</summary><blockquote></blockquote></details></div><div class="actions"><button class="save" hidden>加入 Revisit</button><button class="retry secondary" hidden>重试</button><button class="open secondary">打开 MyLexicon</button></div><p class="small footnote">Gemini 解释仅供参考 · 按 Esc 返回阅读</p></section>`
    const $ = (selector) => shadow.querySelector(selector)
    $('h2').textContent = input.text || '请选择英文单词、短语或句子'
    const width = Math.min(390, window.innerWidth - 24)
    const beside = rect && rect.right + width + 24 <= window.innerWidth
    const left = beside
      ? rect.right + 12
      : Math.max(
          12,
          Math.min(rect?.left ?? window.innerWidth - width - 20, window.innerWidth - width - 12),
        )
    host.style.left = `${left}px`
    host.style.top = `${(rect?.bottom ?? 60) + 10}px`
    document.documentElement.append(host)
    const resize = new ResizeObserver(() => {
      const height = $('section').getBoundingClientRect().height
      let top = beside ? rect.top : (rect?.bottom ?? 60) + 10
      if (top + height > window.innerHeight - 16 && rect && rect.top - height - 10 >= 16)
        top = rect.top - height - 10
      host.style.top = `${Math.max(16, Math.min(top, window.innerHeight - height - 16))}px`
    })
    resize.observe($('section'))
    const state = {
      host,
      resize,
      previousFocus: document.activeElement,
      token: undefined,
      requestId: undefined,
      saving: false,
      onKey: (event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          close()
        }
      },
    }
    current = state
    document.addEventListener('keydown', state.onKey, true)
    $('.close').addEventListener('click', close)
    $('.open').addEventListener('click', (event) => {
      if (!event.isTrusted) return
      void chrome.runtime.sendMessage({ action: 'open-service' }).catch(() => {})
    })
    async function lookup() {
      if (!input.text || input.text.length > 5000 || !/[a-z]/i.test(input.text)) {
        $('.status').textContent =
          '请先选择包含英文的文本（最多 5000 字符），再使用快捷键或右键菜单。'
        return
      }
      const requestId = crypto.randomUUID()
      state.requestId = requestId
      $('.status').classList.remove('error')
      $('.status').textContent = '正在解释，你可以继续阅读…'
      $('.retry').hidden = true
      $('.answer').hidden = true
      $('.save').hidden = true
      try {
        const result = await send({ action: 'explain', requestId, input })
        if (current !== state) {
          void send({ action: 'discard', token: result.token }).catch(() => {})
          return
        }
        state.requestId = undefined
        state.token = result.token
        $('.meaning').textContent = result.data.meaningZh
        $('.usage').textContent = result.data.usage
        $('.notes').textContent = [result.data.toneNotes, result.data.notes]
          .filter(Boolean)
          .join('\n')
        $('blockquote').textContent = input.context
        $('details').hidden = !input.context
        $('.answer').hidden = false
        $('.status').textContent = result.saved
          ? `已在 ${result.saved.collection === 'revisit' ? 'Revisit' : 'Library'} 中`
          : '尚未保存 · 感兴趣时再加入 Revisit'
        $('.save').hidden = false
        $('.save').disabled = !!result.saved
        $('.save').textContent = result.saved ? '已保存' : '加入 Revisit'
        $('.footnote').textContent = result.reused
          ? '来自已保存的解释 · 按 Esc 返回阅读'
          : 'Gemini 解释仅供参考 · 按 Esc 返回阅读'
      } catch (error) {
        if (current !== state) return
        state.requestId = undefined
        $('.status').classList.add('error')
        $('.status').textContent = error.message
        $('.retry').hidden = false
      }
    }
    $('.retry').addEventListener('click', (event) => {
      if (!event.isTrusted) return
      void lookup()
    })
    $('.save').addEventListener('click', async (event) => {
      // The surrounding webpage can dispatch DOM events into an open shadow root.
      // Only a real user gesture may persist a preview or trigger another AI request.
      if (!event.isTrusted || !state.token || state.saving) return
      state.saving = true
      $('.save').disabled = true
      $('.save').textContent = '正在保存…'
      try {
        const result = await send({ action: 'save', token: state.token })
        if (current !== state) return
        $('.status').classList.remove('error')
        $('.status').textContent =
          result.collection === 'revisit'
            ? '已加入 Revisit，空闲时再来学习。'
            : '这个表达已在 Library 中。'
        $('.save').textContent = '已保存 ✓'
      } catch (error) {
        if (current !== state) return
        $('.status').classList.add('error')
        $('.status').textContent = `${error.message} 如连接中断，可先检查 Revisit，或重试保存。`
        $('.save').disabled = false
        $('.save').textContent = '重试保存'
      } finally {
        state.saving = false
      }
    })
    void lookup()
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || message?.channel !== 'mylexicon-show') return
    show(typeof message.text === 'string' ? message.text : '')
    respond({ shown: true })
  })
})()
