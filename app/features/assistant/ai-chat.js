(() => {
  const $ = id => document.getElementById(id);
  const tr = (key, params, fallback = key) => window.KairosI18n?.t?.(key, params, fallback) || fallback;
  const trPlural = (key, count, fallback) => window.KairosI18n?.plural?.(key, count, {}, fallback) || fallback;
  const desktop = window.kairosDesktop;
  const applyAppSettings = state => {
    const settings = state?.settings || {};
    document.documentElement.classList.toggle('kairos-reduce-motion', settings?.accessibility?.reduceMotion === true);
    window.KairosThemes?.applyTheme?.(settings?.appearance?.theme);
    window.KairosI18n?.setLocale?.(settings?.general?.language);
    window.KairosI18n?.setTimeFormat?.(settings?.general?.timeFormat);
  };
  desktop?.appState?.get?.().then(applyAppSettings).catch(() => {});
  desktop?.appState?.onChanged?.(applyAppSettings);
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
  let providerSettings = {};
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
  const legacyAssistantNameKey = 'kairos-ai-assistant-name';
  const legacyAvatarKey = 'kairos-ai-avatar';
  let assistantProfile = { name: 'Kairos Assistant', avatar: '', updatedAt: '', migratedAt: '' };
  const getAssistantName = () => assistantProfile.name || 'Kairos Assistant';
  if (ui.name) ui.name.textContent = getAssistantName();
  const enhanceAiCombobox = select => {
    if (!select || select.dataset.comboboxReady) return () => {};
    select.dataset.comboboxReady = 'true';
    select.closest('label')?.classList.add('kairos-combobox-field','ai-combobox-field');
    const root = document.createElement('div');
    root.className = 'kairos-combobox ai-combobox';
    root.innerHTML = `<button class="kairos-combobox-input" type="button" role="combobox" aria-haspopup="listbox" aria-expanded="false"><span></span><i class="material-symbols-outlined">expand_more</i></button><section class="kairos-combobox-content" hidden><div class="kairos-combobox-empty" hidden>${tr('assistant.noItems', {}, 'No items found.')}</div><div class="kairos-combobox-list" role="listbox"></div></section>`;
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
  const kairosConfirmAlert=({title,description,action=tr('common.continue', {}, 'Continue'),cancel=tr('common.cancel', {}, 'Cancel'),tone='danger'}={})=>new Promise(resolve=>{
    let dialog=document.getElementById('kairosAlertDialog');
    if(!dialog){dialog=document.createElement('dialog');dialog.id='kairosAlertDialog';dialog.className='kairos-alert-dialog';dialog.setAttribute('role','alertdialog');dialog.innerHTML='<form method="dialog" class="kairos-alert-content"><div class="kairos-alert-header"><div class="kairos-alert-media"><span class="material-symbols-outlined">warning</span></div><div><h2 class="kairos-alert-title"></h2><p class="kairos-alert-description"></p></div></div><footer class="kairos-alert-footer"><button class="kairos-alert-cancel" value="cancel" type="submit"></button><button class="kairos-alert-action" value="confirm" type="submit"></button></footer></form>';document.body.append(dialog)}
    dialog.dataset.tone=tone;dialog.querySelector('.kairos-alert-title').textContent=title||tr('common.confirmTitle', {}, 'Are you sure?');dialog.querySelector('.kairos-alert-description').textContent=description||tr('common.confirmDescription', {}, 'This action cannot be undone.');dialog.querySelector('.kairos-alert-cancel').textContent=cancel;dialog.querySelector('.kairos-alert-action').textContent=action;
    const done=value=>{dialog.removeEventListener('close',onClose);resolve(value)};const onClose=()=>done(dialog.returnValue==='confirm');
    dialog.addEventListener('close',onClose,{once:true});dialog.showModal();dialog.querySelector('.kairos-alert-cancel')?.focus();
  });

  const setAvatar = value => value
    ? document.documentElement.style.setProperty('--ai-avatar-url', `url("${value}")`)
    : document.documentElement.style.removeProperty('--ai-avatar-url');
  const applyAssistantProfile = value => { assistantProfile = { ...assistantProfile, ...value }; if (ui.name) ui.name.textContent = getAssistantName(); setAvatar(assistantProfile.avatar); };
  const initializeAssistantProfile = async () => {
    const legacy = { name: localStorage.getItem(legacyAssistantNameKey) || '', avatar: localStorage.getItem(legacyAvatarKey) || '' };
    const profile = await desktop.initializeAssistantProfile(legacy);
    localStorage.removeItem(legacyAssistantNameKey); localStorage.removeItem(legacyAvatarKey); applyAssistantProfile(profile);
  };
  ui.avatarButton?.addEventListener('click', () => ui.avatarInput?.click());
  ui.avatarInput?.addEventListener('change', () => {
    const file = ui.avatarInput.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = async () => {
        const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
        const context = canvas.getContext('2d'); const scale = Math.max(256 / image.width, 256 / image.height);
        const width = image.width * scale; const height = image.height * scale;
        context.drawImage(image, (256 - width) / 2, (256 - height) / 2, width, height);
        const value = canvas.toDataURL('image/jpeg', .86); applyAssistantProfile(await desktop.saveAssistantProfile({ name: getAssistantName(), avatar: value }));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file); ui.avatarInput.value = '';
  });

  const latestButton = document.createElement('button'); latestButton.type = 'button'; latestButton.className = 'ai-scroll-latest'; latestButton.hidden = true; latestButton.innerHTML = '<span class="material-symbols-outlined">south</span><span></span>'; panel.append(latestButton);
  const nearLatest = () => messages.scrollHeight - messages.scrollTop - messages.clientHeight < 42;
  const updateLatestButton = () => { latestButton.hidden = followLatest || !unseenUpdates; latestButton.querySelector('span:last-child').textContent = unseenUpdates > 1 ? trPlural('assistant.newContentCount', unseenUpdates, `${unseenUpdates} new messages`) : tr('assistant.backToLatest', {}, 'Back to latest'); };
  const scrollToLatest = (force = false) => { if (force || followLatest) { messages.scrollTop = messages.scrollHeight; followLatest = true; unseenUpdates = 0; } else { unseenUpdates++; } updateLatestButton(); };
  latestButton.onclick = () => scrollToLatest(true);
  messages.addEventListener('scroll', () => { if (nearLatest()) { followLatest = true; unseenUpdates = 0; } else { followLatest = false; } updateLatestButton(); }, { passive: true });
  const timeLabel = value => window.KairosI18n?.formatTime?.(value ? new Date(value) : new Date()) || new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(value ? new Date(value) : new Date());
  const appendSystem = text => { const node = document.createElement('div'); node.className = 'ai-message-system'; node.textContent = text; messages.append(node); scrollToLatest(); return node; };
  const appendMessage = (role, text, options = {}) => {
    const article = document.createElement('article');
    const received = role === 'assistant';
    article.className = `ai-message ai-message-${received ? 'received' : 'sent'}`;
    if (received) { const avatar = document.createElement('div'); avatar.className = 'ai-avatar ai-message-avatar'; avatar.setAttribute('aria-hidden', 'true'); article.append(avatar); }
    const stack = document.createElement('div'); stack.className = 'ai-message-stack';
    const meta = document.createElement('div'); meta.className = 'ai-message-meta';
    const author = document.createElement('strong'); author.textContent = received ? getAssistantName() : tr('assistant.you', {}, 'You');
    const time = document.createElement('time'); time.textContent = timeLabel(options.createdAt); meta.append(author, time);
    const bubble = document.createElement('div'); bubble.className = 'ai-message-bubble'; bubble.textContent = text;
    stack.append(meta, bubble);
    if (options.attachments?.length) { const attachments = document.createElement('div'); attachments.className = 'ai-message-attachments'; attachments.textContent = tr('assistant.attachmentsWithNames', { names: options.attachments.join('、') }, `Attachments: ${options.attachments.join(', ')}`); stack.append(attachments); }
    if (options.status && options.status !== 'completed') { const status = document.createElement('div'); status.className = 'ai-message-status'; status.textContent = options.status === 'stopped' ? tr('assistant.generationStopped', {}, 'Generation stopped') : options.status === 'failed' ? tr('assistant.replyFailedWithError', { error: options.error ? `: ${options.error}` : '' }, `Reply failed${options.error ? `: ${options.error}` : ''}`) : options.status; stack.append(status); }
    article.append(stack); messages.append(article); scrollToLatest(Boolean(options.forceScroll));
    return { article, stack, bubble };
  };
  const renderMessages = () => {
    messages.replaceChildren();
    const date = document.createElement('div'); date.className = 'ai-chat-date'; date.textContent = tr('assistant.today', {}, 'Today'); messages.append(date);
    if (initializationError) { appendSystem(tr('assistant.initializationFailed', { error: initializationError }, `AI initialization failed: ${initializationError}`)); return; }
    if (!active?.messages?.length) appendMessage('assistant', tr('assistant.welcome', {}, 'Hello, I am here. What would you like to work on first today?'));
    else active.messages.forEach(message => appendMessage(message.role, message.content, { createdAt: message.createdAt, status: message.status, error: message.error?.message, attachments: message.attachmentNames }));
    scrollToLatest(true);
  };
  const renderSessions = () => {
    ui.session.replaceChildren(...sessions.map(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.title || tr('assistant.newConversation', {}, 'New conversation'); option.selected = item.id === active?.id; return option; }));
    aiComboboxSync.forEach(sync=>sync?.());
  };
  const renderProviders = () => {
    const options = providers.map(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.name; return option; });
    const currentProvider = active?.provider || '';
    if (currentProvider && !providers.some(item => item.id === currentProvider)) {
      const retired = document.createElement('option'); retired.value = currentProvider; retired.textContent = `${providerSettings?.retiredProviders?.[currentProvider]?.name || currentProvider} · ${tr('assistant.providerUnavailable', {}, 'Unavailable')}`; retired.disabled = true; options.push(retired);
    }
    ui.provider.replaceChildren(...options);
    ui.provider.value = currentProvider || providerSettings.defaultProvider || providers[0]?.id || '';
    renderModels(active?.model);
    aiComboboxSync.forEach(sync=>sync?.());
  };
  const renderModels = selectedModel => {
    const provider = providers.find(item => item.id === ui.provider.value);
    const models = [...new Set((provider?.models || []).filter(Boolean))];
    const options = models.map(model => { const option = document.createElement('option'); option.value = model; option.textContent = model; return option; });
    if (selectedModel && !models.includes(selectedModel)) { const unavailable = document.createElement('option'); unavailable.value = selectedModel; unavailable.textContent = `${selectedModel} · ${tr('assistant.modelUnavailable', {}, 'Unavailable')}`; unavailable.disabled = true; options.push(unavailable); }
    ui.model.replaceChildren(...options);
    ui.model.value = selectedModel || provider?.defaultModel || '';
    aiComboboxSync.forEach(sync=>sync?.());
    return ui.model.value;
  };
  desktop?.onProviderSettingsChanged?.(({ providers: nextProviders, settings }) => {
    if (!Array.isArray(nextProviders) || !nextProviders.length) return;
    providers = nextProviders;
    providerSettings = settings || providerSettings;
    if (active) { renderProviders(); updateComposer(); }
  });
  const updateUsage = async () => {
    if (!desktop || !active) return;
    const usage = await desktop.getUsage({ conversationId: active.id });
    ui.usage.textContent = `${trPlural('assistant.requestCount', usage.requests, `${usage.requests} requests`)} · ${window.KairosI18n?.formatNumber?.(usage.inputTokens + usage.outputTokens) || usage.inputTokens + usage.outputTokens} ${tr('assistant.tokens', {}, 'tokens')}`;
  };
  const updateComposer = () => {
    const provider = providers.find(item => item.id === ui.provider.value);
    const selectable = Boolean(provider && provider.models?.includes(ui.model.value));
    send.disabled = (!input.value.trim() && !currentRequestId) || !active || (!currentRequestId && !selectable);
    input.disabled = Boolean(currentRequestId);
    input.setAttribute('aria-invalid', String(!selectable));
    send.querySelector('.material-symbols-outlined').textContent = currentRequestId ? 'stop' : 'arrow_upward'; send.classList.toggle('is-stopping', Boolean(currentRequestId));
    send.setAttribute('aria-label', currentRequestId ? tr('assistant.stopGeneration', {}, 'Stop generation') : tr('assistant.send', {}, 'Send message'));
    input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  };
  const loadConversation = async id => {
    if (!desktop) return;
    active = await desktop.conversations.get(id);
    if (!active) return;
    renderSessions(); renderProviders(); renderMessages();
    input.value = active.draft || ''; pendingAttachments = []; renderAttachments(); updateComposer(); await updateUsage();
  };
  const finalizeActiveConversation = () => active?.id && desktop?.personalProfile?.finalize
    ? desktop.personalProfile.finalize(active.id).catch(() => ({ queued: false }))
    : Promise.resolve({ queued: false });
  const createConversation = async () => {
    if (!desktop) throw new Error(tr('assistant.desktopOnly', {}, 'AI is available only in Kairos desktop.'));
    await finalizeActiveConversation();
    const provider = ui.provider.value || providerSettings.defaultProvider || providers.find(item => item.defaultModel)?.id || providers[0]?.id || '';
    const model = ui.model.value || providers.find(item => item.id === provider)?.defaultModel || '';
    const created = await desktop.conversations.create({ title: tr('assistant.newConversation', {}, 'New conversation'), provider, model });
    sessions.unshift(created); await loadConversation(created.id); input.focus(); return active;
  };
  const initialize = async () => {
    if (!desktop) throw new Error(tr('assistant.desktopOnly', {}, 'AI is available only in Kairos desktop.'));
    await initializeAssistantProfile();
    providers = await desktop.listProviders();
    const settings = await desktop.getProviderSettings(); providerSettings = settings;
    sessions = await desktop.conversations.list();
    if (!sessions.length) { const provider = settings.defaultProvider || providers[0]?.id || 'openai'; sessions = [await desktop.conversations.create({ title: tr('assistant.newConversation', {}, 'New conversation'), provider, model: settings.providers?.[provider]?.model || '' })]; }
    active = await desktop.conversations.get(sessions[0].id); if (!active) throw new Error(tr('assistant.currentConversationUnavailable', {}, 'Unable to load the current conversation.'));
    initializationError = ''; initialized = true; active.messages ||= [];
    renderSessions(); renderProviders(); renderMessages(); input.value = active.draft || ''; updateComposer(); await updateUsage();
  };
  const errorText = error => error?.message || String(error || tr('errors.generic', {}, 'Something went wrong.'));
  const reportActionError = error => { appendSystem(tr('assistant.actionFailed', { error: errorText(error) }, `Action failed: ${errorText(error)}`)); };
  const runAction = action => async event => { try { await action(event); } catch (error) { reportActionError(error); } };

  const renderAttachments = () => {
    ui.tray.replaceChildren(...pendingAttachments.map(item => {
      const chip = document.createElement('div'); chip.className = 'ai-attachment-chip'; chip.dataset.status = item.status;
      const name = document.createElement('span'); name.textContent = item.status === 'preparing' ? tr('assistant.attachmentPreparing', { name: item.name }, `${item.name} (processing)`) : item.status === 'failed' ? tr('assistant.attachmentFailed', { name: item.name }, `${item.name} (failed)`) : item.name;
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', tr('assistant.removeAttachment', { name: item.name }, `Remove ${item.name}`));
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
    if (!rows.length) { appendSystem(tr('assistant.noScheduleItems', {}, 'No clear schedule items were found in the attachments.')); return; }
    const group = document.createElement('section'); group.className = 'ai-schedule-proposals';
    const heading = document.createElement('strong'); heading.textContent = trPlural('assistant.scheduleItemsFound', rows.length, `${rows.length} schedule items found. Confirm before saving.`); group.append(heading);
    const actions = document.createElement('div'); actions.className = 'ai-schedule-bulk-actions';
    actions.innerHTML = `<button type="button" data-save-high>${tr('assistant.saveHighConfidence', {}, 'Save high confidence only')}</button><button type="button" data-save-all>${tr('assistant.confirmAll', {}, 'Confirm all')}</button><button type="button" data-skip-all>${tr('assistant.ignoreAll', {}, 'Ignore all')}</button>`;
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
      if (!window.confirm(tr('assistant.confirmSaveAllSchedules', {}, 'Save all current schedule candidates? Low-confidence items will still require individual confirmation.'))) return;
      await submitCards(pendingCards());
    };
    actions.querySelector('[data-skip-all]').onclick = () => {
      if (!window.confirm(tr('assistant.confirmIgnoreAllSchedules', {}, 'Ignore all current schedule candidates?'))) return;
      pendingCards().forEach(card => card.remove());
    };
    rows.forEach((row, index) => {
      const card = document.createElement('form'); card.className = 'ai-schedule-card';
      const confidence = row.confidence || (row.date && (row.sourceUrl || row.sourceRefs?.length) ? 'medium' : 'low');
      card.dataset.confidence = confidence;
      const sourceRefs = sourceRefsFor(row);
      const sourceSummary = sourceRefs.length ? trPlural('assistant.sourceCount', sourceRefs.length, `${sourceRefs.length} sources`) : tr('assistant.missingSource', {}, 'Missing source');
      const sourceLinks = sourceRefs.map(ref => `<a href="${escapeHtml(ref.url)}" title="${escapeHtml(ref.url)}">${escapeHtml(sourceRefLabel(ref))}</a>`).join('');
      const conflicts = Array.isArray(row.conflicts) ? row.conflicts : [];
      const warnings = [];
      if (confidence === 'low') warnings.push(tr('assistant.lowConfidenceWarning', {}, 'Low confidence: check before saving.'));
      if (!sourceRefs.length) warnings.push(tr('assistant.missingSourceLink', {}, 'Missing source link.'));
      if (sourceRefs.length > 1) warnings.push(tr('assistant.mergedSourcesWarning', {}, 'Multiple sources were merged. Check whether they refer to the same event.'));
      if (conflicts.length) warnings.push(tr('assistant.sourceConflictWarning', {}, 'Sources conflict. Choose the fields you confirm.'));
      card.innerHTML = `<label>${tr('schedule.title', {}, 'Title')}<input name="title" required></label><div class="ai-schedule-time-grid"><label>${tr('schedule.date', {}, 'Date')}<input name="date" type="date" required></label><label>${tr('schedule.startTime', {}, 'Start time')}<input name="start_time" type="time"></label><label>${tr('schedule.endTime', {}, 'End time')}<input name="end_time" type="time"></label></div><div class="ai-match-meta-grid"><label>${tr('assistant.opponent', {}, 'Opponent')}<input name="opponent"></label><label>${tr('assistant.event', {}, 'Event')}<input name="event"></label></div><label>${tr('assistant.sourceLink', {}, 'Source link')}<input name="sourceUrl" type="url"></label><label>${tr('schedule.notes', {}, 'Notes')}<textarea name="notes" rows="2"></textarea></label><footer><button type="button" data-skip>${tr('assistant.ignore', {}, 'Ignore')}</button><button type="submit">${tr('assistant.confirmWriteSchedule', {}, 'Confirm and save schedule')}</button></footer>`;
      card.elements.title.value = row.title; card.elements.date.value = row.date; card.elements.start_time.value = row.start_time || ''; card.elements.end_time.value = row.end_time || ''; card.elements.opponent.value = row.opponent || ''; card.elements.event.value = row.event || ''; card.elements.sourceUrl.value = row.sourceUrl || row.sourceRefs?.[0]?.url || ''; card.elements.notes.value = row.notes || '';
      card.querySelector('[data-skip]').onclick = () => card.remove();
      card.onsubmit = async event => {
        event.preventDefault(); const button = card.querySelector('[type="submit"]'); button.disabled = true;
        card.dataset.saving = 'true';
        try {
          if ((confidence === 'low' || conflicts.length) && !window.confirm(tr('assistant.confirmLowConfidenceSchedule', {}, 'This candidate has low confidence, missing sources, or conflicting sources. Save it anyway?'))) { button.disabled = false; return; }
          const permissions = await desktop.permissions.get();
          if (permissions.schedules !== 'write') { if (!window.confirm(tr('assistant.authorizeScheduleWrite', {}, 'Saving schedules requires permission for AI to read and write schedule data. Allow and continue?'))) { button.disabled = false; return; } await desktop.permissions.set({ schedules: 'write' }); }
          const payload = { ...row, title: card.elements.title.value.trim(), date: card.elements.date.value, end_date: card.elements.date.value, start_time: card.elements.start_time.value, end_time: card.elements.end_time.value, all_day: !card.elements.start_time.value, opponent: card.elements.opponent.value.trim(), event: card.elements.event.value.trim(), sourceUrl: card.elements.sourceUrl.value.trim(), sourceRefs, confidence, notes: card.elements.notes.value.trim() };
          const proposal = await desktop.tools.propose({ conversationId: active.id, domain: 'schedules', operation: 'create', payload });
          await desktop.tools.decide({ id: proposal.id, approved: true, payload }); card.dataset.saved = 'true'; button.textContent = tr('assistant.saved', {}, 'Saved');
        } catch (error) { button.disabled = false; appendSystem(tr('assistant.scheduleSaveFailed', { error: error.message }, `Schedule save failed: ${error.message}`)); }
        finally { card.dataset.saving = 'false'; }
      };
      const confidenceLabel = confidence === 'high' ? tr('assistant.highConfidence', {}, 'High confidence') : confidence === 'medium' ? tr('assistant.mediumConfidence', {}, 'Medium confidence') : tr('assistant.lowConfidence', {}, 'Low confidence');
      const meta = document.createElement('div'); meta.className = 'ai-schedule-card-meta'; meta.innerHTML = `<small>${tr('assistant.candidate', { count: index + 1 }, `Candidate ${index + 1}`)}</small><span data-confidence="${escapeHtml(confidence)}">${confidenceLabel}</span><span>${escapeHtml(sourceSummary)}</span>`;
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
      if (status !== 'completed') { const statusNode = document.createElement('div'); statusNode.className = 'ai-message-status'; statusNode.textContent = status === 'stopped' ? tr('assistant.generationStopped', {}, 'Generation stopped') : tr('assistant.replyFailedWithError', { error: errorMessage ? `: ${errorMessage}` : '' }, `Reply failed: ${errorMessage}`); streamArticle.stack.append(statusNode); }
      if (status === 'failed') { const actions = document.createElement('div'); actions.className = 'ai-message-actions'; const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = tr('common.retry', {}, 'Retry'); retry.onclick = () => retryLast(); actions.append(retry); streamArticle.stack.append(actions); }
    }
    if (active && streamText) active.messages.push({ role: 'assistant', content: streamText, status, createdAt: new Date().toISOString(), error: errorMessage ? { message: errorMessage } : null });
    currentRequestId = null; waitingForRequest = false; streamArticle = null; streamText = ''; updateComposer(); updateUsage();
  };
  const renderMusicAction = event => {
    const record = document.createElement('div'); record.className = 'ai-music-action-record';
    const icon = document.createElement('span'); icon.className = 'material-symbols-outlined'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = ['search','searching'].includes(event.action) ? 'search' : event.action === 'volume' ? 'volume_up' : event.action === 'liked' ? 'favorite' : 'graphic_eq';
    const label = document.createElement('span');
    const result = event.result || {};
    if (event.action === 'searching') label.textContent = tr('assistant.musicSearching', {}, 'Searching NetEase Music...');
    else if (event.action === 'search') { const count = ['songs','playlists','albums','artists'].reduce((sum, key) => sum + (result[key]?.length || 0), 0); label.textContent = tr('assistant.musicSearchRecord', { count }, `NetEase search · ${count} results`); }
    else if (event.action === 'play_next' && result.track?.title) label.textContent = tr('assistant.musicPlayNext', { title: result.track.title }, `Set “${result.track.title}” as next`);
    else if (event.action === 'play_now' && result.track?.title) label.textContent = tr('assistant.musicPlaying', { title: result.track.title }, `Playing “${result.track.title}”`);
    else if (event.action === 'replace_queue') label.textContent = tr('assistant.musicNewQueue', { count: result.playable || 0 }, `New queue · ${result.playable || 0} tracks`);
    else if (event.action === 'queue_cleared') label.textContent = tr('assistant.musicQueueCleared', {}, 'Music queue cleared');
    else if (event.action === 'queue_removed' && result.track?.title) label.textContent = tr('assistant.musicQueueRemoved', { title: result.track.title }, `Removed “${result.track.title}” from queue`);
    else if (event.action === 'queue_list') label.textContent = tr('assistant.musicQueueListed', { count: result.tracks?.length || 0 }, `Current queue · ${result.tracks?.length || 0} tracks`);
    else if (result.track?.title) label.textContent = `${result.track.title}${result.track.artist ? ` · ${result.track.artist}` : ''}`;
    else if (result.name) label.textContent = `${result.name} · ${tr('assistant.musicQueueReplaced', {}, 'queue replaced')}`;
    else if (event.action === 'volume') label.textContent = result.muted ? tr('assistant.musicMuted', {}, 'Music muted') : tr('assistant.musicVolumeRecord', { volume: result.volume }, `Volume ${result.volume}`);
    else label.textContent = tr('assistant.musicActionRecord', { action: event.action }, `Music · ${event.action}`);
    record.append(icon, label); messages.append(record); scrollToLatest();
  };
  desktop?.onStreamEvent(event => {
    if (waitingForRequest && !currentRequestId) currentRequestId = event.requestId;
    if (event.requestId !== currentRequestId) return;
    if (event.type === 'text_delta') { streamText += event.delta; streamArticle.bubble.classList.remove('ai-message-thinking'); streamArticle.bubble.textContent = streamText; scrollToLatest(); }
    if (event.type === 'tool_proposal') renderAgentProposals([event.proposal]);
    if (event.type === 'search_results') { setThinkingState(streamArticle, tr('assistant.organizingSearchResults', {}, 'Organizing search results')); renderSearchSources(event.result); }
    if (event.type === 'music_action') renderMusicAction(event);
    if (event.type === 'memory_saved') appendSystem(tr('assistant.memorySaved', { value: event.item.value }, `Kairos remembered: ${event.item.value}`));
    if (event.type === 'memory_forgotten') appendSystem(event.count ? trPlural('assistant.memoryForgottenCount', event.count, `Kairos forgot ${event.count} related memories.`) : tr('assistant.noMemoryToForget', {}, 'No related memories were found to forget.'));
    if (event.type === 'conversation_title' && active) { active.title = event.title; sessions = sessions.map(item => item.id === active.id ? { ...item, title: event.title } : item); renderSessions(); }
    if (event.type === 'completed') finishRequest('completed');
    if (event.type === 'stopped') finishRequest('stopped');
    if (event.type === 'failed') finishRequest('failed', event.message || tr('errors.generic', {}, 'Something went wrong.'));
  });

  const startRequest = async ({ history, attachmentIds, attachmentNames = [], text = '', provider = ui.provider.value, model = ui.model.value, isRetry = false }) => {
    streamText = ''; streamArticle = appendMessage('assistant', ''); setThinkingState(streamArticle);
    waitingForRequest = true; updateComposer();
    try {
      const aiPreferences = window.KairosSettingsFeature?.read?.().ai || {};
      const result = await desktop.sendMessage({ conversationId: active.id, provider, model, messages: history, attachmentIds, attachmentNames, isRetry, aiPreferences });
      currentRequestId = result.requestId; updateComposer();
    } catch (error) { finishRequest('failed', errorText(error)); }
  };
  const retryLast = () => { if (!currentRequestId && lastRequest) startRequest({ ...lastRequest, isRetry: true }); };
  const setThinkingState = (article, label = tr('assistant.thinking', {}, 'Thinking')) => {
    if (!article) return;
    const labelNode = document.createElement('span'); labelNode.className = 'ai-thinking-label'; labelNode.textContent = label;
    const dots = document.createElement('span'); dots.className = 'ai-thinking-dots'; dots.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < 3; index++) { const dot = document.createElement('i'); dot.style.setProperty('--dot-index', index); dots.append(dot); }
    article.bubble.classList.add('ai-message-thinking'); article.bubble.replaceChildren(labelNode, dots);
  };
  const renderAgentProposals = rows => {
    if (!rows?.length) return;
    const group = document.createElement('section'); group.className = 'ai-schedule-proposals';
    const heading = document.createElement('strong'); heading.textContent = tr('assistant.proposalsReady', {}, 'Kairos created proposals awaiting confirmation'); group.append(heading);
    rows.forEach((row, index) => {
      const proposal = row.payload || {}; const targetDomain = row.domain; const card = document.createElement('form'); card.className = 'ai-schedule-card';
      const inferred = row.inferredFields?.length ? tr('assistant.inferredFields', { fields: row.inferredFields.join('、') }, `Inferred: ${row.inferredFields.join(', ')}`) : tr('assistant.clearInformation', {}, 'Information is clear');
      if (row.operation === 'delete_many') {
        card.classList.add('ai-schedule-delete-card');
        card.innerHTML = `<div class="ai-schedule-card-meta"><small>${tr('assistant.cancelSchedules', {}, 'Cancel schedules')}</small><span data-confidence="high">${tr('assistant.pendingConfirmation', {}, 'Awaiting confirmation')}</span></div><div class="ai-schedule-warning"></div><div class="ai-schedule-delete-list" style="display:grid;gap:5px;padding:7px 8px;border:1px solid var(--border);border-radius:8px;background:var(--background)"></div><footer><button type="button" data-skip>${tr('assistant.keep', {}, 'Keep')}</button><button type="submit" style="border-color:var(--destructive);background:var(--destructive)">${tr('assistant.confirmCancel', {}, 'Confirm cancellation')}</button></footer>`;
        card.querySelector('.ai-schedule-warning').textContent = trPlural('assistant.cancelScheduleCount', proposal.items?.length || proposal.ids?.length || 0, `This will cancel ${proposal.items?.length || proposal.ids?.length || 0} schedules. No data changes before confirmation.`);
        const list = card.querySelector('.ai-schedule-delete-list');
        (proposal.items || []).forEach(item => { const line = document.createElement('div'); const title = document.createElement('strong'); const time = document.createElement('small'); line.style.cssText = 'display:flex;justify-content:space-between;gap:10px;font-size:10px'; title.textContent = item.title || tr('reminders.untitledSchedule', {}, 'Untitled schedule'); time.textContent = `${item.date || ''}${item.end_date && item.end_date !== item.date ? ` – ${item.end_date}` : ''}`; time.style.color = 'var(--muted-foreground)'; line.append(title, time); list.append(line); });
        card.querySelector('[data-skip]').onclick = () => card.remove();
        card.onsubmit = async event => { event.preventDefault(); const button = card.querySelector('[type="submit"]'); button.disabled = true; try { const permissions = await desktop.permissions.get(); if (permissions.schedules !== 'write') { if (!window.confirm(tr('assistant.authorizeScheduleCancel', {}, 'Allow Kairos to cancel these schedules?'))) { button.disabled = false; return; } await desktop.permissions.set({ schedules: 'write' }); } const created = await desktop.tools.propose({ conversationId: active.id, domain: 'schedules', operation: 'delete_many', payload: proposal }); await desktop.tools.decide({ id: created.id, approved: true, payload: proposal }); card.dataset.saved = 'true'; button.textContent = tr('assistant.cancelled', {}, 'Cancelled'); } catch (error) { button.disabled = false; appendSystem(tr('assistant.cancelFailed', { error: errorText(error) }, `Cancellation failed: ${errorText(error)}`)); } };
        group.append(card); return;
      }
      card.innerHTML = `<div class="ai-schedule-card-meta"><small></small><span data-confidence="medium"></span></div><label>${tr('schedule.title', {}, 'Title')}<input name="title" required></label><label>${tr('schedule.type', {}, 'Type')}<select name="type"><option value="task">${tr('schedule.task', {}, 'Task')}</option><option value="deadline">${tr('schedule.deadline', {}, 'Deadline')}</option><option value="event">${tr('schedule.event', {}, 'Event')}</option><option value="match">${tr('schedule.match', {}, 'Match')}</option><option value="holiday">${tr('schedule.holiday', {}, 'Holiday')}</option><option value="other">${tr('schedule.other', {}, 'Other')}</option></select></label><div class="ai-schedule-time-grid"><label>${tr('schedule.date', {}, 'Date')}<input name="date" type="date" required></label><label>${tr('schedule.startTime', {}, 'Start time')}<input name="start_time" type="time"></label><label>${tr('schedule.endTime', {}, 'End time')}<input name="end_time" type="time"></label></div><label>${tr('assistant.endDate', {}, 'End date')}<input name="end_date" type="date"></label><label>${tr('assistant.sourceLink', {}, 'Source link')}<input name="source_url" type="url"></label><label>${tr('schedule.notes', {}, 'Notes')}<textarea name="notes" rows="2"></textarea></label><footer><button type="button" data-skip>${tr('assistant.ignore', {}, 'Ignore')}</button><button type="submit">${tr('assistant.confirmWrite', {}, 'Confirm and save')}</button></footer>`;
      card.querySelector('small').textContent = tr('assistant.proposalSummary', { count: index + 1, kind: row.operation === 'update' ? tr('assistant.editSchedule', {}, 'Edit schedule') : targetDomain === 'tasks' ? tr('schedule.task', {}, 'Task') : tr('schedule.schedule', {}, 'Schedule') }, `Proposal ${index + 1} · ${row.operation === 'update' ? 'Edit schedule' : targetDomain === 'tasks' ? 'Task' : 'Schedule'}`);
      card.querySelector('[data-confidence]').textContent = inferred;
      card.elements.title.value = proposal.title || ''; card.elements.type.value = proposal.type || (targetDomain === 'tasks' ? 'task' : 'other'); card.elements.type.style.cssText = 'box-sizing:border-box;width:100%;padding:6px 7px;border:1px solid var(--input);border-radius:7px;background:var(--background);color:var(--foreground);font-size:11px'; card.elements.date.value = proposal.date || proposal.start_date || ''; card.elements.end_date.value = proposal.end_date || ''; card.elements.start_time.value = proposal.start_time || ''; card.elements.end_time.value = proposal.end_time || ''; card.elements.source_url.value = proposal.source_url || proposal.sourceUrl || ''; card.elements.notes.value = proposal.notes || '';
      if (proposal.recurrence?.frequency === 'weekly' && Array.isArray(proposal.recurrence.weekdays)) { const names = [tr('assistant.weekdaySun', {}, 'Sun'),tr('assistant.weekdayMon', {}, 'Mon'),tr('assistant.weekdayTue', {}, 'Tue'),tr('assistant.weekdayWed', {}, 'Wed'),tr('assistant.weekdayThu', {}, 'Thu'),tr('assistant.weekdayFri', {}, 'Fri'),tr('assistant.weekdaySat', {}, 'Sat')]; const repeat = document.createElement('div'); const days = proposal.recurrence.weekdays.map(day => names[day] || '').filter(Boolean).join(', '); repeat.textContent = tr('assistant.weeklyRepeat', { days, until: proposal.recurrence.until ? tr('assistant.untilDate', { date: proposal.recurrence.until }, `until ${proposal.recurrence.until}`) : '' }, `Repeats weekly: ${days}${proposal.recurrence.until ? `, until ${proposal.recurrence.until}` : ''}`); repeat.style.cssText = 'padding:6px 8px;border:1px solid color-mix(in oklch,var(--primary) 20%,var(--border));border-radius:8px;background:color-mix(in oklch,var(--primary) 7%,var(--background));color:var(--muted-foreground);font-size:10px'; card.insertBefore(repeat, card.querySelector('footer')); }
      card.querySelector('[data-skip]').onclick = () => card.remove();
      card.onsubmit = async event => { event.preventDefault(); const button = card.querySelector('[type="submit"]'); button.disabled = true; try {
        const kind = targetDomain === 'tasks' ? tr('schedule.task', {}, 'Task') : tr('schedule.schedule', {}, 'Schedule'); const permissions = await desktop.permissions.get(); if (permissions[targetDomain] !== 'write') { if (!window.confirm(tr('assistant.authorizeWrite', { kind }, `Allow Kairos to write ${kind}?`))) { button.disabled=false; return; } await desktop.permissions.set({ [targetDomain]: 'write' }); }
        const date = card.elements.date.value; const payload = { ...proposal, title: card.elements.title.value.trim(), type: card.elements.type.value, source_url: card.elements.source_url.value.trim(), sourceUrl: card.elements.source_url.value.trim(), notes: card.elements.notes.value.trim() };
        payload.date = date; payload.end_date = card.elements.end_date.value || date; payload.start_time = card.elements.start_time.value; payload.end_time = card.elements.end_time.value; payload.all_day = !payload.start_time;
        const operation = row.operation || 'create'; const created = await desktop.tools.propose({ conversationId: active.id, domain: targetDomain, operation, payload }); await desktop.tools.decide({ id: created.id, approved: true, payload }); card.dataset.saved='true'; button.textContent = operation === 'update' ? tr('assistant.scheduleUpdated', {}, 'Schedule updated') : tr('assistant.scheduleSaved', {}, 'Schedule saved');
      } catch (error) { button.disabled=false; appendSystem(tr('assistant.writeFailed', { error: error.message }, `Write failed: ${error.message}`)); } };
      group.append(card);
    }); messages.append(group); scrollToLatest();
  };
  const renderSearchSources = result => {
    if (!result?.items?.length) return;
    const details = document.createElement('details'); details.className = 'ai-search-sources';
    const summary = document.createElement('summary'); const indicator = document.createElement('span'); indicator.className = 'material-symbols-outlined'; indicator.textContent = 'travel_explore';
    const text = document.createElement('span'); const attempted = Number(result.reader?.attempted || 0); const successful = Number(result.reader?.successful || 0); text.textContent = attempted ? (successful ? tr('assistant.readSourcesSummary', { successful, attempted, count: result.items.length }, `Read ${successful}/${attempted} pages · ${result.items.length} sources`) : tr('assistant.noSourceBodySummary', { count: result.items.length }, `No page body read · ${result.items.length} sources`)) : tr('assistant.searchSourcesSummary', { count: result.items.length }, `Found ${result.items.length} sources · View sources`); summary.append(indicator, text); details.append(summary);
    const list = document.createElement('div'); list.className = 'ai-search-source-list';
    result.items.forEach(item => { const link = document.createElement('a'); link.href=item.url; link.target='_blank'; link.rel='noreferrer'; const title=document.createElement('strong'); title.textContent=item.title||item.url; const domain=document.createElement('small'); try { domain.textContent=`${new URL(item.url).hostname}${item.contentSource === 'firecrawl_markdown' ? tr('assistant.sourceBodyReadSuffix', {}, ' · Page body read') : tr('assistant.sourceSnippetOnlySuffix', {}, ' · Snippet only')}`; } catch { domain.textContent=item.url; } if (item.readerError) link.title = tr('assistant.sourceReadFailed', { error: item.readerError }, `Page body read failed: ${item.readerError}`); link.append(title,domain); list.append(link); });
    details.append(list); details.addEventListener('toggle', () => { if (followLatest) scrollToLatest(true); }); messages.append(details); scrollToLatest();
  };
  const submit = async () => {
    if (currentRequestId) { await desktop.stopMessage(currentRequestId); return; }
    const text = input.value.trim(); if (!text || !active || !desktop) return;
    const selectedProvider = providers.find(item => item.id === ui.provider.value);
    if (!selectedProvider?.models?.includes(ui.model.value)) { appendSystem(tr('assistant.modelUnavailableSendBlocked', {}, 'Choose an enabled model that has passed tool verification before sending.')); return; }
    const assessment = await desktop.context.assess(active.id, ui.provider.value);
    if (assessment.requiresDecision) {
      const summarize = window.confirm(tr('assistant.contextLimitDecision', {}, 'This conversation is close to the context limit.\nConfirm: summarize and continue\nCancel: start a new conversation'));
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
      if (label) label.textContent = ui.retain.checked ? tr('assistant.retainAttachments', {}, 'Retain attachments') : tr('assistant.attachments', {}, 'Attachments');
      ui.retain.closest('label')?.setAttribute('title', ui.retain.checked ? tr('assistant.retainAttachmentsHint', {}, 'Files will persist across sessions') : tr('assistant.attachmentsHint', {}, 'Files will be cleaned up after processing'));
    });
  ui.rename?.addEventListener('click', () => {
    if (!ui.name || ui.name.parentElement.querySelector('.ai-assistant-name-editor')) return;
    const editor = document.createElement('input'); editor.className = 'ai-assistant-name-editor'; editor.value = getAssistantName(); editor.maxLength = 32; editor.setAttribute('aria-label', tr('assistant.name', {}, 'Assistant name'));
    let cancelled = false;
    const finish = async save => { if (!editor.isConnected) return; const next = editor.value.trim(); editor.remove(); ui.name.hidden = false; if (save && next) { applyAssistantProfile(await desktop.saveAssistantProfile({ name: next.slice(0, 32), avatar: assistantProfile.avatar })); renderMessages(); } else ui.name.textContent = getAssistantName(); };
    editor.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); void finish(true); } if (event.key === 'Escape') { event.preventDefault(); cancelled = true; void finish(false); } };
    editor.onblur = () => void finish(!cancelled); ui.name.hidden = true; ui.name.after(editor); editor.focus(); editor.select();
  });
  ui.session?.addEventListener('change', runAction(async () => { await finalizeActiveConversation(); await loadConversation(ui.session.value); }));
  ui.create?.addEventListener('click', runAction(createConversation));
  ui.remove?.addEventListener('click', runAction(async () => {
    if (!initialized || !active) throw new Error(tr('assistant.conversationNotReady', {}, 'Conversation has not finished loading.'));
    const ok=await kairosConfirmAlert({title:tr('assistant.deleteConversation', {}, 'Delete conversation'),description:tr('assistant.deleteConversationDescription', { title: active.title || tr('assistant.newConversation', {}, 'New conversation') }, `Conversation "${active.title || 'New conversation'}" and its related attachments will be removed. This action cannot be undone.`),action:tr('common.delete', {}, 'Delete'),cancel:tr('common.cancel', {}, 'Cancel')});
    if (!ok) return;
    const id = active.id; await desktop.conversations.delete(id); sessions = sessions.filter(item => item.id !== id); active = null;
    if (!sessions.length) await createConversation(); else await loadConversation(sessions[0].id);
  }));
  ui.provider?.addEventListener('change', runAction(async () => {
    if (!active) throw new Error(tr('assistant.conversationNotReady', {}, 'Conversation has not finished loading.'));
    const provider = providers.find(item => item.id === ui.provider.value); renderModels(provider?.defaultModel);
    active = { ...active, provider: ui.provider.value, model: ui.model.value };
    await desktop.conversations.update(active.id, { provider: active.provider, model: active.model });
    updateComposer();
  }));
  ui.model?.addEventListener('change', runAction(async () => { if (!active) throw new Error(tr('assistant.conversationNotReady', {}, 'Conversation has not finished loading.')); active.model = ui.model.value.trim(); await desktop.conversations.update(active.id, { model: active.model }); updateComposer(); }));
  $('closeAiPanel')?.addEventListener('click', () => {
    void finalizeActiveConversation();
    if (windowMode) desktop?.closeAiWindow?.();
    else panel.close();
  });
  if (!windowMode) {
    panel.addEventListener('close', () => input.blur());
    if (panel instanceof Node) new MutationObserver(() => { if (panel.open) { renderMessages(); input.focus(); } }).observe(panel, { attributes: true, attributeFilter: ['open'] });
  }
  window.addEventListener('kairos:locale-changed', () => {
    if (!initialized) return;
    document.title = tr('app.title.assistant', {}, 'Kairos Assistant');
    renderSessions();
    renderMessages();
    renderAttachments();
    updateComposer();
    void updateUsage();
  });
  document.title = tr('app.title.assistant', {}, 'Kairos Assistant');
  initialize()
    .then(() => { if (windowMode) { renderMessages(); input.focus(); } })
    .catch(error => { initializationError = error.message || String(error); initialized = false; renderMessages(); updateComposer(); });
})();
