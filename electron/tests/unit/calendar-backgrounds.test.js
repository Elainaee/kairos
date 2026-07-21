import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CalendarBackgroundService, MAX_CALENDAR_BACKGROUND_BYTES } from "../../services/calendar/calendar-backgrounds.js";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-calendar-backgrounds-"));
  const builtinDir = path.join(root, "builtin");
  const userDir = path.join(root, "user");
  await fs.mkdir(builtinDir);
  await fs.writeFile(path.join(builtinDir, "default.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xdb]));
  return { root, builtinDir, userDir, service: new CalendarBackgroundService({ builtinDir, userDir }) };
}

test("calendar backgrounds seed the user library from packaged defaults", async () => {
  const setup = await fixture();
  try {
    await fs.writeFile(path.join(setup.builtinDir, "aurora.webp"), Buffer.from("RIFF0000WEBP"));
    const backgrounds = await setup.service.listBuiltins();
    assert.deepEqual(backgrounds.map(item => item.id), ["default.jpg", "aurora.webp"]);
    assert.equal(backgrounds[0].url, "kairos-background://custom/default.jpg");
    assert.equal(await fs.stat(path.join(setup.userDir, "default.jpg")).then(() => true), true);
  } finally { await fs.rm(setup.root, { recursive: true, force: true }); }
});

test("calendar background imports a validated copy into the user library", async () => {
  const setup = await fixture();
  try {
    const source = path.join(setup.root, "source.png");
    await fs.writeFile(source, png);
    const imported = await setup.service.importFromPath(source, "Evening focus");
    assert.equal(imported.source, "custom");
    assert.equal(imported.label, "Evening focus");
    assert.equal(imported.id, "Evening focus.png");
    await fs.rm(source);
    const resolved = await setup.service.resolve("custom", imported.id);
    assert.equal(Boolean(resolved), true);
    assert.deepEqual(await fs.readFile(resolved.filePath), png);
  } finally { await fs.rm(setup.root, { recursive: true, force: true }); }
});

test("calendar background rename keeps filenames in the user library", async () => {
  const setup = await fixture();
  try {
    const copied = await setup.service.rename("builtin", "default.jpg", "Aurora sky");
    assert.deepEqual({ source: copied.source, id: copied.id, label: copied.label }, { source: "custom", id: "Aurora sky.jpg", label: "Aurora sky" });
    assert.deepEqual(await fs.readFile(path.join(setup.userDir, copied.id)), Buffer.from([0xff, 0xd8, 0xff, 0xdb]));
    const renamed = await setup.service.rename("custom", copied.id, "夜空");
    assert.deepEqual({ id: renamed.id, label: renamed.label }, { id: "夜空.jpg", label: "夜空" });
    assert.equal(await fs.stat(path.join(setup.userDir, copied.id)).then(() => true).catch(() => false), false);
    assert.deepEqual((await setup.service.listBuiltins()).map(item => item.id), ["default.jpg", "夜空.jpg"]);
  } finally { await fs.rm(setup.root, { recursive: true, force: true }); }
});

test("calendar background deletion protects the default and removes only validated user images", async () => {
  const setup = await fixture();
  try {
    await setup.service.listBuiltins();
    const source = path.join(setup.root, "source.png");
    await fs.writeFile(source, png);
    const imported = await setup.service.importFromPath(source, "Disposable");
    await assert.rejects(() => setup.service.remove("default.jpg"), /calendar_background_default_protected/);
    await setup.service.remove(imported.id);
    assert.equal(await fs.stat(path.join(setup.userDir, imported.id)).then(() => true).catch(() => false), false);
    assert.equal(await setup.service.resolve("custom", "../default.jpg"), null);
  } finally { await fs.rm(setup.root, { recursive: true, force: true }); }
});

test("calendar background deletion keeps the final remaining image", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-calendar-background-last-"));
  const builtinDir = path.join(root, "builtin");
  const userDir = path.join(root, "user");
  try {
    await fs.mkdir(builtinDir);
    await fs.mkdir(userDir);
    await fs.writeFile(path.join(userDir, "only.png"), png);
    const service = new CalendarBackgroundService({ builtinDir, userDir });
    await assert.rejects(() => service.remove("only.png"), /calendar_background_last_protected/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test("calendar background imports reject invalid, oversized, and traversing paths", async () => {
  const setup = await fixture();
  try {
    const invalid = path.join(setup.root, "not-an-image.jpg");
    const oversized = path.join(setup.root, "oversized.png");
    await fs.writeFile(invalid, "not an image");
    await fs.writeFile(oversized, Buffer.alloc(MAX_CALENDAR_BACKGROUND_BYTES + 1));
    await assert.rejects(() => setup.service.importFromPath(invalid), /calendar_background_file_type_invalid/);
    await assert.rejects(() => setup.service.importFromPath(oversized), /calendar_background_file_too_large/);
    assert.equal(await setup.service.resolve("custom", "../source.png"), null);
  } finally { await fs.rm(setup.root, { recursive: true, force: true }); }
});
