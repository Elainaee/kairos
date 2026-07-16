(function (root, factory) {
  const core = factory();
  if (typeof module === "object" && module.exports) module.exports = core;
  if (root) root.KairosNoteCore = core;
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : null, function () {
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const MOODS = new Set(["calm", "happy", "focused", "tired", "stressed", "sad", "excited", "neutral"]);

  function dateKey(date = new Date()) {
    const pad = value => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function validDate(value) {
    return DATE.test(String(value || ""));
  }

  function cleanText(value, max = 5000) {
    return String(value || "").replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").trim().slice(0, max);
  }

  function normalizeMood(value) {
    const mood = String(value || "").trim().toLowerCase();
    return MOODS.has(mood) ? mood : "";
  }

  function normalizeNote(input = {}, fallbackDate = dateKey()) {
    const date = validDate(input.date) ? input.date : fallbackDate;
    const title = cleanText(input.title || input.text || "Untitled note", 80) || "Untitled note";
    const text = cleanText(input.text || input.body || input.notes || "");
    const tags = [...new Set((Array.isArray(input.tags) ? input.tags : String(input.tags || "").split(","))
      .map(tag => cleanText(tag, 24).toLowerCase())
      .filter(Boolean))].slice(0, 12);
    const attachments = (Array.isArray(input.attachments) ? input.attachments : [])
      .filter(item => item && typeof item === "object")
      .map(item => ({ ...item, name: cleanText(item.name, 120), path: cleanText(item.path || item.filePath || "", 1000) }))
      .filter(item => item.name || item.path);
    const now = new Date().toISOString();
    return {
      ...input,
      id: cleanText(input.id, 120) || `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      date,
      title,
      text,
      mood: normalizeMood(input.mood),
      tags,
      attachments,
      linkedScheduleIds: [...new Set((Array.isArray(input.linkedScheduleIds) ? input.linkedScheduleIds : []).map(id => cleanText(id, 120)).filter(Boolean))],
      created_at: input.created_at || now,
      updated_at: now
    };
  }

  function normalizeNotes(notes = []) {
    return (Array.isArray(notes) ? notes : []).map(note => normalizeNote(note)).sort((a, b) => b.date.localeCompare(a.date) || b.updated_at.localeCompare(a.updated_at));
  }

  function upsertNote(notes = [], input = {}) {
    const current = normalizeNotes(notes);
    const existing = current.find(note => note.id === input.id);
    const next = normalizeNote({ ...existing, ...input, created_at: existing?.created_at || input.created_at });
    return [next, ...current.filter(note => note.id !== next.id)].sort((a, b) => b.date.localeCompare(a.date) || b.updated_at.localeCompare(a.updated_at));
  }

  function deleteNote(notes = [], id) {
    return normalizeNotes(notes).filter(note => note.id !== id);
  }

  function notesForDate(notes = [], date = dateKey()) {
    return normalizeNotes(notes).filter(note => note.date === date);
  }

  function searchNotes(notes = [], query = "", options = {}) {
    const q = cleanText(query, 200).toLowerCase();
    return normalizeNotes(notes).filter(note => {
      if (options.date && note.date !== options.date) return false;
      if (options.mood && note.mood !== normalizeMood(options.mood)) return false;
      if (!q) return true;
      return `${note.title} ${note.text} ${note.tags.join(" ")}`.toLowerCase().includes(q);
    });
  }

  function setMood(moods = {}, date = dateKey(), mood = "") {
    const next = { ...(moods && typeof moods === "object" && !Array.isArray(moods) ? moods : {}) };
    const key = validDate(date) ? date : dateKey();
    const clean = normalizeMood(mood);
    if (clean) next[key] = clean;
    else delete next[key];
    return next;
  }

  return { MOODS: [...MOODS], dateKey, validDate, normalizeMood, normalizeNote, normalizeNotes, upsertNote, deleteNote, notesForDate, searchNotes, setMood };
});
