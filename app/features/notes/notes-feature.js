(() => {
  const KEY = 'kairos-mvp-state';
  const core = window.KairosNoteCore;
  let state = { notes: [], moods: {} };
  let editing = null;
  let selectedAttachments = [];

  const $ = selector => document.querySelector(selector);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const uid = () => `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const today = () => core?.dateKey?.() || new Date().toISOString().slice(0, 10);
  const normalizeState = input => ({ ...input, notes: core.normalizeNotes(input?.notes || []), moods: input?.moods && typeof input.moods === 'object' && !Array.isArray(input.moods) ? input.moods : {} });
  const formatBytes = bytes => {
    const value = Number(bytes || 0);
    if (!value) return '0 KB';
    if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
    return `${(value / 1024 / 1024).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  };
  const readLocal = () => { try { return normalizeState(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { return normalizeState({}); } };
  const save = () => {
    window.dispatchEvent(new CustomEvent('kairos:state-changed', { detail: state }));
    try { if (window.top !== window) window.top.postMessage({ type: 'kairos:state-sync', state }, '*'); } catch {}
    window.kairosDesktop?.appState?.save?.(state).catch(console.error);
  };

  function load() {
    state = readLocal();
    if (window.kairosDesktop?.appState?.initialize) {
      window.kairosDesktop.appState.initialize(state).then(next => {
        state = normalizeState({ ...state, ...next, notes: [...(next.notes || []), ...(state.notes || []).filter(note => !(next.notes || []).some(existing => existing.id === note.id))] });
        window.kairosDesktop.appState.save(state).catch(console.error);
        localStorage.removeItem(KEY);
        render();
      }).catch(console.error);
      window.kairosDesktop.appState.onChanged?.(next => {
        state = normalizeState(next);
        render();
      });
    }
  }

  function moodLabel(mood) {
    return ({ calm: 'Calm', happy: 'Happy', focused: 'Focused', tired: 'Tired', stressed: 'Stressed', sad: 'Sad', excited: 'Excited', neutral: 'Neutral' })[mood] || 'No mood';
  }

  function renderMoods() {
    const grid = $('[data-mood-grid]');
    if (!grid) return;
    const current = state.moods?.[today()] || '';
    grid.innerHTML = core.MOODS.map(mood => `<button class="${current === mood ? 'active' : ''}" data-mood="${mood}" type="button">${moodLabel(mood)}</button>`).join('');
    grid.querySelectorAll('[data-mood]').forEach(button => button.onclick = () => {
      state.moods = core.setMood(state.moods, today(), button.dataset.mood === current ? '' : button.dataset.mood);
      save();
      render();
    });
  }

  function renderList() {
    const list = $('[data-note-list]');
    if (!list) return;
    const query = $('[data-note-search]')?.value || '';
    const date = $('[data-note-date]')?.value || '';
    const rows = core.searchNotes(state.notes, query, date ? { date } : {});
    list.innerHTML = rows.length ? rows.map(note => `
      <article class="note-card" data-note-id="${escape(note.id)}">
        <button class="note-open" data-note-open="${escape(note.id)}" type="button">
          <h3>${escape(note.title)}</h3><p>${escape(note.text || 'No text yet.')}</p><span class="note-meta"><span>${escape(note.date)}</span>${note.mood ? `<span>${escape(moodLabel(note.mood))}</span>` : ''}${note.attachments?.length ? `<span>${note.attachments.length} attachment${note.attachments.length === 1 ? '' : 's'}</span>` : ''}${note.tags.map(tag => `<span>#${escape(tag)}</span>`).join('')}</span>
        </button>
        <span class="note-actions"><button data-note-remove="${escape(note.id)}" type="button" aria-label="Delete note"><span class="material-symbols-outlined">delete</span></button></span>
      </article>`).join('') : '<div class="notes-empty"><strong>No notes found.</strong><br><small>Add a reflection or clear the filters.</small></div>';
    list.querySelectorAll('[data-note-open]').forEach(button => button.onclick = event => {
      if (event.target.closest('[data-note-remove]')) return;
      openEditor(button.dataset.noteOpen);
    });
    list.querySelectorAll('[data-note-remove]').forEach(button => button.onclick = event => {
      event.stopPropagation();
      removeNote(button.dataset.noteRemove);
    });
  }

  function render() {
    renderMoods();
    renderList();
  }

  function renderAttachmentList() {
    const list = $('[data-note-attachment-list]');
    if (!list) return;
    list.innerHTML = selectedAttachments.length ? selectedAttachments.map((item, index) => `
      <span class="note-attachment-chip" data-attachment-index="${index}">
        ${item.dataUrl && item.type?.startsWith('image/') ? `<img src="${escape(item.dataUrl)}" alt="">` : '<span class="note-attachment-icon material-symbols-outlined">draft</span>'}
        <span><strong>${escape(item.name || 'Attachment')}</strong><small>${escape(item.type || 'file')} · ${formatBytes(item.size)}</small></span>
        <button data-remove-attachment="${index}" type="button" aria-label="Remove attachment"><span class="material-symbols-outlined">close</span></button>
      </span>`).join('') : '<span class="note-attachment-hint">No attachments yet.</span>';
    list.querySelectorAll('[data-remove-attachment]').forEach(button => button.onclick = () => {
      selectedAttachments.splice(Number(button.dataset.removeAttachment), 1);
      renderAttachmentList();
    });
  }

  function readAttachment(file) {
    return new Promise(resolve => {
      const base = { id: uid(), name: file.name, type: file.type || 'application/octet-stream', size: file.size, added_at: new Date().toISOString() };
      if (!file.type?.startsWith('image/') || file.size > 4 * 1024 * 1024) return resolve(base);
      const reader = new FileReader();
      reader.onload = () => resolve({ ...base, dataUrl: String(reader.result || '') });
      reader.onerror = () => resolve(base);
      reader.readAsDataURL(file);
    });
  }

  function openEditor(id = '') {
    const dialog = $('#noteEditor');
    const form = dialog.querySelector('form');
    const note = state.notes.find(item => item.id === id);
    editing = note?.id || null;
    form.reset();
    form.mood.innerHTML = '<option value="">No mood</option>' + core.MOODS.map(mood => `<option value="${mood}">${moodLabel(mood)}</option>`).join('');
    form.title.value = note?.title || '';
    form.date.value = note?.date || today();
    form.mood.value = note?.mood || '';
    form.tags.value = (note?.tags || []).join(', ');
    form.linkedScheduleIds.value = (note?.linkedScheduleIds || []).join(', ');
    form.text.value = note?.text || '';
    selectedAttachments = [...(note?.attachments || [])];
    renderAttachmentList();
    dialog.querySelector('[data-note-dialog-title]').textContent = note ? 'Edit Note' : 'Add Note';
    dialog.querySelector('[data-note-delete]').hidden = !note;
    dialog.showModal();
    form.title.focus();
  }

  function removeNote(id) {
    if (!id) return;
    state.notes = core.deleteNote(state.notes, id);
    save();
    render();
    $('#noteEditor')?.close();
  }

  function bind() {
    $('[data-note-add]')?.addEventListener('click', () => openEditor());
    $('[data-note-search]')?.addEventListener('input', renderList);
    $('[data-note-date]')?.addEventListener('change', renderList);
    document.querySelectorAll('[data-note-cancel]').forEach(button => button.addEventListener('click', () => $('#noteEditor')?.close()));
    $('[data-note-delete]')?.addEventListener('click', () => removeNote(editing));
    $('[data-note-attachments]')?.addEventListener('change', async event => {
      const files = [...(event.target.files || [])];
      const next = await Promise.all(files.map(readAttachment));
      selectedAttachments = [...selectedAttachments, ...next].slice(0, 12);
      event.target.value = '';
      renderAttachmentList();
    });
    $('#noteEditor form')?.addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      state.notes = core.upsertNote(state.notes, {
        id: editing || uid(),
        title: form.title.value,
        date: form.date.value,
        mood: form.mood.value,
        tags: form.tags.value,
        linkedScheduleIds: form.linkedScheduleIds.value.split(',').map(item => item.trim()).filter(Boolean),
        attachments: selectedAttachments,
        text: form.text.value
      });
      save();
      $('#noteEditor')?.close();
      render();
    });
    window.addEventListener('storage', event => { if (event.key === KEY) { state = readLocal(); render(); } });
    window.addEventListener('message', event => { if (event.data?.type === 'kairos:state-sync') { state = normalizeState(event.data.state); render(); } });
    window.addEventListener('kairos:state-changed', event => { if (event.detail) { state = normalizeState(event.detail); render(); } });
  }

  if (!core) return;
  load();
  bind();
  render();
})();
