import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const notes = require("../../../app/features/notes/note-core.cjs");

test("note core normalizes dated notes with mood tags attachments and links", () => {
  const note = notes.normalizeNote({
    id: "n1",
    date: "2026-07-15",
    title: "  Study Reflection  ",
    text: "Reviewed calculus",
    mood: "Focused",
    tags: ["Math", "math", " exam "],
    attachments: [{ name: "whiteboard.png", filePath: "C:/tmp/whiteboard.png" }],
    linkedScheduleIds: ["s1", "s1", ""]
  });

  assert.equal(note.date, "2026-07-15");
  assert.equal(note.title, "Study Reflection");
  assert.equal(note.mood, "focused");
  assert.deepEqual(note.tags, ["math", "exam"]);
  assert.deepEqual(note.linkedScheduleIds, ["s1"]);
  assert.equal(note.attachments[0].path, "C:/tmp/whiteboard.png");
});

test("note core supports upsert delete date lookup and keyword search", () => {
  const first = notes.upsertNote([], { id: "a", date: "2026-07-15", title: "Reading", text: "Finished chapter 1", tags: ["book"] });
  const updated = notes.upsertNote(first, { id: "a", date: "2026-07-15", title: "Reading notes", text: "Finished chapter 2", mood: "happy" });
  const withSecond = notes.upsertNote(updated, { id: "b", date: "2026-07-16", title: "Workout", text: "Leg day" });

  assert.equal(withSecond.length, 2);
  assert.equal(notes.notesForDate(withSecond, "2026-07-15")[0].title, "Reading notes");
  assert.equal(notes.searchNotes(withSecond, "chapter")[0].id, "a");
  assert.equal(notes.searchNotes(withSecond, "", { mood: "happy" })[0].id, "a");
  assert.deepEqual(notes.deleteNote(withSecond, "a").map(note => note.id), ["b"]);
});

test("note core stores one mood label per date and clears invalid moods", () => {
  assert.deepEqual(notes.setMood({}, "2026-07-15", "calm"), { "2026-07-15": "calm" });
  assert.deepEqual(notes.setMood({ "2026-07-15": "calm" }, "2026-07-15", "unknown"), {});
});
