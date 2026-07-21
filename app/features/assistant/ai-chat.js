(() => {
  const $ = id => document.getElementById(id);
  const desktop = window.kairosDesktop;
  const panel = $('aiPanel');
  const messages = $('aiMessages');
  const input = $('aiInput');
  const send = $('sendAiMessage');
  if (!panel || !messages || !input || !send) return;
  const windowMode = panel.dataset.windowMode === 'true';
  if (windowMode) document.documentElement.classList.add('ai-window-mode');

  // Keep the native window rectangular so Chromium can anti-alias the CSS
  // radius. Only the four actually transparent corner areas click through.
  if (windowMode && desktop?.setAiMousePassthrough) {
    let mousePassthrough = false;
    const pointInsideRoundedPanel = (x, y) => {
      const rect = panel.getBoundingClientRect();
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return false;
      const radius = Math.min(32, rect.width / 2, rect.height / 2);
      const localX = x - rect.left;
      const localY = y - rect.top;
      if (localX >= radius && localX <= rect.width - radius) return true;
      if (localY >= radius && localY <= rect.height - radius) return true;
      const centerX = localX < radius ? radius : rect.width - radius;
      const centerY = localY < radius ? radius : rect.height - radius;
      return Math.hypot(localX - centerX, localY - centerY) <= radius;
    };
    document.addEventListener('mousemove', event => {
      const ignore = !pointInsideRoundedPanel(event.clientX, event.clientY);
      if (ignore === mousePassthrough) return;
      mousePassthrough = ignore;
      desktop.setAiMousePassthrough(ignore);
    });
  }

  const ui = {
    session: $('aiSessionSelect'), provider: $('aiProviderSelect'), model: $('aiModelInput'),
    usage: $('aiUsageSummary'), tray: $('aiAttachmentTray'), attach: $('aiAttachButton'),
    files: $('aiAttachmentInput'), retain: $('aiRetainAttachments'), create: $('newAiSession'),
    remove: $('deleteAiSession'), avatarButton: $('aiAvatarButton'), avatarInput: $('aiAvatarInput'),
    name: $('aiAssistantName'), rename: $('renameAiAssistant')
  };
  let providers = [];
  let sessions = [];
  let active = null;
  let pendingAttachments = [];
  let currentRequestId = null;
  let waitingForRequest = false;
  let streamArticle = null;
  let streamText = '';
  let lastRequest = null;
  let draftTimer = null;
  let initializationError = '';
  let initialized = false;
  let followLatest = true;
  let unseenUpdates = 0;
  const assistantNameKey = 'kairos-ai-assistant-name';
  const getAssistantName = () => localStorage.getItem(assistantNameKey) || 'Kairos Assistant';
  if (ui.name) ui.name.textContent = getAssistantName();
  const enhanceAiCombobox = select => {
    if (!select || select.dataset.comboboxReady) return () => {};
    select.dataset.comboboxReady = 'true';
    select.closest('label')?.classList.add('kairos-combobox-field','ai-combobox-field');
    const root = document.createElement('div');
    root.className = 'kairos-combobox ai-combobox';
    root.innerHTML = '<button class="kairos-combobox-input" type="button" role="combobox" aria-haspopup="listbox" aria-expanded="false"><span></span><i class="material-symbols-outlined">expand_more</i></button><section class="kairos-combobox-content" hidden><div class="kairos-combobox-empty" hidden>No items found.</div><div class="kairos-combobox-list" role="listbox"></div></section>';
    select.after(root);
    const trigger=root.querySelector('.kairos-combobox-input'),valueLabel=trigger.querySelector('span'),content=root.querySelector('.kairos-combobox-content'),list=root.querySelector('.kairos-combobox-list'),empty=root.querySelector('.kairos-combobox-empty');
    const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const options=()=>[...select.options].map(option=>({value:option.value,label:option.textContent||option.value}));
    const close=()=>{content.hidden=true;trigger.setAttribute('aria-expanded','false')};
    const closeOthers=()=>document.querySelectorAll('#aiPanel .kairos-combobox-content').forEach(node=>{if(node!==content)node.hidden=true});
    const paint=()=>{const rows=options();valueLabel.textContent=select.selectedOptions[0]?.textContent||select.value||'';list.innerHTML=rows.map(item=>`<button class="kairos-combobox-item" type="button" role="option" data-value="${escapeHtml(item.value)}" aria-selected="${item.value===select.value}"><span>${escapeHtml(item.label)}</span><i class="material-symbols-outlined">check</i></button>`).join('');empty.hidden=!!rows.length};
    const open=()=>{closeOthers();content.hidden=false;trigger.setAttribute('aria-expanded','true');paint()};
    trigger.addEventListener('click',event=>{event.preventDefault();content.hidden?open():close()});
    trigger.addEventListener('keydown',event=>{if(!['ArrowDown','ArrowUp','Enter',' '].includes(event.key))return;event.preventDefault();if(content.hidden){open();return}const rows=options(),index=rows.findIndex(item=>item.value===select.value),next=event.key==='ArrowUp'?rows[(index-1+rows.length)%rows.length]:rows[(index+1)%rows.length];if(next){select.value=next.value;select.dispatchEvent(new Event('change',{bubbles:true}));paint()}});
    list.addEventListener('click',event=>{const item=event.target.closest('.kairos-combobox-item');if(!item)return;select.value=item.dataset.value;select.dispatchEvent(new Event('change',{bubbles:true}));paint();close();trigger.focus()});
    select.addEventListener('change',paint);
    paint();
    return paint;
  };
  const aiComboboxSync=[ui.session,ui.provider,ui.model].map(enhanceAiCombobox);
  document.addEventListener('click',event=>{if(event.target.closest('#aiPanel .kairos-combobox'))return;document.querySelectorAll('#aiPanel .kairos-combobox-content').forEach(node=>node.hidden=true)},true);
  const kairosConfirmAlert=({title,description,action='Continue',cancel='Cancel',tone='danger'}={})=>new Promise(resolve=>{
    let dialog=document.getElementById('kairosAlertDialog');
    if(!dialog){dialog=document.createElement('dialog');dialog.id='kairosAlertDialog';dialog.className='kairos-alert-dialog';dialog.setAttribute('role','alertdialog');dialog.innerHTML='<form method="dialog" class="kairos-alert-content"><div class="kairos-alert-header"><div class="kairos-alert-media"><span class="material-symbols-outlined">warning</span></div><div><h2 class="kairos-alert-title"></h2><p class="kairos-alert-description"></p></div></div><footer class="kairos-alert-footer"><button class="kairos-alert-cancel" value="cancel" type="submit"></button><button class="kairos-alert-action" value="confirm" type="submit"></button></footer></form>';document.body.append(dialog)}
    dialog.dataset.tone=tone;dialog.querySelector('.kairos-alert-title').textContent=title||'Are you sure?';dialog.querySelector('.kairos-alert-description').textContent=description||'This action cannot be undone.';dialog.querySelector('.kairos-alert-cancel').textContent=cancel;dialog.querySelector('.kairos-alert-action').textContent=action;
    const done=value=>{dialog.removeEventListener('close',onClose);resolve(value)};const onClose=()=>done(dialog.returnValue==='confirm');
    dialog.addEventListener('close',onClose,{once:true});dialog.showModal();dialog.querySelector('.kairos-alert-cancel')?.focus();
  });

  const avatarKey = 'kairos-ai-avatar';
  const setAvatar = value => value
    ? document.documentElement.style.setProperty('--ai-avatar-url', `url("${value}")`)
    : document.documentElement.style.removeProperty('--ai-avatar-url');
  setAvatar(localStorage.getItem(avatarKey));
  ui.avatarButton?.addEventListener('click', () => ui.avatarInput?.click());
  ui.avatarInput?.addEventListener('change', () => {
    const file = ui.avatarInput.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
        const context = canvas.getContext('2d'); const scale = Math.max(256 / image.width, 256 / image.height);
        const width = image.width * scale; const height = image.height * scale;
        context.drawImage(image, (256 - width) / 2, (256 - height) / 2, width, height);
        const value = canvas.toDataURL('image/jpeg', .86); localStorage.setItem(avatarKey, value); setAvatar(value);
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file); ui.avatarInput.value = '';
  });

  const latestButton = document.createElement('button'); latestButton.type = 'button'; latestButton.className = 'ai-scroll-latest'; latestButton.hidden = true; latestButton.innerHTML = '<span class="material-symbols-outlined">south</span><span></span>'; panel.append(latestButton);
  const nearLatest = () => messages.scrollHeight - messages.scrollTop - messages.clientHeight < 42;
  const updateLatestButton = () => { latestButton.hidden = followLatest || !unseenUpdates; latestButton.querySelector('span:last-child').textContent = unseenUpdates > 1 ? `${unseenUpdates} 条新内容` : '回到最新消息'; };
  const scrollToLatest = (force = false) => { if (force || followLatest) { messages.scrollTop = messages.scrollHeight; followLatest = true; unseenUpdates = 0; } else { unseenUpdates++; } updateLatestButton(); };
  latestButton.onclick = () => scrollToLatest(true);
  messages.addEventListener('scroll', () => { if (nearLatest()) { followLatest = true; unseenUpdates = 0; } else { followLatest = false; } updateLatestButton(); }, { passive: true });
  const timeLabel = value => new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(value ? new Date(value) : new Date());
  const appendSystem = text => { const node = document.createElement('div'); node.className = 'ai-message-system'; node.textContent = text; messages.append(node); scrollToLatest(); return node; };
  const appendMessage = (role, text, options = {}) => {
    const article = document.createElement('article');
    const received = role === 'assistant';
    article.className = `ai-message ai-message-${received ? 'received' : 'sent'}`;
    if (received) { const avatar = document.createElement('div'); avatar.className = 'ai-avatar ai-message-avatar'; avatar.setAttribute('aria-hidden', 'true'); article.append(avatar); }
    const stack = document.createElement('div'); stack.className = 'ai-message-stack';
    const meta = document.createElement('div'); meta.className = 'ai-message-meta';
    const author = document.createElement('strong'); author.textContent = received ? getAssistantName() : 'You';
    const time = document.createElement('time'); time.textContent = timeLabel(options.createdAt); meta.append(author, time);
    const bubble = document.createElement('div'); bubble.className = 'ai-message-bubble'; bubble.textContent = text;
    stack.append(meta, bubble);
    if (options.attachments?.length) { const attachments = document.createElement('div'); attachments.className = 'ai-message-attachments'; attachments.textContent = `附件：${options.attachments.join('、')}`; stack.append(attachments); }
    if (options.status && options.status !== 'completed') { const status = document.createElement('div'); status.className = 'ai-message-status'; status.textContent = options.status === 'stopped' ? '已停止生成' : options.status === 'failed' ? `回复失败${options.error ? `：${options.error}` : ''}` : options.status; stack.append(status); }
    article.append(stack); messages.append(article); scrollToLatest(Boolean(options.forceScroll));
    return { article, stack, bubble };
  };
  const renderMessages = () => {
    messages.replaceChildren();
    const date = document.createElement('div'); date.className = 'ai-chat-date'; date.textContent = 'Today'; messages.append(date);
    if (initializationError) { appendSystem(`AI 初始化失败：${initializationError}`); return; }
    if (!active?.messages?.length) appendMessage('assistant', '你好，我在这里。今天想先处理哪件事？');
    else active.messages.forEach(message => appendMessage(message.role, message.content, { createdAt: message.createdAt, status: message.status, error: message.error?.message, attachments: message.attachmentNames }));
    scrollToLatest(true);
  };
  const renderSessions = () => {
    ui.session.replaceChildren(...sessions.map(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.title || '新对话'; option.selected = item.id === active?.id; return option; }));
    aiComboboxSync.forEach(sync=>sync?.());
  };
  const renderProviders = () => {
    ui.provider.replaceChildren(...providers.map(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.name; return option; }));
    if (active) ui.provider.value = active.provider || 'openai';
    renderModels(active?.model);
    aiComboboxSync.forEach(sync=>sync?.());
  };
  const renderModels = selectedModel => {
    const provider = providers.find(item => item.id === ui.provider.value);
    const models = [...new Set((provider?.models || [provider?.defaultModel]).filter(Boolean))];
    ui.model.replaceChildren(...models.map(model => { const option = document.createElement('option'); option.value = model; option.textContent = model; return option; }));
    ui.model.value = models.includes(selectedModel) ? selectedModel : provider?.defaultModel || models[0] || '';
    aiComboboxSync.forEach(sync=>sync?.());
  };
  const updateUsage = async () => {
    if (!desktop || !active) return;
    const usage = await desktop.getUsage({ conversationId: active.id });
    ui.usage.textContent = `${usage.requests} 次 · ${usage.inputTokens + usage.outputTokens} tokens`;
  };
  const updateComposer = () => {
    send.disabled = (!input.value.trim() && !currentRequestId) || !active;
    input.disabled = Boolean(currentRequestId);
    send.querySelector('.material-symbols-outlined').textContent = currentRequestId ? 'stop' : 'arrow_upward'; send.classList.toggle('is-stopping', Boolean(currentRequestId));
    send.setAttribute('aria-label', currentRequestId ? '停止生成' : '发送');
    input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  };
  const loadConversation = async id => {
    if (!desktop) return;
    active = await desktop.conversations.get(id);
    if (!active) return;
    renderSessions(); renderProviders(); renderMessages();
    input.value = active.draft || ''; pendingAttachments = []; renderAttachments(); updateComposer(); await updateUsage();
  };
  const createConversation = async () => {
    if (!desktop) throw new Error('AI 功能仅在 Kairos 桌面端可用');
    const provider = ui.provider.value || providers[0]?.id || 'openai';
    const model = ui.model.value || providers.find(item => item.id === provider)?.defaultModel || '';
    const created = await desktop.conversations.create({ title: '新对话', provider, model });
    sessions.unshift(created); await loadConversation(created.id); input.focus(); return active;
  };
  const initialize = async () => {
    if (!desktop) throw new Error('AI 功能仅在 Kairos 桌面端可用');
    providers = await desktop.listProviders();
    const settings = await desktop.getProviderSettings();
    sessions = await desktop.conversations.list();
    if (!sessions.length) { const provider = settings.defaultProvider || providers[0]?.id || 'openai'; sessions = [await desktop.conversations.create({ title: '新对话', provider, model: settings.providers?.[provider]?.model || '' })]; }
    active = await desktop.conversations.get(sessions[0].id); if (!active) throw new Error('无法读取当前会话');
    initializationError = ''; initialized = true; active.messages ||= [];
    renderSessions(); renderProviders(); renderMessages(); input.value = active.draft || ''; updateComposer(); await updateUsage();
  };
  const errorText = error => error?.message || String(error || '未知错误');
  const reportActionError = error => { appendSystem(`操作失败：${errorText(error)}`); };
  const runAction = action => async event => { try { await action(event); } catch (error) { reportActionError(error); } };

  const renderAttachments = () => {
    ui.tray.replaceChildren(...pendingAttachments.map(item => {
      const chip = document.createElement('div'); chip.className = 'ai-attachment-chip'; chip.dataset.status = item.status;
      const name = document.createElement('span'); name.textContent = item.status === 'preparing' ? `${item.name}（处理中）` : item.status === 'failed' ? `${item.name}（失败）` : item.name;
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `移除 ${item.name}`);
      remove.onclick = async () => { if (item.id) await desktop.attachments.remove(item.id); pendingAttachments = pendingAttachments.filter(row => row !== item); renderAttachments(); };
      chip.append(name, remove); return chip;
    }));
  };
  const addFiles = async files => {
    if (!desktop || !active) return;
    for (const file of files) {
      const item = { name: file.name, status: 'preparing', id: '' }; pendingAttachments.push(item); renderAttachments();
      try {
        const saved = await desktop.attachments.save({ conversationId: active.id, name: file.name, mimeType: file.type, bytes: new Uint8Array(await file.arrayBuffer()), retain: ui.retain.checked });
        item.id = saved.id; item.status = 'ready'; item.mode = (await desktop.attachments.prepare(saved.id, ui.provider.value)).mode;
      } catch (error) { item.status = 'failed'; item.error = errorText(error); }
      renderAttachments();
    }
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const sourceRefsFor = row => {
    const refs = Array.isArray(row.sourceRefs) ? row.sourceRefs : [];
    const sourceUrl = row.sourceUrl || refs[0]?.url || '';
    const merged = refs.length ? refs : sourceUrl ? [{ source: row.source || 'source', url: sourceUrl }] : [];
    const seen = new Set();
    return merged.filter(ref => {
      const key = ref.url || `${ref.source}:${ref.name}`;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const sourceRefLabel = ref => {
    if (ref.source || ref.name) return ref.source || ref.name;
    try { return new URL(ref.url).hostname; } catch { return ref.url || 'source'; }
  };
  const renderScheduleCards = rows => {
    if (!rows.length) { appendSystem('没有从附件中识别到明确的日程项目'); return; }
    const group = document.createElement('section'); group.className = 'ai-schedule-proposals';
    const heading = document.createElement('strong'); heading.textContent = `识别到 ${rows.length} 项日程，请确认后保存`; group.append(heading);
    const actions = document.createElement('div'); actions.className = 'ai-schedule-bulk-actions';
    actions.innerHTML = '<button type="button" data-save-high>仅确认高置信度</button><button type="button" data-save-all>全部确认</button><button type="button" data-skip-all>全部忽略</button>';
    group.append(actions);
    const pendingCards = () => [...group.querySelectorAll('.ai-schedule-card:not([data-saved="true"])')];
    const submitCards = async cards => {
      for (const card of cards) {
        if (!card.isConnected || card.dataset.saved === 'true') continue;
        if (!card.reportValidity()) break;
        card.requestSubmit();
        await new Promise(resolve => {
          const started = Date.now();
          const wait = () => {
            if (!card.isConnected || card.dataset.saved === 'true' || card.dataset.saving !== 'true' || Date.now() - started > 15000) resolve();
            else setTimeout(wait, 120);
          };
          wait();
        });
      }
    };
    actions.querySelector('[data-save-high]').onclick = () => submitCards(pendingCards().filter(card => card.dataset.confidence === 'high'));
    actions.querySelector('[data-save-all]').onclick = async () => {
      if (!window.confirm('确认写入当前所有候选日程吗？低置信度项目仍会逐条再次确认。')) return;
      await submitCards(pendingCards());
    };
    actions.querySelector('[data-skip-all]').onclick = () => {
      if (!window.confirm('确认忽略当前所有候选日程吗？')) return;
      pendingCards().forEach(card => card.remove());
    };
    rows.forEach((row, index) => {
      const card = document.createElement('form'); card.className = 'ai-schedule-card';
      const confidence = row.confidence || (row.date && (row.sourceUrl || row.sourceRefs?.length) ? 'medium' : 'low');
      card.dataset.confidence = confidence;
      const sourceRefs = sourceRefsFor(row);
      const sourceSummary = sourceRefs.length ? `${sourceRefs.length} 个来源` : '缺少来源';
      const sourceLinks = sourceRefs.map(ref => `<a href="${escapeHtml(ref.url)}" title="${escapeHtml(ref.url)}">${escapeHtml(sourceRefLabel(ref))}</a>`).join('');
      const conflicts = Array.isArray(row.conflicts) ? row.conflicts : [];
      const warnings = [];
      if (confidence === 'low') warnings.push('低置信度：请核对后再保存');
      if (!sourceRefs.length) warnings.push('缺少来源链接');
      if (sourceRefs.length > 1) warnings.push('多来源已合并，请核对是否为同一场比赛');
      if (conflicts.length) warnings.push('来源存在冲突，请选择你确认后的字段值');
      card.innerHTML = '<label>标题<input name="title" required></label><div class="ai-schedule-time-grid"><label>日期<input name="date" type="date" required></label><label>开始<input name="start_time" type="time"></label><label>结束<input name="end_time" type="time"></label></div><div class="ai-match-meta-grid"><label>对手<input name="opponent"></label><label>赛事<input name="event"></label></div><label>来源链接<input name="sourceUrl" type="url"></label><label>备注<textarea name="notes" rows="2"></textarea></label><footer><button type="button" data-skip>忽略</button><button type="submit">确认写入日程</button></footer>';
      card.elements.title.value = row.title; card.elements.date.value = row.date; card.elements.start_time.value = row.start_time || ''; card.elements.end_time.value = row.end_time || ''; card.elements.opponent.value = row.opponent || ''; card.elements.event.value = row.event || ''; card.elements.sourceUrl.value = row.sourceUrl || row.sourceRefs?.[0]?.url || ''; card.elements.notes.value = row.notes || '';
      card.querySelector('[data-skip]').onclick = () => card.remove();
      card.onsubmit = async event => {
        event.preventDefault(); const button = card.querySelector('[type="submit"]'); button.disabled = true;
        card.dataset.saving = 'true';
        try {
          if ((confidence === 'low' || conflicts.length) && !window.confirm('这个候选项置信度较低、缺少来源或存在来源冲突。确认仍要写入日程吗？')) { button.disabled = false; return; }
          const permissions = await desktop.permissions.get();
          if (permissions.schedules !== 'write') { if (!window.confirm('保存日程需要授权 AI 读写日程数据。是否授权并继续？')) { button.disabled = false; return; } await desktop.permissions.set({ schedules: 'write' }); }
          const payload = { ...row, title: card.elements.title.value.trim(), date: card.elements.date.value, end_date: card.elements.date.value, start_time: card.elements.start_time.value, end_time: card.elements.end_time.value, all_day: !card.elements.start_time.value, opponent: card.elements.opponent.value.trim(), event: card.elements.event.value.trim(), sourceUrl: card.elements.sourceUrl.value.trim(), sourceRefs, confidence, notes: card.elements.notes.value.trim() };
          const proposal = await desktop.tools.propose({ conversationId: active.id, domain: 'schedules', operation: 'create', payload });
          await desktop.tools.decide({ id: proposal.id, approved: true, payload }); card.dataset.saved = 'true'; button.textContent = '已写入';
        } catch (error) { button.disabled = false; appendSystem(`日程保存失败：${error.message}`); }
        finally { card.dataset.saving = 'false'; }
      };
      const meta = document.createElement('div'); meta.className = 'ai-schedule-card-meta'; meta.innerHTML = `<small>候选 ${index + 1}</small><span data-confidence="${escapeHtml(confidence)}">${confidence === 'high' ? '高置信度' : confidence === 'medium' ? '中置信度' : '低置信度'}</span><span>${escapeHtml(sourceSummary)}</span>`;
      card.prepend(meta);
      if (sourceLinks) { const sources = document.createElement('div'); sources.className = 'ai-schedule-sources'; sources.innerHTML = sourceLinks; card.insertBefore(sources, card.querySelector('label')); }
      if (conflicts.length) { const conflict = document.createElement('div'); conflict.className = 'ai-schedule-conflicts'; conflict.innerHTML = conflicts.map(item => `<div><strong>${escapeHtml(item.label || item.field)}</strong><span>${(item.values || []).map(escapeHtml).join(' / ')}</span></div>`).join(''); card.insertBefore(conflict, card.querySelector('label')); }
      if (warnings.length) { const warning = document.createElement('div'); warning.className = 'ai-schedule-warning'; warning.textContent = warnings.join('；'); card.insertBefore(warning, card.querySelector('label')); }
      group.append(card);
    });
    messages.append(group); scrollToLatest();
  };
  const finishRequest = (status, errorMessage = '') => {
    const completedRequest = lastRequest;
    if (streamArticle) {
      if (status !== 'completed') { const statusNode = document.createElement('div'); statusNode.className = 'ai-message-status'; statusNode.textContent = status === 'stopped' ? '已停止生成' : `回复失败：${errorMessage}`; streamArticle.stack.append(statusNode); }
      if (status === 'failed') { const actions = document.createElement('div'); actions.className = 'ai-message-actions'; const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重试'; retry.onclick = () => retryLast(); actions.append(retry); streamArticle.stack.append(actions); }
    }
    if (active && streamText) active.messages.push({ role: 'assistant', content: streamText, status, createdAt: new Date().toISOString(), error: errorMessage ? { message: errorMessage } : null });
    currentRequestId = null; waitingForRequest = false; streamArticle = null; streamText = ''; updateComposer(); updateUsage();
  };
  desktop?.onStreamEvent(event => {
    if (waitingForRequest && !currentRequestId) currentRequestId = event.requestId;
    if (event.requestId !== currentRequestId) return;
    if (event.type === 'text_delta') { streamText += event.delta; streamArticle.bubble.classList.remove('ai-message-thinking'); streamArticle.bubble.textContent = streamText; scrollToLatest(); }
    if (event.type === 'tool_proposal') renderAgentProposals([event.proposal]);
    if (event.type === 'search_results') { setThinkingState(streamArticle, '正在整理搜索结果'); renderSearchSources(event.result); }
    if (event.type === 'memory_saved') appendSystem(`Kairos 已记住：${event.item.value}`);
    if (event.type === 'memory_forgotten') appendSystem(event.count ? `Kairos 已忘记 ${event.count} 条相关记忆。` : '没有找到需要遗忘的记忆。');
    if (event.type === 'conversation_title' && active) { active.title = event.title; sessions = sessions.map(item => item.id === active.id ? { ...item, title: event.title } : item); renderSessions(); }
    if (event.type === 'completed') finishRequest('completed');
    if (event.type === 'stopped') finishRequest('stopped');
    if (event.type === 'failed') finishRequest('failed', event.message || '未知错误');
  });

  const startRequest = async ({ history, attachmentIds, attachmentNames = [], text = '', provider = ui.provider.value, model = ui.model.value, isRetry = false }) => {
    streamText = ''; streamArticle = appendMessage('assistant', ''); setThinkingState(streamArticle);
    waitingForRequest = true; updateComposer();
    try {
      let aiPreferences = {};
      try { aiPreferences = JSON.parse(localStorage.getItem('kairos-settings') || '{}').ai || {}; } catch {}
      const result = await desktop.sendMessage({ conversationId: active.id, provider, model, messages: history, attachmentIds, attachmentNames, isRetry, aiPreferences });
      currentRequestId = result.requestId; updateComposer();
    } catch (error) { finishRequest('failed', errorText(error)); }
  };
  const retryLast = () => { if (!currentRequestId && lastRequest) startRequest({ ...lastRequest, isRetry: true }); };
  const setThinkingState = (article, label = '正在思考') => {
    if (!article) return;
    const labelNode = document.createElement('span'); labelNode.className = 'ai-thinking-label'; labelNode.textContent = label;
    const dots = document.createElement('span'); dots.className = 'ai-thinking-dots'; dots.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < 3; index++) { const dot = document.createElement('i'); dot.style.setProperty('--dot-index', index); dots.append(dot); }
    article.bubble.classList.add('ai-message-thinking'); article.bubble.replaceChildren(labelNode, dots);
  };
  const renderAgentProposals = rows => {
    if (!rows?.length) return;
    const group = document.createElement('section'); group.className = 'ai-schedule-proposals';
    const heading = document.createElement('strong'); heading.textContent = 'Kairos 已生成待确认提案'; group.append(heading);
    rows.forEach((row, index) => {
      const proposal = row.payload || {}; const targetDomain = row.domain === 'studyPlans' ? 'schedules' : row.domain; const card = document.createElement('form'); card.className = 'ai-schedule-card';
      const inferred = row.inferredFields?.length ? `推测：${row.inferredFields.join('、')}` : '信息明确';
      if (row.operation === 'delete_many') {
        card.classList.add('ai-schedule-delete-card');
        card.innerHTML = '<div class="ai-schedule-card-meta"><small>取消日程</small><span data-confidence="high">待确认</span></div><div class="ai-schedule-warning"></div><div class="ai-schedule-delete-list" style="display:grid;gap:5px;padding:7px 8px;border:1px solid var(--border);border-radius:8px;background:var(--background)"></div><footer><button type="button" data-skip>保留</button><button type="submit" style="border-color:var(--destructive);background:var(--destructive)">确认取消</button></footer>';
        card.querySelector('.ai-schedule-warning').textContent = `将取消 ${proposal.items?.length || proposal.ids?.length || 0} 项日程；确认前不会修改数据。`;
        const list = card.querySelector('.ai-schedule-delete-list');
        (proposal.items || []).forEach(item => { const line = document.createElement('div'); const title = document.createElement('strong'); const time = document.createElement('small'); line.style.cssText = 'display:flex;justify-content:space-between;gap:10px;font-size:10px'; title.textContent = item.title || '未命名日程'; time.textContent = `${item.date || ''}${item.end_date && item.end_date !== item.date ? ` – ${item.end_date}` : ''}`; time.style.color = 'var(--muted-foreground)'; line.append(title, time); list.append(line); });
        card.querySelector('[data-skip]').onclick = () => card.remove();
        card.onsubmit = async event => { event.preventDefault(); const button = card.querySelector('[type="submit"]'); button.disabled = true; try { const permissions = await desktop.permissions.get(); if (permissions.schedules !== 'write') { if (!window.confirm('允许 Kairos 取消这些日程吗？')) { button.disabled = false; return; } await desktop.permissions.set({ schedules: 'write' }); } const created = await desktop.tools.propose({ conversationId: active.id, domain: 'schedules', operation: 'delete_many', payload: proposal }); await desktop.tools.decide({ id: created.id, approved: true, payload: proposal }); card.dataset.saved = 'true'; button.textContent = '已取消'; } catch (error) { button.disabled = false; appendSystem(`取消失败：${errorText(error)}`); } };
        group.append(card); return;
      }
      card.innerHTML = '<div class="ai-schedule-card-meta"><small></small><span data-confidence="medium"></span></div><label>标题<input name="title" required></label><label>类型<select name="type"><option value="task">任务</option><option value="deadline">截止</option><option value="event">事件</option><option value="match">比赛</option><option value="holiday">节日</option><option value="other">其他</option></select></label><div class="ai-schedule-time-grid"><label>日期<input name="date" type="date" required></label><label>开始<input name="start_time" type="time"></label><label>结束<input name="end_time" type="time"></label></div><label>结束日期<input name="end_date" type="date"></label><label>来源链接<input name="source_url" type="url"></label><label>备注<textarea name="notes" rows="2"></textarea></label><footer><button type="button" data-skip>忽略</button><button type="submit">确认写入</button></footer>';
      card.querySelector('small').textContent = `提案 ${index + 1} · ${row.operation === 'update' ? '修改日程' : targetDomain === 'tasks' ? '任务' : '日程'}`;
      card.querySelector('[data-confidence]').textContent = inferred;
      card.elements.title.value = proposal.title || ''; card.elements.type.value = proposal.type || (targetDomain === 'tasks' ? 'task' : 'other'); card.elements.type.style.cssText = 'box-sizing:border-box;width:100%;padding:6px 7px;border:1px solid var(--input);border-radius:7px;background:var(--background);color:var(--foreground);font-size:11px'; card.elements.date.value = proposal.date || proposal.start_date || ''; card.elements.end_date.value = proposal.end_date || ''; card.elements.start_time.value = proposal.start_time || ''; card.elements.end_time.value = proposal.end_time || ''; card.elements.source_url.value = proposal.source_url || proposal.sourceUrl || ''; card.elements.notes.value = proposal.notes || '';
      if (proposal.recurrence?.frequency === 'weekly' && Array.isArray(proposal.recurrence.weekdays)) { const names = ['周日','周一','周二','周三','周四','周五','周六']; const repeat = document.createElement('div'); repeat.textContent = `重复：每周${proposal.recurrence.weekdays.map(day => names[day] || '').filter(Boolean).join('、')}${proposal.recurrence.until ? `，至 ${proposal.recurrence.until}` : ''}`; repeat.style.cssText = 'padding:6px 8px;border:1px solid color-mix(in oklch,var(--primary) 20%,var(--border));border-radius:8px;background:color-mix(in oklch,var(--primary) 7%,var(--background));color:var(--muted-foreground);font-size:10px'; card.insertBefore(repeat, card.querySelector('footer')); }
      card.querySelector('[data-skip]').onclick = () => card.remove();
      card.onsubmit = async event => { event.preventDefault(); const button = card.querySelector('[type="submit"]'); button.disabled = true; try {
        const permissions = await desktop.permissions.get(); if (permissions[targetDomain] !== 'write') { if (!window.confirm(`允许 Kairos 写入${targetDomain === 'tasks' ? '任务' : '日程'}吗？`)) { button.disabled=false; return; } await desktop.permissions.set({ [targetDomain]: 'write' }); }
        const date = card.elements.date.value; const payload = { ...proposal, title: card.elements.title.value.trim(), type: card.elements.type.value, source_url: card.elements.source_url.value.trim(), sourceUrl: card.elements.source_url.value.trim(), notes: card.elements.notes.value.trim() };
        payload.date = date; payload.end_date = card.elements.end_date.value || date; payload.start_time = card.elements.start_time.value; payload.end_time = card.elements.end_time.value; payload.all_day = !payload.start_time; if (row.domain === 'studyPlans') payload.type = 'other';
        const operation = row.operation || 'create'; const created = await desktop.tools.propose({ conversationId: active.id, domain: targetDomain, operation, payload }); await desktop.tools.decide({ id: created.id, approved: true, payload }); card.dataset.saved='true'; button.textContent = operation === 'update' ? '已修改日程' : '已写入日程';
      } catch (error) { button.disabled=false; appendSystem(`写入失败：${error.message}`); } };
      group.append(card);
    }); messages.append(group); scrollToLatest();
  };
  const renderSearchSources = result => {
    if (!result?.items?.length) return;
    const details = document.createElement('details'); details.className = 'ai-search-sources';
    const summary = document.createElement('summary'); const indicator = document.createElement('span'); indicator.className = 'material-symbols-outlined'; indicator.textContent = 'travel_explore';
    const text = document.createElement('span'); const attempted = Number(result.reader?.attempted || 0); const successful = Number(result.reader?.successful || 0); text.textContent = attempted ? (successful ? `已读正文 ${successful}/${attempted} 篇 · ${result.items.length} 个来源` : `未读到正文 · ${result.items.length} 个来源`) : `已检索 ${result.items.length} 个来源 · 查看来源`; summary.append(indicator, text); details.append(summary);
    const list = document.createElement('div'); list.className = 'ai-search-source-list';
    result.items.forEach(item => { const link = document.createElement('a'); link.href=item.url; link.target='_blank'; link.rel='noreferrer'; const title=document.createElement('strong'); title.textContent=item.title||item.url; const domain=document.createElement('small'); try { domain.textContent=`${new URL(item.url).hostname}${item.contentSource === 'firecrawl_markdown' ? ' · 已读正文' : ' · 仅摘要'}`; } catch { domain.textContent=item.url; } if (item.readerError) link.title = `正文读取失败：${item.readerError}`; link.append(title,domain); list.append(link); });
    details.append(list); details.addEventListener('toggle', () => { if (followLatest) scrollToLatest(true); }); messages.append(details); scrollToLatest();
  };
  const submit = async () => {
    if (currentRequestId) { await desktop.stopMessage(currentRequestId); return; }
    const text = input.value.trim(); if (!text || !active || !desktop) return;
    const assessment = await desktop.context.assess(active.id, ui.provider.value);
    if (assessment.requiresDecision) {
      const summarize = window.confirm('当前会话接近上下文上限。\n确定：生成摘要后继续\n取消：新建会话');
      const result = await desktop.context.resolve(active.id, summarize ? 'summarize' : 'new_conversation', true);
      if (!summarize) { sessions.unshift(result.conversation); await loadConversation(result.conversation.id); }
    }
    const attachmentNames = pendingAttachments.filter(item => item.status === 'ready').map(item => item.name);
    const userMessage = { role: 'user', content: text, status: 'completed', createdAt: new Date().toISOString(), attachmentNames };
    active.messages.push(userMessage); appendMessage('user', text, { attachments: attachmentNames, forceScroll: true }); input.value = ''; await desktop.conversations.update(active.id, { draft: '' });
    const history = active.messages.filter(item => ['user', 'assistant'].includes(item.role) && item.content).map(item => ({ role: item.role, content: item.content }));
    const attachmentIds = pendingAttachments.filter(item => item.status === 'ready').map(item => item.id);
    lastRequest = { history, attachmentIds, attachmentNames, text, provider: ui.provider.value, model: ui.model.value }; pendingAttachments = []; renderAttachments(); updateComposer();
    await startRequest(lastRequest);
  };

  input.addEventListener('input', () => {
    updateComposer(); clearTimeout(draftTimer);
    draftTimer = setTimeout(() => active && desktop?.conversations.update(active.id, { draft: input.value }), 350);
  });
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); } });
  send.addEventListener('click', submit);
  ui.attach?.addEventListener('click', () => ui.files.click());
  ui.files?.addEventListener('change', async () => { await addFiles([...ui.files.files]); ui.files.value = ''; });
    ui.retain?.addEventListener('change', () => {
      const label = $('aiRetainLabel');
      if (label) label.textContent = ui.retain.checked ? 'Retain attachments' : 'Attachments';
      ui.retain.closest('label')?.setAttribute('title', ui.retain.checked ? 'Files will persist across sessions' : 'Files will be cleaned up after processing');
    });
  ui.rename?.addEventListener('click', () => {
    if (!ui.name || ui.name.parentElement.querySelector('.ai-assistant-name-editor')) return;
    const editor = document.createElement('input'); editor.className = 'ai-assistant-name-editor'; editor.value = getAssistantName(); editor.maxLength = 32; editor.setAttribute('aria-label', 'AI 助手名称');
    let cancelled = false;
    const finish = save => { if (!editor.isConnected) return; const next = editor.value.trim(); if (save && next) localStorage.setItem(assistantNameKey, next.slice(0, 32)); editor.remove(); ui.name.hidden = false; ui.name.textContent = getAssistantName(); if (save && next) renderMessages(); };
    editor.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); finish(true); } if (event.key === 'Escape') { event.preventDefault(); cancelled = true; finish(false); } };
    editor.onblur = () => finish(!cancelled); ui.name.hidden = true; ui.name.after(editor); editor.focus(); editor.select();
  });
  ui.session?.addEventListener('change', runAction(() => loadConversation(ui.session.value)));
  ui.create?.addEventListener('click', runAction(createConversation));
  ui.remove?.addEventListener('click', runAction(async () => {
    if (!initialized || !active) throw new Error('会话尚未加载完成');
    const ok=await kairosConfirmAlert({title:'Delete conversation?',description:`Conversation "${active.title || 'New chat'}" and its related attachments will be removed. This action cannot be undone.`,action:'Delete',cancel:'Cancel'});
    if (!ok) return;
    const id = active.id; await desktop.conversations.delete(id); sessions = sessions.filter(item => item.id !== id);
    if (!sessions.length) await createConversation(); else await loadConversation(sessions[0].id);
  }));
  ui.provider?.addEventListener('change', runAction(async () => {
    if (!active) throw new Error('会话尚未加载完成');
    const provider = providers.find(item => item.id === ui.provider.value); renderModels(provider?.defaultModel);
    active = { ...active, provider: ui.provider.value, model: ui.model.value };
    await desktop.conversations.update(active.id, { provider: active.provider, model: active.model });
  }));
  ui.model?.addEventListener('change', runAction(async () => { if (!active) throw new Error('会话尚未加载完成'); active.model = ui.model.value.trim(); await desktop.conversations.update(active.id, { model: active.model }); }));
  $('closeAiPanel')?.addEventListener('click', () => {
    if (windowMode) desktop?.closeAiWindow?.();
    else panel.close();
  });
  if (!windowMode) {
    panel.addEventListener('close', () => input.blur());
    new MutationObserver(() => { if (panel.open) { renderMessages(); input.focus(); } }).observe(panel, { attributes: true, attributeFilter: ['open'] });
  }
  initialize()
    .then(() => { if (windowMode) { renderMessages(); input.focus(); } })
    .catch(error => { initializationError = error.message || String(error); initialized = false; renderMessages(); updateComposer(); });
})();
