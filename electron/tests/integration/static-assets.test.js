import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(".");

async function inlineScripts(file) {
  const html = await fs.readFile(path.join(root, file), "utf8");
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attrs]) => !/\bsrc\s*=/.test(attrs))
    .map(([, , source]) => source.trim())
    .filter(Boolean);
}

test("html inline scripts stay syntactically valid", async () => {
  for (const file of ["app/pages/calendar/index.html", "app/pages/music/index.html"]) {
    const scripts = await inlineScripts(file);
    assert.ok(scripts.length > 0, `${file} should contain inline scripts to check`);
    scripts.forEach((source, index) => {
      assert.doesNotThrow(
        () => new vm.Script(source, { filename: `${file}#script-${index + 1}` }),
        `${file} inline script ${index + 1} should parse`
      );
    });
  }
});

test("embedded music pages rely on the shell player instance", async () => {
  const playerScript = await fs.readFile(path.join(root, "app/shell/player/music-player.js"), "utf8");
  const musicHtml = await fs.readFile(path.join(root, "app/pages/music/index.html"), "utf8");

  assert.match(
    playerScript,
    /new URLSearchParams\(location\.search\)\.get\('embed'\)\s*===\s*'1'\s*&&\s*window\.parent\s*!==\s*window\)\s*return window\.KairosMusicPlayer/,
    "music-player.js should not mount a second player inside the embedded Music iframe"
  );
  assert.match(
    musicHtml,
    /<script src="\.\.\/\.\.\/shell\/player\/music-player\.js\?v=\d+"><\/script>/,
    "music.html may load the player script, relying on the embed guard for single-instance behavior"
  );
  assert.match(
    musicHtml,
    /document\.body\.dataset\.embedded = 'true';/,
    "embedded music pages should mark themselves for iframe-specific layout"
  );
  assert.match(
    musicHtml,
    /body\[data-embedded="true"\] \{ padding-bottom: 0; \}/,
    "embedded music pages should remove inner player padding after the shell already reserved it"
  );
  assert.match(
    musicHtml,
    /body\[data-embedded="true"\] \.music-root \{ height: 100vh; \}/,
    "embedded music pages should let the sidebar fill the iframe height"
  );
  assert.doesNotMatch(
    musicHtml,
    /\.music-sidebar-footer \{[\s\S]*?position:\s*absolute[\s\S]*?bottom:\s*80px/,
    "sidebar footer should use flex layout instead of a second hard-coded player offset"
  );
});

test("habit dashboard uses shared date and streak core", async () => {
  const habitsHtml = await fs.readFile(path.join(root, "app/pages/habits/index.html"), "latin1");
  const habitsScript = await fs.readFile(path.join(root, "app/features/habits/habits-feature.js"), "utf8");
  const habitCore = await fs.readFile(path.join(root, "app/features/habits/habit-core.cjs"), "utf8");

  assert.match(
    habitsHtml,
    /<script src="[^\"]*habit-core\.cjs\?v=1"><\/script><script src="[^\"]*habits-feature\.js\?v=14"><\/script>/,
    "habit dashboard should load the shared habit core before the UI feature"
  );
  assert.match(
    habitsScript,
    /const core=window\.KairosHabitCore;/,
    "habit UI should use the shared testable habit core when it is loaded"
  );
  assert.match(habitsScript, /appState\.initialize\(state\);[\s\S]*?state\.habits=\(Array\.isArray\(state\.habits\)\?state\.habits:\[\]\)\.map\(clean\);\s*window\.kairosDesktop\.appState\.onChanged/, "habit initialization should bind state updates without immediately writing a stale full-state snapshot");
  assert.match(
    habitsScript,
    /core\?\.currentStreak\?core\.currentStreak\(habit,today\(\)\)/,
    "habit cards should render current streaks from the shared core"
  );
  assert.match(
    habitsScript,
    /core\?\.toggleDate\?core\.toggleDate\(habit,date,today\(\)\)/,
    "habit toggles should apply shared backfill rules"
  );
  assert.match(
    habitsScript,
    /const backfillDefault=\(\)=>!!readSettings\(\)\?\.habits\?\.allowBackfillDefault/,
    "new habit editor should read the saved default backfill rule"
  );
  assert.match(
    habitsScript,
    /const allowBackfill=habit\?!!habit\.allowBackfill:backfillDefault\(\);[\s\S]*?<input name="backfill" type="checkbox" \$\{allowBackfill\?'checked':''\}>/,
    "new habits should use the global backfill default while existing habits keep their own setting"
  );
  assert.match(habitsScript, /const reactPet=\(action,payload=\{\}\)=>\{[\s\S]*?window\.top\.postMessage\(\{type:'kairos:pet-react',action,payload\}/, "embedded habit pages should route companion reactions through the desktop shell when preload is unavailable");
  assert.match(habitsScript, /habit-check-button\[data-toggle\][\s\S]*?reactPet\('happy',\{title\}\)/, "new habit completions should give the desktop companion a single happy response");
  assert.match(
    habitCore,
    /function currentStreak\(habit = \{\}, todayKey = dateKey\(\)\)[\s\S]*?function bestStreak\(habit = \{\}\)[\s\S]*?function heatmapWindow/,
    "habit core should keep streak and heatmap logic in one reusable module"
  );
});

test("note and mood core defines local dated journal behavior", async () => {
  const noteCore = await fs.readFile(path.join(root, "app/features/notes/note-core.cjs"), "utf8");
  const packageJson = await fs.readFile(path.join(root, "package.json"), "utf8");
  const appState = await fs.readFile(path.join(root, "electron/data/app-state/index.js"), "utf8");

  assert.match(
    appState,
    /const EMPTY = \{[\s\S]*?moods: \{\}, notes: \[\][\s\S]*?\};/,
    "app-state should reserve durable notes and dated mood storage"
  );
  assert.match(
    noteCore,
    /if \(root\) root\.KairosNoteCore = core;[\s\S]*?function normalizeNote\(input = \{\}, fallbackDate = dateKey\(\)\)/,
    "note core should be reusable from browser UI and Node tests"
  );
  assert.match(
    noteCore,
    /function searchNotes\(notes = \[\], query = "", options = \{\}\)[\s\S]*?options\.date[\s\S]*?options\.mood[\s\S]*?note\.tags\.join\(" "\)/,
    "note core should support date mood and keyword search"
  );
  assert.match(
    noteCore,
    /function setMood\(moods = \{\}, date = dateKey\(\), mood = ""\)[\s\S]*?if \(clean\) next\[key\] = clean;[\s\S]*?else delete next\[key\]/,
    "note core should manage one mood label per date"
  );
  assert.match(
    packageJson,
    /node --check app\/features\/notes\/note-core\.cjs/,
    "check script should syntax-check the note core"
  );
});

test("notes page is wired into the desktop shell and app-state", async () => {
  const notesHtml = await fs.readFile(path.join(root, "app/pages/notes/index.html"), "utf8");
  const notesFeature = await fs.readFile(path.join(root, "app/features/notes/notes-feature.js"), "utf8");
  const shell = await fs.readFile(path.join(root, "app/shell/navigation/stitch-shell.js"), "utf8");
  const packageJson = await fs.readFile(path.join(root, "package.json"), "utf8");

  assert.match(
    notesHtml,
    /<body data-page="notes">[\s\S]*data-note-search[\s\S]*data-note-date[\s\S]*data-mood-grid[\s\S]*<script src="[^\"]*note-core\.cjs\?v=1"><\/script>[\s\S]*<script src="[^\"]*notes-feature\.js\?v=1"><\/script>/,
    "notes page should render search date filters mood picker and load the note core before the feature"
  );
  assert.match(
    shell,
    /\['notes','#notes','edit_note','Notes'\][\s\S]*notes: \['\.\.\/notes\/index\.html\?embed=1&v=1', 'Notes'\]/,
    "desktop shell should expose Notes in the SPA navigation"
  );
  assert.match(
    notesFeature,
    /const KEY = 'kairos-mvp-state';[\s\S]*?window\.kairosDesktop\?\.appState\?\.save\?\.\(state\)[\s\S]*?window\.kairosDesktop\.appState\.initialize\(state\)/,
    "notes feature should persist through shared local state and the desktop app-state bridge"
  );
  assert.match(
    notesFeature,
    /core\.searchNotes\(state\.notes, query, date \? \{ date \} : \{\}\)/,
    "notes feature should use the shared core for search"
  );
  assert.match(
    notesFeature,
    /core\.upsertNote\(state\.notes,/,
    "notes feature should use the shared core for save"
  );
  assert.match(
    notesFeature,
    /core\.deleteNote\(state\.notes, id\)/,
    "notes feature should use the shared core for delete"
  );
  assert.match(
    notesFeature,
    /core\.setMood\(state\.moods, today\(\)/,
    "notes feature should use the shared core for mood updates"
  );
  assert.match(
    notesHtml,
    /data-note-attachments[\s\S]*data-note-attachment-list/,
    "notes page should expose an attachment file picker and attachment list"
  );
  assert.match(
    notesFeature,
    /function readAttachment\(file\)[\s\S]*?FileReader[\s\S]*?readAsDataURL\(file\)/,
    "notes feature should preserve local image previews for attachments"
  );
  assert.match(
    notesFeature,
    /renderAttachmentList\(\)[\s\S]*?data-remove-attachment[\s\S]*?selectedAttachments\.splice/,
    "notes feature should render and remove selected attachments"
  );
  assert.match(
    notesFeature,
    /attachments: selectedAttachments,/,
    "notes feature should save selected attachments with the note"
  );
  assert.match(
    packageJson,
    /node --check app\/features\/notes\/notes-feature\.js/,
    "check script should syntax-check the notes feature"
  );
});

test("schedule calendar uses shared date and schedule core", async () => {
  const shell = await fs.readFile(path.join(root, "app/shell/navigation/stitch-shell.js"), "utf8");
  const scheduleScript = await fs.readFile(path.join(root, "app/features/calendar/schedule-feature.js"), "utf8");
  const calendarCore = await fs.readFile(path.join(root, "app/features/calendar/calendar-core.cjs"), "utf8");

  assert.match(
    shell,
    /const loadScheduleFeature=\(\)=>\{[\s\S]*?scheduleFeatureScript\.src='[^']*schedule-feature\.js\?v=42';[\s\S]*?\};/,
    "shell should keep schedule feature loading behind a helper"
  );
  assert.match(
    shell,
    /calendarCoreScript\.src='[^']*calendar-core\.cjs\?v=1';[\s\S]*?calendarCoreScript\.onload=loadScheduleFeature;[\s\S]*?calendarCoreScript\.onerror=loadScheduleFeature;[\s\S]*?document\.body\.appendChild\(calendarCoreScript\);/,
    "shell should load the shared calendar core before invoking schedule-feature.js"
  );
  assert.match(
    scheduleScript,
    /const calendarCore=window\.KairosCalendarCore;/,
    "schedule UI should use the shared calendar core when it is loaded"
  );
  assert.match(
    scheduleScript,
    /const monthGrid=\(year,monthIndex\)=>calendarCore\?\.monthGrid\?\.\(year,monthIndex\)/,
    "schedule UI should delegate month grid generation to calendar core"
  );
  assert.match(
    scheduleScript,
    /const covers=\(x,date\)=>calendarCore\?\.coversDate\?\.\(x,date\)/,
    "schedule UI should delegate date coverage rules to calendar core"
  );
  assert.match(
    calendarCore,
    /function monthGrid\(year, monthIndex, options = \{\}\)[\s\S]*?function coversDate\(item = \{\}, key\)[\s\S]*?function schedulesForDate/,
    "calendar core should keep month grid and schedule coverage logic in one reusable module"
  );
});

test("schedule calendar shows lightweight note and mood markers", async () => {
  const scheduleScript = await fs.readFile(path.join(root, "app/features/calendar/schedule-feature.js"), "utf8");
  const scheduleCss = await fs.readFile(path.join(root, "app/features/calendar/schedule-feature.css"), "utf8");

  assert.match(
    scheduleScript,
    /function noteMarkerForDate\(key\)[\s\S]*?state\.notes[\s\S]*?state\.moods[\s\S]*?calendar-note-marker/,
    "schedule calendar should derive date markers from notes and moods"
  );
  assert.match(
    scheduleScript,
    /cell\.innerHTML=`<span class="font-label-sm">[\s\S]*?\$\{noteMarkerForDate\(key\)\}`/,
    "day cells should render the note and mood marker"
  );
  assert.match(
    scheduleCss,
    /\.calendar-note-marker[\s\S]*?\.calendar-grid \.day-cell\.calendar-day-selected \.calendar-note-marker/,
    "note and mood markers should be styled for normal and selected calendar days"
  );
});

test("schedule calendar supports drag-to-reschedule", async () => {
  const scheduleScript = await fs.readFile(path.join(root, "app/features/calendar/schedule-feature.js"), "utf8");
  const scheduleCss = await fs.readFile(path.join(root, "app/features/calendar/schedule-feature.css"), "utf8");

  assert.match(
    scheduleScript,
    /const moveScheduleToDate=\(id,targetDate\)=>\{[\s\S]*?span=Math\.max\(0,dayDelta\(item\.date,item\.end_date\|\|item\.date\)\)[\s\S]*?item\.date=targetDate[\s\S]*?item\.end_date=shiftDate\(targetDate,span\)[\s\S]*?Undo/,
    "drag rescheduling should preserve date span and offer undo"
  );
  assert.match(
    scheduleScript,
    /function bindCalendarDragDrop\(grid\)\{[\s\S]*?chip\.draggable=true[\s\S]*?dragstart[\s\S]*?drop[\s\S]*?moveScheduleToDate\(id,cell\.dataset\.date\)/,
    "calendar chips should be draggable onto day cells"
  );
  assert.match(
    scheduleScript,
    /bindCalendarDragDrop\(grid\);[\s\S]*?revealCalendarMonth/,
    "calendar should bind drag and drop after rendering day cells"
  );
  assert.match(
    scheduleCss,
    /\.calendar-schedule-chip\[draggable="true"\][\s\S]*?\.calendar-grid \.day-cell\.calendar-drop-target/,
    "calendar drag and drop states should be visually styled"
  );
});

test("today timeline supports quick time nudges", async () => {
  const scheduleScript = await fs.readFile(path.join(root, "app/features/calendar/schedule-feature.js"), "utf8");
  const scheduleCss = await fs.readFile(path.join(root, "app/features/calendar/schedule-feature.css"), "utf8");

  assert.match(
    scheduleScript,
    /const shiftedTimeRange=\(item,delta\)=>calendarCore\?\.shiftTimeRange\?\.\(item\.start_time,item\.end_time\|\|item\.start_time,delta\)[\s\S]*?const shiftScheduleTime=\(id,delta=15\)=>\{[\s\S]*?Object\.assign\(item,next,[\s\S]*?Undo/,
    "timeline time nudges should use the shared bounded time-range logic and offer undo"
  );
  assert.match(
    scheduleScript,
    /\$\{!x\.all_day&&x\.start_time\?`<span class="schedule-time-nudge"[\s\S]*?data-time-shift="\$\{x\.id\}" data-delta="-15"[\s\S]*?data-delta="15"/,
    "timeline should show quick nudge controls only for timed schedules"
  );
  assert.match(
    scheduleScript,
    /querySelectorAll\('\[data-time-shift\]'\)[\s\S]*?shiftScheduleTime\(b\.dataset\.timeShift,Number\(b\.dataset\.delta\|\|15\)\)/,
    "timeline nudge buttons should call the time shift helper"
  );
  assert.match(
    scheduleCss,
    /#scheduleTodayList \.schedule-time-nudge[\s\S]*?#scheduleTodayList \.schedule-time-nudge button:hover/,
    "timeline nudge controls should have hover and focus styling"
  );
  assert.match(
    scheduleScript,
    /function bindTimelineTimeDrag\(box\)\{[\s\S]*?\[data-time-drag\][\s\S]*?const \{id,delta,row,label,originalTime\}=drag;[\s\S]*?if\(delta\)shiftScheduleTime\(id,delta\)[\s\S]*?Math\.round\(\(event\.clientY-drag\.startY\)\/10\)\*15/,
    "timeline should support direct vertical drag time adjustment in 15-minute increments"
  );
  assert.match(scheduleScript, /data-time-drag="\$\{x\.id\}"[\s\S]*?aria-label="Drag to change schedule time"/, "timed schedule rows should expose an accessible drag handle");
  assert.match(scheduleCss, /\[data-time-drag\]\{cursor:ns-resize;touch-action:none\}/, "timeline drag handle should advertise vertical dragging and prevent touch scrolling");
  assert.match(scheduleScript, /const reactPet=\(action,payload=\{\}\)=>\{[\s\S]*?window\.top\.postMessage\(\{type:'kairos:pet-react',action,payload\}/, "embedded schedule pages should route companion reactions through the desktop shell when preload is unavailable");
  assert.match(scheduleScript, /task-complete-check\[data-check\][\s\S]*?check\?\.checked[\s\S]*?reactPet\('happy',\{title\}\)/, "completed schedule rows should notify the desktop companion without reacting to reopen actions");
  const shellScript = await fs.readFile(path.join(root, "app/shell/navigation/stitch-shell.js"), "utf8");
  assert.match(shellScript, /message\.type !== 'kairos:pet-react'[\s\S]*?spaFrames\.values\(\)[\s\S]*?kairosDesktop\?\.pet\?\.react\(message\.action/, "desktop shell should relay companion reactions only from its embedded application frames");
});

test("schedule form warns before saving overlapping timed schedules", async () => {
  const scheduleScript = await fs.readFile(path.join(root, "app/features/calendar/schedule-feature.js"), "utf8");

  assert.match(
    scheduleScript,
    /const scheduleRange=item=>\{if\(!item\|\|item\.all_day\|\|!item\.date\|\|!item\.start_time\|\|!item\.end_time\)return null;[\s\S]*?return start==null\|\|end==null\|\|end<=start\?null:\{date:item\.date,start,end\}\}/,
    "schedule conflicts should only evaluate valid timed non-all-day schedules"
  );
  assert.match(
    scheduleScript,
    /const conflictingSchedules=item=>\{const range=scheduleRange\(item\);if\(!range\)return\[\];return state\.schedules\.filter\(current=>current\.id!==item\.id&&status\(current\)!=='done'\)[\s\S]*?other\.date===range\.date&&other\.start<range\.end&&range\.start<other\.end/,
    "schedule conflict detection should ignore the current row and completed schedules"
  );
  assert.match(
    scheduleScript,
    /const conflicts=conflictingSchedules\(data\);if\(conflicts\.length\)\{const ok=await kairosConfirmAlert\(\{title:'Schedule time conflict\?'[\s\S]*?action:'Save Anyway'[\s\S]*?cancel:'Review'[\s\S]*?if\(!ok\)return\}state\.schedules=editing\?state\.schedules\.map/,
    "saving an overlapping schedule should require explicit confirmation before mutating state"
  );
  assert.match(
    scheduleScript,
    /const renderConflictPreview=\(\)=>\{const draft=Object\.fromEntries\(new FormData\(f\)\);draft\.id=editing\|\|'';draft\.all_day=f\.all_day\.checked;const conflicts=conflictingSchedules\(draft\);[\s\S]*?Overlaps with/,
    "schedule editor should preview overlapping schedules before submit"
  );
  assert.match(scheduleScript, /f\.addEventListener\('input',renderConflictPreview\);f\.addEventListener\('change',renderConflictPreview\)/, "conflict preview should refresh while editing schedule fields");
});

test("main window restores and persists desktop bounds", async () => {
  const main = await fs.readFile(path.join(root, "electron/main/index.js"), "utf8");

  assert.match(
    main,
    /const windowStatePath = \(\) => path\.join\(app\.getPath\("userData"\), "window-state\.json"\);/,
    "main window bounds should be persisted in app userData"
  );
  assert.match(
    main,
    /function restoreWindowBounds\(saved\) \{[\s\S]*?screen\.getAllDisplays\(\)[\s\S]*?screen\.getPrimaryDisplay\(\)[\s\S]*?workArea[\s\S]*?finalWidth[\s\S]*?finalHeight[\s\S]*?\}/,
    "saved window bounds should be clamped to an available display work area"
  );
  assert.match(
    main,
    /function attachWindowStatePersistence\(win\) \{[\s\S]*?win\.on\("resize", scheduleSave\);[\s\S]*?win\.on\("move", scheduleSave\);[\s\S]*?win\.on\("close", \(\) => \{/,
    "window resize, move, and close should save the latest usable bounds"
  );
  assert.match(
    main,
    /const savedBounds = restoreWindowBounds\(await readWindowState\(\)\);[\s\S]*?new BrowserWindow\(\{ \.\.\.savedBounds, minWidth: 900, minHeight: 650/,
    "main BrowserWindow should start from restored bounds instead of fixed dimensions"
  );
  assert.match(
    main,
    /if \(process\.env\.KAIROS_USER_DATA_DIR\) app\.setPath\("userData", process\.env\.KAIROS_USER_DATA_DIR\);/,
    "packaged smoke tests should be able to verify startup with an isolated userData directory"
  );
  assert.match(
    main,
    /async function verifySmokeRenderer\(win\) \{[\s\S]*?calendarHeading: '#scheduleCalendarHeading'[\s\S]*?habitList: '#habitAnimatedList'[\s\S]*?musicPlayer: '#musicPlayer'[\s\S]*?reminderButton: '\.kairos-reminder-button'[\s\S]*?aiPanel: '#aiPanel'/,
    "packaged smoke tests should verify that the main renderer mounted core UI surfaces"
  );
  assert.match(
    main,
    /const smokeStateMarker = process\.env\.KAIROS_SMOKE_STATE_MARKER \|\| "";[\s\S]*?const smokeExpectStateMarker = process\.env\.KAIROS_SMOKE_EXPECT_STATE_MARKER === "1";/,
    "smoke mode should support persisted app-state marker checks across launches"
  );
  assert.match(
    main,
    /const api = window\.kairosDesktop\?\.appState;[\s\S]*?await api\.save\(withMarker\(before\)\);[\s\S]*?await delay\(500\);[\s\S]*?await api\.save\(withMarker\(await api\.get\(\)\)\);[\s\S]*?const after = await api\.get\(\);/,
    "renderer smoke should exercise the desktop appState save/get bridge with a settled persistence check"
  );
  assert.match(
    main,
    /const smokeMusicFile = process\.env\.KAIROS_SMOKE_MUSIC_FILE \|\| "";[\s\S]*?const api = window\.kairosDesktop\?\.music;[\s\S]*?await api\.addFiles\(\[musicFile\]\);[\s\S]*?await api\.updatePlayback/,
    "renderer smoke should exercise local music import and playback persistence"
  );
  assert.match(
    main,
    /const result = await verifySmokeRenderer\(mainWindow\);[\s\S]*?Kairos smoke test loaded main window\.[\s\S]*?JSON\.stringify\(result\.checks\)/,
    "smoke mode should fail if core renderer selectors are missing"
  );
  assert.match(
    main,
    /await createWindow\(\);if\(!smokeTest\)await createPetWindow\(\);/,
    "app startup should await both restored main window creation and companion renderer loading in normal desktop mode"
  );
});

test("desktop shell enforces single instance and external link safety", async () => {
  const main = await fs.readFile(path.join(root, "electron/main/index.js"), "utf8");

  assert.match(
    main,
    /if \(process\.env\.KAIROS_USER_DATA_DIR\) app\.setPath\("userData", process\.env\.KAIROS_USER_DATA_DIR\);[\s\S]*?function acquireUserDataProcessLock\(\) \{[\s\S]*?kairos-instance\.lock[\s\S]*?isPidRunning\(existingPid\)[\s\S]*?const hasUserDataProcessLock = acquireUserDataProcessLock\(\);[\s\S]*?const hasSingleInstanceLock = hasUserDataProcessLock && app\.requestSingleInstanceLock\(\{ userDataDir: app\.getPath\("userData"\) \}\);[\s\S]*?if \(!hasUserDataProcessLock \|\| !hasSingleInstanceLock\) \{[\s\S]*?app\.quit\(\);[\s\S]*?app\.exit\(0\);[\s\S]*?\}/,
    "desktop app should set the final userData path before requesting single-instance locks and quit duplicate processes"
  );
  assert.match(
    main,
    /function focusMainWindow\(\) \{[\s\S]*?mainWindow\.restore\(\);[\s\S]*?mainWindow\.show\(\);[\s\S]*?mainWindow\.focus\(\);[\s\S]*?\}/,
    "second launches should restore and focus the existing main window"
  );
  assert.match(
    main,
    /app\.on\("second-instance", \(\) => \{ focusMainWindow\(\); \}\);/,
    "single-instance second launch should be handled explicitly"
  );
  assert.match(
    main,
    /function protectAppNavigation\(win\) \{[\s\S]*?setWindowOpenHandler\(\(\{ url \}\) => \{[\s\S]*?shell\.openExternal\(url\)[\s\S]*?return \{ action: "deny" \};[\s\S]*?will-navigate", \(event, url\) => \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?shell\.openExternal\(target\)/,
    "external links should open in the system browser instead of navigating the app shell"
  );
  assert.match(main, /protectAppNavigation\(mainWindow\);/, "main window should receive external navigation protection");
  assert.match(main, /protectAppNavigation\(aiChatWindow\);/, "AI chat window should receive external navigation protection");
  assert.match(main, /protectAppNavigation\(petWindow\);/, "pet window should receive external navigation protection");
  assert.match(
    main,
    /app\.on\("activate", \(\) => \{ if \(!focusMainWindow\(\)\) createWindow\(\)\.catch/,
    "macOS activate should refocus or recreate the main window"
  );
});

test("reminders remain local and do not require AI availability", async () => {
  const reminderScript = await fs.readFile(path.join(root, "app/features/reminders/reminder-feature.js"), "utf8");
  const reminderCore = await fs.readFile(path.join(root, "app/features/reminders/reminder-core.cjs"), "utf8");
  const scheduleScript = await fs.readFile(path.join(root, "app/features/calendar/schedule-feature.js"), "utf8");
  const shellScript = await fs.readFile(path.join(root, "app/shell/navigation/stitch-shell.js"), "utf8");
  const preload = await fs.readFile(path.join(root, "electron/preload/index.cjs"), "utf8");
  const main = await fs.readFile(path.join(root, "electron/main/index.js"), "utf8");

  assert.match(
    reminderScript,
    /const KEY='kairos-mvp-state'/,
    "reminders should keep using the shared local application state key"
  );
  assert.match(
    reminderScript,
    /const load=\(\)=>\{try\{return \{\.\.\.\{schedules:\[\],reminders:\{\}\},\.\.\.JSON\.parse\(localStorage\.getItem\(KEY\)\|\|'\{\}'\)\}\}catch\{return\{schedules:\[\],reminders:\{\}\}\}\}/,
    "reminders should load schedules and reminder metadata from localStorage without a provider dependency"
  );
  assert.match(
    reminderScript,
    /function save\(\)\{localStorage\.setItem\(KEY,JSON\.stringify\(state\)\);window\.kairosDesktop\?\.appState\.save\(state\)\.catch\(console\.error\)\}/,
    "reminder changes should persist locally and only optionally mirror to desktop app state"
  );
  assert.match(
    reminderScript,
    /const core=window\.KairosReminderCore\|\|/,
    "reminder UI should use the shared testable reminder core when it is loaded"
  );
  assert.match(
    reminderCore,
    /function classifyReminder\(item = \{\}, meta = \{\}, now = Date\.now\(\), graceMs = GRACE_MS, checkMs = CHECK_MS\) \{[\s\S]*?shouldFireReminder[\s\S]*?missed: isMissedReminder/,
    "due and missed reminder classification should live in a shared testable core"
  );
  assert.match(
    reminderCore,
    /function defaultReminderForType\(type, settings = \{\}\) \{[\s\S]*?settings\?\.defaultByType\?\.\[type\] \?\? settings\?\.\[type\][\s\S]*?DEFAULT_REMINDERS\[type\] \|\| "none"/,
    "default reminder rules should accept user settings while keeping built-in fallbacks"
  );
  assert.match(
    reminderScript,
    /function check\(\)\{state=load\(\);[\s\S]*?core\.classifyReminder\(item,m,now,GRACE,CHECK\)[\s\S]*?state\.reminders\[item\.id\]=\{\.\.\.m,firedAt:now,snoozedUntil:null\};notify\(item,result\.missed\)/,
    "due reminders should be triggered by local schedule data through the shared core"
  );
  assert.match(
    reminderScript,
    /const snoozeMinutes=\(\)=>\{const value=Number\(readSettings\(\)\?\.reminders\?\.snoozeMinutes\|\|10\);[\s\S]*?Date\.now\(\)\+snoozeMinutes\(\)\*60000/,
    "reminder snooze duration should be configurable from saved settings"
  );
  assert.match(
    shellScript,
    /const loadReminderFeature=\(\)=>\{[\s\S]*?reminderFeatureScript\.src='[^']*reminder-feature\.js\?v=7';[\s\S]*?\};[\s\S]*?reminderCoreScript\.src='[^']*reminder-core\.cjs\?v=1';[\s\S]*?reminderCoreScript\.onload=loadReminderFeature;/,
    "the shell should load reminder core before the UI reminder feature"
  );
  assert.match(
    reminderScript,
    /window\.dispatchEvent\(new CustomEvent\('kairos:reminder',\{detail:\{item,missed\}\}\)\)/,
    "reminders should emit a local browser event for UI integrations such as 桌宠"
  );
  assert.match(reminderScript, /kairosDesktop\?\.pet\?\.react\(detail\.missed\?'sleepy':'reminder'/, "reminders should drive the desktop companion state");
  assert.match(reminderScript, /kairosDesktop\.appState\.get\(\)\.then\(next=>\{state=next\|\|state;start\(\)\}\)/, "reminders should hydrate desktop state before their first persistence check");
  assert.match(reminderScript, /const desktopNotificationsEnabled=\(\)=>readSettings\(\)\?\.reminders\?\.desktopNotifications!==false/, "desktop notifications should default on unless explicitly disabled");
  assert.match(reminderScript, /if\(desktopNotificationsEnabled\(\)\)window\.kairosDesktop\?\.reminders\?\.notify\?\.\(\{scheduleId:item\.id,title:item\.title,note:item\.notes\|\|timeText\(item\),missed\}\)/, "reminders should request a native desktop notification only when the preference is enabled");
  assert.match(preload, /reminders: Object\.freeze\(\{[\s\S]*?notify: \(input = \{\}\) => ipcRenderer\.invoke\("reminder:notify", input\)/, "preload should expose a narrow native reminder notification API");
  assert.match(main, /Notification\.isSupported\(\)[\s\S]*?new Notification\([\s\S]*?notification\.on\("click", \(\) => sendShellCommand\("schedule", \{ scheduleId:/, "main process should use a supported native notification and route its click to the schedule view");
  assert.match(main, /ipcMain\.handle\("reminder:notify", \(event, input = \{\}\) => \{[\s\S]*?event\.sender !== mainWindow\?\.webContents/, "only the main workspace renderer should be allowed to show native reminders");
  assert.match(shellScript, /type === 'schedule' && typeof command\.scheduleId === 'string'[\s\S]*?type:'kairos:open-schedule'/, "notification schedule commands should forward the schedule id into the embedded schedule page");
  assert.match(scheduleScript, /message\.type==='kairos:open-schedule'[\s\S]*?event\.source===window\.top[\s\S]*?open\(state\.schedules\.find\(item=>item\.id===message\.id\)\)/, "embedded schedule page should accept schedule-open commands only from its shell");
  assert.doesNotMatch(
    reminderScript,
    /OPENAI_API_KEY|ARK_API_KEY|FIRECRAWL_API_KEY|providers?|langchain|aiData|ToolRuntime/i,
    "reminder basics should not depend on AI provider configuration or AI stores"
  );
});

test("desktop pet keeps the restored original illustration and menu copy", async () => {
  const petPage = await fs.readFile(path.join(root, "app/pages/pet/index.html"), "utf8");

  assert.match(petPage, /src="\.\.\/\.\.\/assets\/pets\/desk-pet\.png"/, "the companion should keep using the restored original illustration file");
  assert.match(petPage, /😳 与Ta对话/, "the restored context menu should retain its original chat copy");
  assert.match(petPage, /🌸 隐藏桌宠/, "the restored context menu should retain its original hide copy");
  assert.match(petPage, /#pet-img\.idle\s*\{\s*animation:\s*float/, "the original idle animation should remain available");
});

test("companion overlays do not retain an exposed transparent canvas", async () => {
  const main = await fs.readFile(path.join(root, "electron/main/index.js"), "utf8");
  const petPage = await fs.readFile(path.join(root, "app/pages/pet/index.html"), "utf8");
  const chatStyles = await fs.readFile(path.join(root, "app/features/assistant/ai-chat.css"), "utf8");

  assert.match(chatStyles, /html\.ai-window-mode body\{box-sizing:border-box;padding:4px\}/, "the chat should reserve a small internal gutter for complete edge antialiasing");
  assert.match(chatStyles, /html\.ai-window-mode #aiPanel\{[\s\S]*?width:100%;height:100%;[\s\S]*?border-radius:32px!important;[\s\S]*?contain:paint/, "the full-size chat panel should render and contain its own smooth CSS radius");
  assert.doesNotMatch(chatStyles, /html\.ai-window-mode #aiPanel\{[^}]*animation:/, "the CSS radius should not be resampled by a panel transform animation");
  assert.doesNotMatch(chatStyles, /html\.ai-window-mode #aiPanel\{[^}]*clip-path:/, "the chat panel should not add a second clipped boundary around the native window");
  assert.match(petPage, /html\.pet-window-mode,html\.pet-window-mode body\.chibi-theme\{background:rgba\(0,0,0,0\)!important;background-color:rgba\(0,0,0,0\)!important\}/, "the pet page should override the shared theme on both document roots with a fully transparent canvas");
  assert.doesNotMatch(petPage, /shared\/styles\/tweakcn-theme\.css/, "the transparent pet page should not load the main application's opaque body theme");
  assert.match(main, /const PET_WINDOW_SIZE = Object\.freeze\(\{ width: 260, height: 280 \}\);/, "the transparent pet should reserve its largest required surface at construction time");
  assert.match(main, /const AI_CHAT_TRANSPARENT_GUTTER = 4;/, "the chat's renderer-safe transparent gutter should be explicit");
  assert.doesNotMatch(main, /petWindow\.setSize\(/, "the transparent pet window should never be resized after construction");
  assert.match(main, /const OVERLAY_WINDOW_OPTIONS = Object\.freeze\(\{\s*frame: false,\s*transparent: true,\s*resizable: false,\s*hasShadow: false\s*\}\);/, "overlay windows should use Electron's minimal supported transparent-window configuration");
  assert.equal((main.match(/webPreferences:\s*\{[^}]*transparent: true/g) || []).length, 2, "both overlay WebContents should explicitly enable guest-page transparency");
  assert.doesNotMatch(main, /\.setShape\(|function roundedWindowShape\(/, "overlay UI should never be approximated with a jagged native window region");
  assert.doesNotMatch(main, /setBackgroundMaterial|setAccentColor|setBackgroundColor/, "overlay windows should not mix DWM material APIs into Electron's layered transparency path");
  assert.match(main, /ipcMain\.on\("ai-window:set-mouse-passthrough"[\s\S]*?aiChatWindow\.setIgnoreMouseEvents/, "transparent chat corners should use hit testing instead of native clipping");
  assert.match(main, /petWindow\.once\("ready-to-show", \(\) => \{[\s\S]*?if \(petVisible && \(!overlayVisualTest \|\| overlayVisualTarget !== "chat"\)\) showPetWindow\(\)/, "the pet should only be revealed after its renderer has painted");
  assert.match(main, /if \(candidate && !candidate\.isDestroyed\(\)\) candidate\.destroy\(\)/, "failed pet construction should not leave an orphaned hidden native window");
  assert.match(main, /ipcMain\.handle\("pet:click", \(\) => \{ resizePetWindow\(\);/, "opening the chat should restore the pet's normal bounds");
  assert.match(main, /ipcMain\.handle\("pet:resize", \(event, \{ width, height \} = \{\}\) => \{\s*if \(event\.sender !== petWindow\?\.webContents\) return false;\s*return resizePetWindow\(width, height\);/, "only the pet renderer may request its constrained menu size");
});

test("desktop application menu routes only approved workspace commands", async () => {
  const main = await fs.readFile(path.join(root, "electron/main/index.js"), "utf8");
  const preload = await fs.readFile(path.join(root, "electron/preload/index.cjs"), "utf8");
  const shellScript = await fs.readFile(path.join(root, "app/shell/navigation/stitch-shell.js"), "utf8");

  assert.match(main, /import \{[\s\S]*?Menu[\s\S]*?\} from "electron"/, "main process should use Electron's native application menu");
  assert.match(main, /const SHELL_VIEWS = new Set\(\["calendar", "schedule", "habits", "notes", "music", "settings"\]\);/, "desktop menu commands should be limited to known workspace views");
  assert.match(main, /label: "日历", accelerator: "Alt\+1"/, "application menu should expose a calendar shortcut");
  assert.match(main, /label: "音乐", accelerator: "Alt\+5"/, "application menu should expose a music shortcut");
  assert.match(main, /label: "设置", accelerator: "CommandOrControl\+,"/, "application menu should expose a settings shortcut");
  assert.match(main, /label: "打开 AI 对话", accelerator: "CommandOrControl\+Shift\+A"/, "application menu should expose an AI shortcut");
  assert.match(main, /Menu\.setApplicationMenu\(buildApplicationMenu\(\)\)/, "native menu should be installed when Electron is ready");
  assert.match(preload, /onShellCommand: \(handler\) => \{[\s\S]*?ipcRenderer\.on\("shell:command", listener\)[\s\S]*?removeListener\("shell:command", listener\)/, "preload should expose a disposable shell command listener");
  assert.match(shellScript, /onShellCommand\?\.\(command => \{[\s\S]*?type === 'settings'[\s\S]*?KairosSettingsFeature\?\.open\?\.[\s\S]*?\['calendar', 'schedule', 'habits', 'notes', 'music'\]\.includes\(type\)/, "shell commands should reuse the settings dialog and route only supported SPA views");
});

test("settings expose configurable reminder defaults", async () => {
  const settingsScript = await fs.readFile(path.join(root, "app/features/settings/settings-feature.js"), "utf8");
  const scheduleScript = await fs.readFile(path.join(root, "app/features/calendar/schedule-feature.js"), "utf8");

  assert.match(
    settingsScript,
    /reminders: \{ deadline: '1440', event: '30', match: '30', snoozeMinutes: '10', desktopNotifications: true \}/,
    "settings defaults should include reminder rules"
  );
  assert.match(
    settingsScript,
    /\['reminders', 'notifications', 'Reminders'\]/,
    "settings navigation should expose a Reminders panel"
  );
  assert.match(
    settingsScript,
    /const remindersMarkup = \(\) => sectionView\('reminders', 'Reminders'[\s\S]*?Deadline default[\s\S]*?Event default[\s\S]*?Match default[\s\S]*?Snooze duration[\s\S]*?Windows notifications[\s\S]*?reminders\.desktopNotifications/,
    "Reminders settings should let the user configure default offsets, snooze duration, and native notifications"
  );
  assert.match(
    scheduleScript,
    /const defaultReminderForType=type=>window\.KairosReminderCore\?\.defaultReminderForType\?\.\(type,readSettings\(\)\?\.reminders\)[\s\S]*?f\.type\.onchange=\(\)=>\{if\(f\.reminder\.value==='none'&&!editing\)f\.reminder\.value=defaultReminderForType\(f\.type\.value\)\}/,
    "new schedule forms should apply the saved reminder default for the selected type"
  );
  assert.match(
    scheduleScript,
    /reminder:defaultReminderForType\(type\)/,
    "new schedules should start with the configured reminder default"
  );
});

test("settings expose configurable habit backfill defaults", async () => {
  const settingsScript = await fs.readFile(path.join(root, "app/features/settings/settings-feature.js"), "utf8");

  assert.match(
    settingsScript,
    /habits: \{ allowBackfillDefault: false \}/,
    "habit backfill should be disabled by default"
  );
  assert.match(
    settingsScript,
    /\['habits', 'potted_plant', 'Habits'\]/,
    "settings navigation should expose a Habits panel"
  );
  assert.match(
    settingsScript,
    /const habitsMarkup = \(\) => sectionView\('habits', 'Habits'[\s\S]*?Allow past-date check-ins for new habits[\s\S]*?habits\.allowBackfillDefault[\s\S]*?Existing habits keep their own backfill setting/,
    "Habit settings should configure the backfill default for newly created habits"
  );
});

test("settings can reduce motion across shell and embedded pages", async () => {
  const settingsScript = await fs.readFile(path.join(root, "app/features/settings/settings-feature.js"), "utf8");
  const shellScript = await fs.readFile(path.join(root, "app/shell/navigation/stitch-shell.js"), "utf8");

  assert.match(settingsScript, /accessibility: \{ reduceMotion: false \}/, "reduce motion should default off for existing users");
  assert.match(settingsScript, /accessibility: \{ \.\.\.defaults\.accessibility, \.\.\.\(input\?\.accessibility \|\| \{\}\) \}/, "legacy settings should merge the accessibility preference safely");
  assert.match(settingsScript, /const applyMotionPreference = \(\) => document\.documentElement\.classList\.toggle\('kairos-reduce-motion', state\.accessibility\.reduceMotion === true\)/, "settings should apply the saved motion preference to the current document");
  assert.match(settingsScript, /kairosReduceMotion', 'Reduce motion', state\.accessibility\.reduceMotion, 'accessibility\.reduceMotion'/, "Appearance settings should expose a reduce motion toggle");
  assert.match(shellScript, /html\.kairos-reduce-motion \*,html\.kairos-reduce-motion \*::before,html\.kairos-reduce-motion \*::after\{animation-duration:\.001ms!important/, "manual reduce motion should neutralize animations and transitions globally");
  assert.match(shellScript, /message\?\.type === 'kairos:motion-preference' && event\.source === window\.top/, "embedded pages should only accept motion preferences from their shell");
  assert.match(shellScript, /const syncMotionPreference = frame => frame\?\.contentWindow\?\.postMessage\(\{ type:'kairos:motion-preference'/, "shell should propagate the preference to embedded pages");
  assert.match(shellScript, /window\.addEventListener\('kairos:settings-changed', event => \{[\s\S]*?spaFrames\.forEach\(syncMotionPreference\)/, "changing the setting should update every mounted embedded page");
});

test("calendar backgrounds are configurable, isolated, and rendered by the shell", async () => {
  const settingsScript = await fs.readFile(path.join(root, "app/features/settings/settings-feature.js"), "utf8");
  const shellScript = await fs.readFile(path.join(root, "app/shell/navigation/stitch-shell.js"), "utf8");
  const playerCss = await fs.readFile(path.join(root, "app/shell/player/music-player.css"), "utf8");
  const layoutCss = await fs.readFile(path.join(root, "app/shared/styles/stitch-layout.css"), "utf8");
  const main = await fs.readFile(path.join(root, "electron/main/index.js"), "utf8");
  const preload = await fs.readFile(path.join(root, "electron/preload/index.cjs"), "utf8");

  assert.match(settingsScript, /calendarBackground: \{ source: 'custom', id: 'default\.jpg', blur: 6, brightness: 95 \}/, "Appearance defaults should select the seeded user-library calendar background with the approved visual settings");
  assert.match(settingsScript, /Calendar background[\s\S]*?data-import-calendar-background/, "Appearance should expose the calendar background import control");
  assert.match(settingsScript, /data-calendar-background-card-select[\s\S]*?data-calendar-background-rename[\s\S]*?kairos-background-card-grid[\s\S]*?kairos-background-import-card/, "Background selection should use cards with inline rename and an equal-sized import card");
  assert.match(settingsScript, /data-calendar-background-delete[\s\S]*?confirmAction\(\{ title: `Delete \$\{label\}\?`[\s\S]*?calendarBackgrounds\?\.remove/, "Background cards should confirm deletion through the constrained bridge");
  assert.match(settingsScript, /calendarBackgrounds\?\.rename[\s\S]*?refreshCalendarBackgroundData/, "Renaming should refresh the single background gallery");
  assert.doesNotMatch(settingsScript, /customCalendarBackgrounds|listCustoms/, "The gallery should not read background names from a second source");
  assert.doesNotMatch(settingsScript, /data-reset-calendar-background|Calendar background restored/, "Calendar backgrounds should not expose a restore-default action");
  assert.match(settingsScript, /syncCalendarBackgroundPreview[\s\S]*?calendar-background-preview-blur[\s\S]*?calendar-background-preview-brightness/, "Preview state should include the selected image and both visual adjustments");
  assert.match(settingsScript, /const button = event\.currentTarget;[\s\S]*?if \(button\.isConnected\) \{[\s\S]*?button\.disabled = false;/, "Canceling the native image picker should re-enable the original button safely");
  assert.match(settingsScript, /chooseImport\?\.\(\)[\s\S]*?confirmAction\(\{ title: 'Name calendar background'[\s\S]*?completeImport\(\{ token: selection\.token, name \}\)/, "Importing should collect a user-editable name before copying the image");
  assert.match(main, /calendarBackgroundDir[\s\S]*?CalendarBackgroundService\(\{ builtinDir:[\s\S]*?userDir: calendarBackgroundDir\(\)[\s\S]*?calendarBackgrounds\.initialize\(\)/, "The main process should seed one writable user-data background library before the UI opens");
  assert.doesNotMatch(main, /calendar-background:list-customs/, "Calendar backgrounds should use one runtime library instead of separate built-in and custom lists");
  assert.match(main, /protocol\.handle\("kairos-background"[\s\S]*?calendarBackgroundService\(\)\.resolve/, "Calendar image URLs should resolve only through the constrained protocol handler");
  assert.match(main, /calendar-background:delete[\s\S]*?calendarBackgroundService\(\)\.remove/, "The main process should constrain background deletion to the service");
  assert.match(preload, /calendarBackgrounds: Object\.freeze\(\{ listBuiltins:[\s\S]*?chooseImport:[\s\S]*?completeImport:[\s\S]*?rename:[\s\S]*?remove:/, "The renderer should receive only the narrow calendar background bridge");
  assert.match(shellScript, /applyCalendarBackground[\s\S]*?kairos-calendar-background-active/, "The shell should apply saved background settings to the calendar view");
  assert.match(playerCss, /#musicPlayer::before\s*\{[\s\S]*?var\(--kairos-calendar-background-image[\s\S]*?--kairos-calendar-background-blur[\s\S]*?--kairos-calendar-background-brightness/, "The shared player should use the active calendar background settings");
  assert.match(layoutCss, /calendar-is-fullscreen::before\{[\s\S]*?--kairos-calendar-background-image[\s\S]*?--kairos-calendar-background-blur[\s\S]*?--kairos-calendar-background-brightness/, "Fullscreen calendar should keep the active background image and adjustments");
});

test("calendar background shell preserves zero blur instead of restoring the default", async () => {
  const shellScript = await fs.readFile(path.join(root, "app/shell/navigation/stitch-shell.js"), "utf8");
  const properties = new Map();
  const classes = new Set();
  const classList = { add: value => classes.add(value), remove: value => classes.delete(value), toggle: (value, enabled) => enabled ? classes.add(value) : classes.delete(value), contains: value => classes.has(value) };
  const document = {
    documentElement: { classList, style: { setProperty: (name, value) => properties.set(name, value) } },
    body: { dataset: { page: "calendar" }, classList, children: [], appendChild: () => {} },
    head: { insertAdjacentHTML: () => {} },
    getElementById: () => null,
    querySelector: () => null,
    createElement: () => ({})
  };
  const context = vm.createContext({ document, localStorage: { getItem: () => JSON.stringify({ appearance: { calendarBackground: { blur: 0, brightness: 100 } } }) }, URLSearchParams, location: { search: "" } });
  vm.runInContext(shellScript, context, { filename: "stitch-shell.js" });
  assert.equal(properties.get("--kairos-calendar-background-blur"), "0px");
  assert.equal(properties.get("--kairos-calendar-background-brightness"), "100%");
});

test("package metadata defines Windows desktop distribution", async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
  const main = await fs.readFile(path.join(root, "electron/main/index.js"), "utf8");
  const checklist = await fs.readFile(path.join(root, "docs/WINDOWS-RELEASE-CHECKLIST.md"), "utf8");

  assert.equal(pkg.productName, "Kairos");
  assert.equal(pkg.build.appId, "app.kairos.desktop");
  assert.match(main, /if \(process\.platform === "win32"\) app\.setAppUserModelId\("app\.kairos\.desktop"\);/, "Windows notifications and shortcuts should use the packaged Kairos app identity");
  assert.equal(pkg.main, "electron/main/index.js");
  assert.equal(pkg.scripts.start, "node scripts/kairos-dev.cjs");
  assert.equal(pkg.scripts.dev, "node scripts/kairos-dev.cjs");
  assert.equal(pkg.scripts.doctor, "node scripts/kairos-doctor.cjs");
  assert.equal(pkg.scripts.pack, "pnpm build:styles && electron-builder --dir");
  assert.equal(pkg.scripts.dist, "pnpm build:styles && electron-builder --win");
  assert.equal(pkg.scripts["dist:win"], "pnpm build:styles && electron-builder --win nsis portable");
  assert.equal(pkg.scripts["audit:app-state"], "node electron/scripts/audit/app-state-audit.js");
  assert.equal(pkg.scripts["audit:desktop-data"], "node electron/scripts/audit/desktop-data-audit.js");
  assert.match(pkg.scripts.check, /node --check scripts\/kairos-dev\.cjs/);
  assert.match(pkg.scripts.check, /node --check scripts\/kairos-doctor\.cjs/);
  assert.match(pkg.scripts.check, /node --check electron\/data\/sqlite\/index\.js/);
  assert.match(pkg.scripts.check, /node --check electron\/scripts\/audit\/app-state-audit\.js/);
  assert.match(pkg.scripts.check, /node --check electron\/scripts\/audit\/desktop-data-audit\.js/);
  assert.equal(pkg.scripts["verify:dist"], "node --test electron/tests/distribution/dist-artifacts.test.js");
  assert.equal(pkg.scripts["verify:installer"], "node electron/scripts/release/installer-smoke.js");
  assert.equal(pkg.scripts["release:manifest"], "node electron/scripts/release/release-manifest.js");
  assert.equal(pkg.scripts["verify:release"], "pnpm check && pnpm dist:win && pnpm release:manifest && pnpm verify:dist");
  assert.equal(pkg.scripts["verify:release:full"], "pnpm verify:release && pnpm verify:installer");
  assert.equal(pkg.build.appId, "app.kairos.desktop");
  assert.equal(pkg.build.artifactName, "${productName}-${version}-${os}-${arch}.${ext}");
  assert.equal(pkg.build.directories.output, "release");
  assert.equal(pkg.build.win.icon, "app/assets/icons/netease-format.ico");
  assert.deepEqual(pkg.build.win.target.map(item => item.target), ["nsis", "portable"]);
  assert.equal(pkg.build.nsis.artifactName, "${productName}-${version}-${os}-${arch}-setup.${ext}");
  assert.equal(pkg.build.portable.artifactName, "${productName}-${version}-${os}-${arch}-portable.${ext}");
  assert.equal(pkg.build.nsis.oneClick, false);
  assert.equal(pkg.build.nsis.deleteAppDataOnUninstall, false);
  assert.ok(pkg.build.files.includes("app/**/*"), "renderer assets should be packaged");
  assert.ok(pkg.build.files.includes("electron/**/*"), "main process files should be packaged");
  assert.ok(pkg.build.files.includes("!electron/tests{,/**}"), "test files should stay out of the runtime package");
  assert.ok(pkg.build.files.includes("!electron/scripts{,/**}"), "developer scripts should stay out of the runtime package");
  assert.ok(pkg.build.files.includes("!.env*"), "local secret files must not be packaged");
  assert.ok(pkg.build.files.includes("!docs{,/**}"), "project docs should stay out of the runtime package");
  assert.ok(pkg.devDependencies["electron-builder"], "electron-builder should be available for distribution builds");
  assert.match(checklist, /pnpm audit:app-state[\s\S]*?退出码为 `0`[\s\S]*?退出码为 `2`[\s\S]*?退出码为 `1`/, "release checklist should document app-state audit usage and exit codes");
});

test("development launch scripts provide local runtime diagnostics", async () => {
  const cmd = await fs.readFile(path.join(root, "start-kairos.cmd"), "utf8");
  const ps1 = await fs.readFile(path.join(root, "start-kairos.ps1"), "utf8");
  const devScript = await fs.readFile(path.join(root, "scripts/kairos-dev.cjs"), "utf8");
  const doctorScript = await fs.readFile(path.join(root, "scripts/kairos-doctor.cjs"), "utf8");

  assert.match(cmd, /scripts\\kairos-dev\.cjs/, "cmd launcher should delegate to the shared dev launcher");
  assert.match(cmd, /D:\\nodejs\\node\.exe/, "cmd launcher should use the known local Node install when PATH is missing");
  assert.match(cmd, /scripts\\kairos-doctor\.cjs/, "cmd launcher should suggest the doctor script after failures");
  assert.match(ps1, /scripts\\kairos-dev\.cjs/, "PowerShell launcher should delegate to the shared dev launcher");
  assert.match(ps1, /D:\\nodejs\\node\.exe/, "PowerShell launcher should use the known local Node install when PATH is missing");
  assert.match(ps1, /scripts\\kairos-doctor\.cjs/, "PowerShell launcher should suggest the doctor script after failures");
  assert.match(devScript, /node_modules", "\.bin"[\s\S]*?electron\.cmd/, "dev launcher should prefer the local package binary");
  assert.match(devScript, /node_modules", "electron", "dist"[\s\S]*?electron\.exe/, "dev launcher should still support the Electron executable fallback");
  assert.match(devScript, /Kairos could not find the local Electron runtime[\s\S]*?pnpm install[\s\S]*?npm install/, "dev launcher should print install guidance instead of a raw spawn failure");
  assert.match(doctorScript, /Kairos desktop environment[\s\S]*?npm[\s\S]*?pnpm[\s\S]*?Electron/, "doctor should report Node package manager and Electron paths");
});

test("distribution smoke verifies desktop userData health", async () => {
  const verifier = await fs.readFile(path.join(root, "electron/tests/distribution/dist-artifacts.test.js"), "utf8");

  assert.match(
    verifier,
    /import \{ auditDesktopDataDir \} from "\.\.\/\.\.\/scripts\/audit\/desktop-data-audit\.js";/,
    "distribution verifier should use the shared desktop data audit"
  );
  assert.match(
    verifier,
    /const audit = await auditDesktopDataDir\(userDataDir\);[\s\S]*?assert\.equal\(audit\.ok, true[\s\S]*?app-state\.json[\s\S]*?migration-ready/,
    "distribution smoke should fail when generated userData is not migration-ready"
  );
  assert.match(
    verifier,
    /async function verifyPortableStartup\(executablePath\) \{[\s\S]*?KAIROS_SMOKE_STATE_MARKER: marker[\s\S]*?assertSmokePersistence\(result\);[\s\S]*?smoke-result-second\.json[\s\S]*?KAIROS_SMOKE_EXPECT_STATE_MARKER: "1"[\s\S]*?assertSmokePersistence\(restarted, \{ expectExisting: true \}\);/,
    "portable smoke should verify persisted app-state music and AI data across a restart"
  );
});

test("installer smoke verifies installed app single instance behavior", async () => {
  const installerSmoke = await fs.readFile(path.join(root, "electron/scripts/release/installer-smoke.js"), "utf8");
  const checklist = await fs.readFile(path.join(root, "docs/WINDOWS-RELEASE-CHECKLIST.md"), "utf8");

  assert.match(
    installerSmoke,
    /async function assertSingleInstanceFocus\(executablePath, userDataDir\) \{[\s\S]*?spawn\(executablePath[\s\S]*?await waitForRunningProcess\(first, "first installed Kairos process"\)[\s\S]*?spawn\(executablePath[\s\S]*?await waitForExit\(second\)[\s\S]*?first installed Kairos process should remain running after second launch/,
    "installer smoke should prove a second installed-app launch does not keep a second Kairos.exe process"
  );
  assert.match(
    installerSmoke,
    /console\.log\("Verifying installed Kairos single-instance behavior"\);[\s\S]*?await assertSingleInstanceFocus\(installedExe, path\.join\(userDataDir, "single-instance"\)\);/,
    "installer smoke should run single-instance verification after installed app startup"
  );
  assert.match(
    checklist,
    /verify:installer[\s\S]*?重复启动聚焦/,
    "release checklist should record installed single-instance coverage"
  );
});

test("main process initializes the optional SQLite app database", async () => {
  const main = await fs.readFile(path.join(root, "electron/main/index.js"), "utf8");

  assert.match(
    main,
    /import \{ KairosAppDatabase \} from "\.\.\/data\/sqlite\/index\.js";/,
    "main process should import the desktop database layer"
  );
  assert.match(
    main,
    /appDatabase=new KairosAppDatabase\(path\.join\(userData,"kairos\.sqlite"\)\);await appDatabase\.initialize\(\);aiStore=new AiDataStore\(path\.join\(userData,"ai-data\.json"\),\{database:appDatabase\}\);appStateStore=new AppStateStore\(path\.join\(userData,"app-state\.json"\),\{database:appDatabase\}\)[\s\S]*?musicLibrary=new MusicLibrary\(\{statePath:path\.join\(userData,"music-state\.json"\),coverDir:path\.join\(userData,"music-covers"\),database:appDatabase\}\);neteaseService=new NeteaseApiService\(\{statePath:path\.join\(userData,"netease-api-state\.json"\),database:appDatabase\}\)/,
    "main process should initialize SQLite in userData and mirror app-state plus auxiliary store writes"
  );
});

test("main process restores auxiliary settings from SQLite snapshots", async () => {
  const main = await fs.readFile(path.join(root, "electron/main/index.js"), "utf8");
  const neteaseService = await fs.readFile(path.join(root, "electron/services/music/netease-api-service.js"), "utf8");

  assert.match(
    main,
    /import \{ SettingsRepository \} from "\.\.\/data\/settings\/index\.js";/,
    "main process should use a dedicated repository for AI provider settings"
  );
  assert.match(
    main,
    /function settingsRepository\(\) \{ if \(!aiSettingsRepository\) aiSettingsRepository = new SettingsRepository\(\{ filePath: settingsPath\(\), defaults, normalize: normalizeSettings, database: appDatabase, storeKey: "ai-settings"[\s\S]*?async function readSettings\(\) \{ return settingsRepository\(\)\.read\(\); \}/,
    "AI settings repository should rebuild ai-settings.json from its SQLite json_store snapshot"
  );
  assert.match(
    neteaseService,
    /this\.stateRepository = statePath \? new SettingsRepository\(\{[\s\S]*?storeKey: "netease-api-state"[\s\S]*?async initialize\(\) \{[\s\S]*?this\.cookie = \(await this\.stateRepository\.read\(\)\)\.cookie;/,
    "NetEase login cookie should use the atomic SQLite-restorable state repository"
  );
  assert.match(
    neteaseService,
    /readDatabaseSnapshot\(\) \{\s*return this\.stateRepository\?\.readSnapshot\(\) \|\| null;/,
    "NetEase service should expose its repository-backed SQLite snapshot"
  );
});

test("settings preferences persist through desktop app state", async () => {
  const settingsScript = await fs.readFile(path.join(root, "app/features/settings/settings-feature.js"), "utf8");

  assert.match(
    settingsScript,
    /window\.kairosDesktop\?\.appState/,
    "settings should use the desktop appState bridge when available"
  );
  assert.match(
    settingsScript,
    /await api\.save\(\{ \.\.\.desktopState, settings: value \}\);/,
    "settings should be saved into the persistent app-state.json document"
  );
  assert.match(
    settingsScript,
    /localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(value\)\)/,
    "settings should keep localStorage as a legacy/cache fallback"
  );
});

test("settings music panel manages NetEase account and quality preferences", async () => {
  const settingsScript = await fs.readFile(path.join(root, "app/features/settings/settings-feature.js"), "utf8");
  const settingsCss = await fs.readFile(path.join(root, "app/features/settings/settings-feature.css"), "utf8");
  const musicHtml = await fs.readFile(path.join(root, "app/pages/music/index.html"), "utf8");
  const playerScript = await fs.readFile(path.join(root, "app/shell/player/music-player.js"), "utf8");
  const appReadme = await fs.readFile(path.join(root, "app/README.md"), "utf8");
  const complianceDoc = await fs.readFile(path.join(root, "docs/NETEASE-COMPLIANCE.md"), "utf8");

  assert.match(
    settingsScript,
    /music: \{ neteaseQuality: 'standard' \}/,
    "settings defaults should include a NetEase streaming quality preference"
  );
  assert.match(
    settingsScript,
    /neteaseQuality: \[\['standard', 'Standard'\], \['higher', 'Higher'\], \['exhigh', 'Very high'\], \['lossless', 'Lossless'\]\]/,
    "settings should expose supported NetEase quality levels"
  );
  assert.match(
    settingsScript,
    /data-netease-refresh[\s\S]*?Refresh account data[\s\S]*?data-netease-clear-cache[\s\S]*?Clear local cache[\s\S]*?data-netease-clear-session[\s\S]*?Clear session/,
    "music settings should render account refresh cache clearing and clear-session actions"
  );
  assert.match(
    settingsScript,
    /personal learning and daily planning only[\s\S]*?does not redistribute music content[\s\S]*?commercial public playback/,
    "music settings should explain the first-version NetEase personal-use scope"
  );
  assert.match(
    settingsScript,
    /Scan with your own Netease Music account[\s\S]*?personal learning use only[\s\S]*?does not redistribute music content/,
    "settings QR login dialog should remind the user of personal-account scope before login"
  );
  assert.doesNotMatch(
    musicHtml,
    /class="netease-login-scope"[\s\S]*?Use your own Netease Music account for personal learning only[\s\S]*?does not redistribute music content[\s\S]*?commercial public playback/,
    "music page login gate should not show the removed NetEase personal-use scope notice"
  );
  assert.match(
    settingsCss,
    /\.kairos-netease-scope\{[\s\S]*?background:#fff8f4[\s\S]*?font:700 12px\/1\.45/,
    "settings scope notice should have dedicated readable styling"
  );
  assert.match(
    settingsScript,
    /data-netease-refresh[\s\S]*?window\.kairosDesktop\?\.netease\?\.getStatus\?\.\(\)[\s\S]*?Netease account refreshed/,
    "account refresh should reload NetEase status through the desktop bridge"
  );
  assert.match(
    settingsScript,
    /data-netease-clear-session[\s\S]*?Clear Netease session\?[\s\S]*?window\.kairosDesktop\?\.netease\?\.logout\?\.\(\)[\s\S]*?Netease session cleared/,
    "clear session should remove the saved NetEase login cookie without touching local music"
  );
  assert.match(
    settingsScript,
    /const clearNeteaseLocalCache = \(\) => \{[\s\S]*?localStorage\.removeItem\('kairos-netease-playback-state'\)[\s\S]*?kairos-music-last-source'[\s\S]*?kairos:netease-cache-cleared/,
    "settings should clear NetEase local playback cache without logging out"
  );
  assert.match(
    settingsScript,
    /data-netease-clear-cache[\s\S]*?Clear Netease local cache\?[\s\S]*?clearNeteaseLocalCache\(\)[\s\S]*?Netease local cache cleared/,
    "settings should expose a confirmed NetEase local cache cleanup action"
  );
  assert.match(
    settingsCss,
    /\.kairos-netease-tools\{[\s\S]*?\.kairos-netease-tools button:not\(:disabled\):hover/,
    "NetEase account tools should have dedicated desktop settings styles"
  );
  assert.match(
    musicHtml,
    /const getNeteaseQualityPreference = \(\) => \{[\s\S]*?settings\?\.music\?\.neteaseQuality[\s\S]*?\['standard', 'higher', 'exhigh', 'lossless'\]/,
    "music page should read the saved NetEase quality preference"
  );
  assert.match(
    musicHtml,
    /api\.playSong\(\{ id: song\.id, neteaseId: song\.neteaseId, level: getNeteaseQualityPreference\(\) \}\)/,
    "NetEase row playback should pass the selected quality level"
  );
  assert.match(
    playerScript,
    /const getNeteaseQualityPreference = \(\) => \{[\s\S]*?settings\?\.music\?\.neteaseQuality[\s\S]*?return \['standard','higher','exhigh','lossless'\]\.includes\(value\) \? value : 'standard';/,
    "shared player URL refresh should read the selected NetEase quality level"
  );
  assert.match(
    playerScript,
    /api\.playSong\(\{ id: track\.id, neteaseId: track\.neteaseId, level: getNeteaseQualityPreference\(\) \}\)/,
    "shared player URL refresh should pass the selected quality level"
  );
  assert.match(
    playerScript,
    /window\.addEventListener\('kairos:netease-cache-cleared', clearNeteasePlayback\)/,
    "shared player should react to settings-driven NetEase cache clearing"
  );
  assert.match(
    appReadme,
    /Netease Music integration is limited to the user's own authorized account[\s\S]*?does not redistribute music content[\s\S]*?NETEASE-COMPLIANCE\.md/,
    "app README should point maintainers to the NetEase compliance scope"
  );
  assert.match(
    complianceDoc,
    /Personal authorization only[\s\S]*?No music content redistribution[\s\S]*?No commercial public playback[\s\S]*?No bypass of Netease rights/,
    "NetEase compliance doc should define allowed and out-of-scope behavior"
  );
});

test("settings data panel manages app-state backups", async () => {
  const settingsScript = await fs.readFile(path.join(root, "app/features/settings/settings-feature.js"), "utf8");
  const settingsCss = await fs.readFile(path.join(root, "app/features/settings/settings-feature.css"), "utf8");

  assert.match(
    settingsScript,
    /let appBackups = \[\];[\s\S]*?let backupPreview = null;[\s\S]*?let appAudit = null;/,
    "settings should keep backup list preview and migration audit state"
  );
  assert.match(
    settingsScript,
    /const dataMarkup = \(\) => \{[\s\S]*?window\.kairosDesktop\?\.appState[\s\S]*?data-import-app-state[\s\S]*?data-export-app-state[\s\S]*?data-refresh-backups[\s\S]*?data-preview-backup[\s\S]*?data-restore-backup/,
    "Data settings panel should render import export refresh preview and restore controls"
  );
  assert.match(
    settingsScript,
    /Migration Audit[\s\S]*?auditSummary\(appAudit\)[\s\S]*?data-run-app-audit[\s\S]*?auditIssueList\(appAudit\)/,
    "Data settings panel should render migration audit controls and results"
  );
  assert.match(
    settingsScript,
    /window\.kairosDesktop\.appState\?\.listBackups \? window\.kairosDesktop\.appState\.listBackups\(\)\.catch\(\(\) => \[\]\)[\s\S]*?window\.kairosDesktop\.appState\?\.audit \? window\.kairosDesktop\.appState\.audit\(\)\.catch\(\(\) => null\)/,
    "settings refresh should load managed backups and migration audit from the desktop bridge"
  );
  assert.match(
    settingsScript,
    /data-run-app-audit[\s\S]*?window\.kairosDesktop\?\.appState\?\.audit\?\.\(\)[\s\S]*?flashSaved\('App data audited'\)/,
    "settings should let the user refresh the app-state migration audit"
  );
  assert.match(
    settingsScript,
    /data-restore-backup[\s\S]*?confirmAction\(\{ title: 'Restore app-state backup\?'[\s\S]*?window\.kairosDesktop\?\.appState\?\.restoreBackup\?\.\(button\.dataset\.restoreBackup\)/,
    "restoring a backup should require confirmation and use the constrained appState bridge"
  );
  assert.match(
    settingsScript,
    /data-export-app-state[\s\S]*?window\.kairosDesktop\?\.appState\?\.exportCurrent\?\.\(\)[\s\S]*?flashSaved\('App data exported'\)/,
    "exporting app state should use the desktop save dialog bridge and report success"
  );
  assert.match(
    settingsScript,
    /data-import-app-state[\s\S]*?confirmAction\(\{ title: 'Import app data\?'[\s\S]*?window\.kairosDesktop\?\.appState\?\.importJson\?\.\(\)[\s\S]*?flashSaved\('App data imported'\)/,
    "importing app state should require confirmation and use the desktop open dialog bridge"
  );
  assert.match(
    settingsCss,
    /\.kairos-backup-list[\s\S]*?\.kairos-backup-row[\s\S]*?\.kairos-backup-preview[\s\S]*?\.kairos-audit-list[\s\S]*?\.kairos-audit-ok/,
    "backup and audit management UI should have dedicated layout styles"
  );
});

test("desktop app state exposes constrained backup management", async () => {
  const main = await fs.readFile(path.join(root, "electron/main/index.js"), "utf8");
  const preload = await fs.readFile(path.join(root, "electron/preload/index.cjs"), "utf8");
  const appState = await fs.readFile(path.join(root, "electron/data/app-state/index.js"), "utf8");

  assert.match(
    appState,
    /function assertBackupName\(name\) \{[\s\S]*?value !== path\.basename\(value\)[\s\S]*?\^app-state-v\\d\+-\.\+\\\.json\$[\s\S]*?invalid_backup_path/,
    "app-state backup names should reject traversal and non-backup filenames"
  );
  assert.match(
    appState,
    /async listBackups\(\) \{[\s\S]*?await fs\.readdir\(this\.backupDir\(\)\)[\s\S]*?\^app-state-v\\d\+-\.\+\\\.json\$[\s\S]*?sort\(\(a, b\) => backupSortValue\(b\.name\)/,
    "app-state backups should be listed only from the managed backups directory"
  );
  assert.match(
    appState,
    /backupPath\(name\) \{ return path\.join\(this\.backupDir\(\), assertBackupName\(name\)\); \}[\s\S]*?async readBackup\(name\) \{[\s\S]*?const resolved = path\.resolve\(file\);[\s\S]*?invalid_backup_path/,
    "backup reads should constrain names to managed backup files instead of arbitrary paths"
  );
  assert.match(
    appState,
    /async restoreBackup\(name\) \{[\s\S]*?const raw = await this\.readBackup\(name\);[\s\S]*?const currentBackup = await this\.backupCurrent\("before-restore"\);[\s\S]*?last_restore_backup: currentBackup[\s\S]*?await this\.write\(restored\);/,
    "backup restore should preserve the current app-state before overwriting it"
  );
  assert.match(
    appState,
    /export function auditAppState\(input = \{\}\) \{[\s\S]*?const state = normalize\(input\);[\s\S]*?summary = \{[\s\S]*?schedules: state\.schedules\.length[\s\S]*?habits: state\.habits\.length[\s\S]*?issues[\s\S]*?duplicate_ids[\s\S]*?invalid_schedule_type/,
    "app-state should expose a migration readiness audit with counts and integrity issues"
  );
  assert.match(
    main,
    /ipcMain\.handle\("app:audit",async\(\)=>auditAppState\(await appStateStore\.read\(\)\)\);[\s\S]*?ipcMain\.handle\("app:list-backups",\(\)=>appStateStore\.listBackups\(\)\);[\s\S]*?ipcMain\.handle\("app:read-backup",\(_event,name\)=>appStateStore\.readBackup\(name\)\);[\s\S]*?ipcMain\.handle\("app:restore-backup",async\(_event,name\)=>\{const state=await appStateStore\.restoreBackup\(name\);mainWindow\?\.webContents\.send\("app:state-changed",state\);return state;\}\);/,
    "main process should expose read-only app-state audit and backup management"
  );
  assert.match(
    preload,
    /audit:\(\)=>ipcRenderer\.invoke\("app:audit"\),listBackups:\(\)=>ipcRenderer\.invoke\("app:list-backups"\),readBackup:\(name\)=>ipcRenderer\.invoke\("app:read-backup",name\),restoreBackup:\(name\)=>ipcRenderer\.invoke\("app:restore-backup",name\),exportCurrent:\(\)=>ipcRenderer\.invoke\("app:export-current"\),importJson:\(\)=>ipcRenderer\.invoke\("app:import-json"\)/,
    "preload should expose audit and backup management only under the appState bridge"
  );
  assert.match(
    main,
    /ipcMain\.handle\("app:export-current",async\(\)=>\{const result=await dialog\.showSaveDialog\(mainWindow,[\s\S]*?await fs\.writeFile\(result\.filePath,JSON\.stringify\(state,null,2\),"utf8"\);return\{canceled:false,filePath:result\.filePath\};\}\);/,
    "main process should export current app-state through a user selected save path"
  );
  assert.match(
    main,
    /ipcMain\.handle\("app:import-json",async\(\)=>\{const result=await dialog\.showOpenDialog\(mainWindow,[\s\S]*?const raw=JSON\.parse\(await fs\.readFile\(result\.filePaths\[0\],"utf8"\)\);const backupPath=await appStateStore\.backupCurrent\("before-import"\);const state=await appStateStore\.write\(\{\.\.\.raw,imported_from:result\.filePaths\[0\],imported_at:new Date\(\)\.toISOString\(\),last_import_backup:backupPath\}\);[\s\S]*?return\{canceled:false,state,filePath:result\.filePaths\[0\],backupPath\};/,
    "main process should back up current app-state before importing JSON and broadcast changes"
  );
});

test("NetEase playback stays isolated from local queue persistence", async () => {
  const playerScript = await fs.readFile(path.join(root, "app/shell/player/music-player.js"), "utf8");
  const musicHtml = await fs.readFile(path.join(root, "app/pages/music/index.html"), "utf8");

  assert.match(
    musicHtml,
    /snapshot\.queueTrackIds\.filter\(id => String\(id\)\.startsWith\('netease:'\) && id !== track\.id\)/,
    "NetEase queue actions should drop local track ids instead of mixing local and online queues"
  );
  assert.match(
    musicHtml,
    /snapshot\.tracks\.filter\(item => String\(item\?\.id \|\| ''\)\.startsWith\('netease:'\)\)[\s\S]*?trackMap\.set\(track\.id, \{ \.\.\.\(trackMap\.get\(track\.id\) \|\| \{\}\), \.\.\.track \}\);[\s\S]*?tracks: \[\.\.\.trackMap\.values\(\)\]/,
    "NetEase queue actions should carry existing online track metadata instead of replacing the queue with one new track"
  );
  assert.match(
    musicHtml,
    /let neteaseVisibleSongs = \[\];[\s\S]*?\(neteaseVisibleSongs \|\| \[\]\)\.forEach\(item => \{[\s\S]*?trackMap\.set\(item\.id, makeNeteaseTrackShell\(item\)\);[\s\S]*?queueTrackIds: existingQueue/,
    "NetEase queue actions may use visible rows as a metadata pool without changing the actual online queue ids"
  );
  assert.match(
    musicHtml,
    /const enqueueNeteaseTrack = async \(song, mode = 'queue'\) => \{[\s\S]*?if \(!api\?\.playSong\) throw new Error\('NetEase API is unavailable\.'\);[\s\S]*?const track = makeNeteaseTrackShell\(song\);[\s\S]*?notifyMusicPlayer\(\{/,
    "NetEase queue actions should enqueue song metadata immediately and defer URL fetching until playback"
  );
  assert.doesNotMatch(
    musicHtml,
    /const enqueueNeteaseTrack = async \(song, mode = 'queue'\) => \{[\s\S]*?api\.playSong/,
    "NetEase Add to Queue and Play Next should not request short-lived playable URLs before playback"
  );
  assert.match(
    musicHtml,
    /const playing = isCurrentNetease && snapshot\.playing === true && Boolean\(currentTrackId\);[\s\S]*?playing,[\s\S]*?playbackState = \{ currentTrackId, playing \};/,
    "NetEase queue actions should preserve active online playback while switching from local queues into a paused online queue"
  );
  assert.match(
    musicHtml,
    /const switchingFromLocalQueue = !isCurrentNetease && Boolean\(snapshot\.currentTrackId \|\| snapshot\.queueTrackIds\?\.length\);[\s\S]*?toast\.message\('Switched to NetEase queue'/,
    "NetEase queue actions should clearly communicate when they replace a local queue instead of mixing sources"
  );
  assert.match(
    musicHtml,
    /const reason = mode === 'next'[\s\S]*?'Online songs cannot play next after local tracks\.'[\s\S]*?'Online songs use a separate queue from local tracks\.'[\s\S]*?toast\.message\('Switched to NetEase queue', `[$]\{track\.title \|\| 'NetEase song'\} \\u00b7 [$]\{reason\}`\);/,
    "NetEase queue actions should explain that online and local tracks use separate queues"
  );
  assert.match(
    playerScript,
    /const isGlobalPlayerSettingPatch = patch => \{[\s\S]*?keys\.every\(key => key === 'volume' \|\| key === 'muted' \|\| key === 'mode'\);[\s\S]*?\};/,
    "shared player should identify global player setting persistence patches"
  );
  assert.match(
    playerScript,
    /if \(hasNeteaseQueue\(\) && !isGlobalPlayerSettingPatch\(patch\)\) return false;/,
    "NetEase queues should not be persisted into the local music library playback state except global player settings"
  );
  assert.match(
    playerScript,
    /if \(hasNeteaseQueue\(\) && !isGlobalPlayerSettingPatch\(patch\)\) return false;[\s\S]*?const persist = patch => \{ const api = desktop\(\); if \(!api \|\| !shouldPersistPlayback\(patch\)\) return;/,
    "online queues should block local queue playback persistence while allowing shared volume and mode settings"
  );
  assert.match(
    playerScript,
    /els\.mode\.onclick=\(\)=>\{[\s\S]*?persist\(\{mode:state\.mode\}\); emitState\(\); \};/,
    "playback mode changes should broadcast immediately across the shared player surfaces"
  );
  assert.match(
    playerScript,
    /lastAppliedRefreshAt = 0/,
    "shared player should track external refresh ordering"
  );
  assert.match(
    playerScript,
    /const incomingAt = Number\(detail\?\.at \|\| 0\);[\s\S]*?if \(incomingAt > 0 && incomingAt < lastAppliedRefreshAt\) return;[\s\S]*?if \(incomingAt > 0\) lastAppliedRefreshAt = incomingAt;/,
    "older delayed music refresh retries should not overwrite newer playback state"
  );
  assert.match(
    playerScript,
    /if \(patch\?\.position\?\.trackId && isNeteaseId\(patch\.position\.trackId\)\) return false;/,
    "online playback positions should never be written into the local music playback state"
  );
  assert.match(
    playerScript,
    /const NETEASE_PLAYBACK_KEY = 'kairos-netease-playback-state';[\s\S]*?const LAST_SOURCE_KEY = 'kairos-music-last-source';/,
    "NetEase playback should keep its own persisted snapshot keys instead of using the local music state file"
  );
  assert.match(
    playerScript,
    /const saveNeteasePlayback = \(\) => \{[\s\S]*?if \(!hasNeteaseQueue\(\)\) return;[\s\S]*?localStorage\.setItem\(NETEASE_PLAYBACK_KEY, JSON\.stringify\(\{[\s\S]*?currentTrackId:[\s\S]*?mode:[\s\S]*?positions,[\s\S]*?updatedAt:[\s\S]*?\}\)\);[\s\S]*?localStorage\.setItem\(LAST_SOURCE_KEY, 'netease'\);[\s\S]*?\};/,
    "NetEase queues should persist a separate last-online snapshot for app restart recovery"
  );
  assert.match(
    playerScript,
    /const restoreLastPlaybackSource = nextState => \{[\s\S]*?if \(lastSource === 'empty'\) return \{ \.\.\.nextState, queueTrackIds: \[\], currentTrackId: null, playing: false \};[\s\S]*?if \(lastSource !== 'netease'\) return nextState;[\s\S]*?tracks: \[\.\.\.localTracks, \.\.\.saved\.tracks\],[\s\S]*?queueTrackIds: saved\.queueTrackIds,[\s\S]*?currentTrackId: saved\.currentTrackId,[\s\S]*?playing: false,/,
    "startup restore should recover the last NetEase queue without autoplaying or mixing it into local queue state"
  );
  assert.match(
    playerScript,
    /if\(options\.restoreLastSource\) nextState=restoreLastPlaybackSource\(nextState\);[\s\S]*?refresh\(true, true, \{ guardExternalVersion: initialRefreshVersion, restoreLastSource: true \}\)/,
    "the initial player refresh should choose the last active local, empty, or NetEase source"
  );
  assert.match(
    playerScript,
    /if\(wasNeteaseQueue\) clearNeteasePlayback\(\);/,
    "clearing an online queue should remove the saved NetEase snapshot so it does not reappear after restart"
  );
  assert.match(
    playerScript,
    /if\(isNeteaseId\(id\)\) \{\s*emitState\(\);\s*return;\s*\}/,
    "NetEase playback should not increment local play counts"
  );
});

test("NetEase playable URLs are refreshed before expiry-sensitive playback", async () => {
  const playerScript = await fs.readFile(path.join(root, "app/shell/player/music-player.js"), "utf8");
  const neteaseService = await fs.readFile(path.join(root, "electron/services/music/netease-api-service.js"), "utf8");

  assert.match(
    neteaseService,
    /urlExpiresAt:\s*expiresIn > 0 \? fetchedAt \+ expiresIn \* 1000 : 0/,
    "NetEase service should expose absolute URL expiry time to the shared player"
  );
  assert.match(
    playerScript,
    /const isNeteaseUrlStale = track => \{[\s\S]*?Date\.now\(\) > expiresAt - 60000;[\s\S]*?\};/,
    "shared player should treat NetEase URLs as stale before they actually expire"
  );
  assert.match(
    playerScript,
    /const neteaseDesktop = \(\) => \{[\s\S]*?window\.parent\?\.kairosDesktop\?\.netease[\s\S]*?\};[\s\S]*?const result = await api\.playSong\(\{ id: track\.id, neteaseId: track\.neteaseId, level: getNeteaseQualityPreference\(\) \}\);/,
    "shared player should refresh NetEase URLs directly with the selected quality when the Music page listener is not mounted"
  );
  assert.match(
    playerScript,
    /async function playLoadedAudio\(\)\{[\s\S]*?if \(isNeteaseUrlStale\(track\)\) \{[\s\S]*?await refreshNeteaseTrackUrl\(track\);/,
    "all current-track play/resume paths should refresh stale NetEase URLs before audio.play"
  );
  assert.match(
    playerScript,
    /els\.toggle\.onclick=async\(\)=>\{ const track=currentTrack\(\); if\(!els\.audio\.src&&!track\) return;/,
    "main player toggle should allow a current NetEase track to refresh its URL even when audio.src is empty"
  );
  assert.match(
    playerScript,
    /if \(detail\?\.playing === true && \(els\.audio\.src \|\| currentTrack\(\)\)\) await playLoadedAudio\(\)/,
    "external NetEase play notifications should not be blocked only because audio.src is empty before URL refresh"
  );
  assert.match(
    playerScript,
    /if\(isNeteaseId\(id\)&&isNeteaseUrlStale\(t\)\)\{[\s\S]*?t=await refreshNeteaseTrackUrl\(t\);/,
    "manual NetEase track playback should refresh stale URLs before loading audio"
  );
  assert.match(
    playerScript,
    /if \(t\.playUrl\) \{[\s\S]*?els\.audio\.src=t\.playUrl;[\s\S]*?\} else if \(isNeteaseId\(t\.id\)\) \{[\s\S]*?els\.audio\.removeAttribute\('src'\);[\s\S]*?els\.audio\.load\(\);[\s\S]*?\}/,
    "shared player should not write empty NetEase shell URLs into the audio element before refresh"
  );
  assert.match(
    playerScript,
    /async function playAdjacentTrack\(direction=1\)\{[\s\S]*?const ok=await playTrack\(id,true,\{silentFailure:true\}\);[\s\S]*?\}[\s\S]*?els\.audio\.onended=\(\)=>\{ playAdjacentTrack\(1\); \};/,
    "automatic next-track playback should advance through the same NetEase URL-refreshing playTrack path"
  );
  assert.match(
    playerScript,
    /const playbackErrorText = error => error\?\.message === 'Unable to refresh NetEase URL' \? 'Unable to refresh NetEase URL' : 'Unable to play this audio file';/,
    "shared player should keep local audio failure messaging separate from NetEase URL refresh failures"
  );
  assert.match(
    playerScript,
    /state\.currentTrackId=previousTrackId;[\s\S]*?state\.playing=false;[\s\S]*?els\.status\.textContent='Unable to refresh NetEase URL';[\s\S]*?loadTrack\(false\);[\s\S]*?syncPlayButton\(\);[\s\S]*?updateQueuePlaybackState\(\);[\s\S]*?emitState\(\);/,
    "shared player should immediately roll back its own controls when NetEase URL refresh fails"
  );
  assert.match(
    playerScript,
    /catch\(error\)\{[\s\S]*?const message=playbackErrorText\(error\);[\s\S]*?state\.playing=false;[\s\S]*?els\.status\.textContent=message;[\s\S]*?if\(!silentFailure\) toast\('error',message\);[\s\S]*?syncPlayButton\(\);[\s\S]*?updateQueuePlaybackState\(\);[\s\S]*?emitState\(\);/,
    "shared player should immediately roll back its own controls with source-aware messaging when audio playback fails"
  );
  assert.match(
    playerScript,
    /async function continueQueuePlayback\(shouldPlay\)\{[\s\S]*?catch\(error\)\{[\s\S]*?state\.playing=false;[\s\S]*?syncPlayButton\(\);[\s\S]*?updateQueuePlaybackState\(\);[\s\S]*?emitState\(\);[\s\S]*?\}/,
    "queue continuation failures should broadcast the stopped state after rolling back controls"
  );
  assert.match(
    playerScript,
    /els\.toggle\.onclick=async\(\)=>\{[\s\S]*?catch\(error\)\{ const message=playbackErrorText\(error\); state\.playing=false; els\.status\.textContent=message; toast\('error',message\); syncPlayButton\(\); updateQueuePlaybackState\(\); emitState\(\);/,
    "main play button failures should roll back shared player controls immediately"
  );
  assert.match(
    playerScript,
    /if \(detail\?\.playing === true && \(els\.audio\.src \|\| currentTrack\(\)\)\) await playLoadedAudio\(\)\.catch\(error=>\{ const message=playbackErrorText\(error\); state\.playing=false; els\.status\.textContent=message; toast\('error',message\); syncPlayButton\(\); updateQueuePlaybackState\(\); emitState\(\); \}\);/,
    "external play refresh failures should broadcast the stopped state after rolling back controls"
  );
  assert.match(
    playerScript,
    /els\.audio\.onerror=async\(\)=>\{ const t=currentTrack\(\); if\(!isNeteaseId\(t\?\.id\)\) return; const fail=message=>\{ state\.playing=false; els\.status\.textContent=message; toast\('error',message\); syncPlayButton\(\); updateQueuePlaybackState\(\); emitState\(\); \}; const refreshed=await refreshNeteaseTrackUrl\(t\); if\(!refreshed\)\{ fail\('Unable to refresh NetEase URL'\); return; \} if\(state\.playing===true\) playLoadedAudio\(\)\.catch\(error=>fail\(playbackErrorText\(error\)\)\); \};/,
    "NetEase audio error recovery should roll back shared player controls when URL refresh or replay fails"
  );
});

test("NetEase rows mirror local playing-state highlighting", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/pages/music/index.html"), "utf8");
  const playerScript = await fs.readFile(path.join(root, "app/shell/player/music-player.js"), "utf8");

  assert.match(
    musicHtml,
    /const isActive = isCurrent && playing;[\s\S]*?row\.classList\.toggle\('is-playing', isActive\);/,
    "NetEase rows should only show the persistent playing highlight while the current track is actively playing"
  );
  assert.match(
    musicHtml,
    /button\.dataset\.state = isActive \? 'pause' : 'play';/,
    "NetEase row play buttons should use the same play/pause state rule as local rows"
  );
  assert.match(
    musicHtml,
    /playButton\.setAttribute\('aria-label', 'Play track'\);/,
    "NetEase row play buttons should use the same initial aria label as local row play buttons"
  );
  assert.doesNotMatch(
    musicHtml,
    /playButton\.setAttribute\('aria-label', `Play /,
    "NetEase row play labels should not switch wording after the first playback-state refresh"
  );
  assert.match(
    musicHtml,
    /const updateNeteasePlaybackRows = \(override = null\) => \{[\s\S]*?const snapshot = override \|\| getPlayerSnapshot\(\);/,
    "NetEase rows should support an immediate local playback-state update like local playlist rows"
  );
  assert.match(
    musicHtml,
    /const syncPlaybackRows = \(override = null\) => \{[\s\S]*?if \(override\) playbackState = override;[\s\S]*?syncVisiblePlaylistPlayback\(\);[\s\S]*?syncHistoryPlayback\(\);[\s\S]*?updateNeteasePlaybackRows\(override\);[\s\S]*?\};/,
    "playback state changes should refresh local playlist, local history, and NetEase rows together"
  );
  assert.match(
    musicHtml,
    /const closeNeteaseRowMenus = \(\) => \{[\s\S]*?neteaseResults\?\.querySelectorAll\('\.track-row-menu:not\(\[hidden\]\)'\)[\s\S]*?aria-expanded', 'false'/,
    "NetEase row menus should have the same reusable close behavior as local playlist row menus"
  );
  assert.match(
    musicHtml,
    /neteaseResults\.onclick = event => \{[\s\S]*?if \(event\.target\.closest\('\.track-row-menu-wrap'\)\) return;[\s\S]*?closeNeteaseRowMenus\(\);[\s\S]*?\};/,
    "clicking blank space in NetEase results should close open row menus"
  );
  assert.match(
    musicHtml,
    /input\.addEventListener\('input', \(\) => \{[\s\S]*?const visible = refreshNeteaseVisibleIndexes\(\) \|\| 0;[\s\S]*?resultsLabel\.textContent = `\$\{visible\} result\$\{visible === 1 \? '' : 's'\}`;[\s\S]*?updateNeteasePlaybackRows\(\);[\s\S]*?\}\);/,
    "filtering NetEase collection rows should refresh row numbering and then re-apply shared playback state"
  );
  assert.match(
    musicHtml,
    /neteaseAccountPanel\.onclick = event => \{[\s\S]*?if \(!event\.target\.closest\('\.track-row-menu-wrap'\)\) closeNeteaseRowMenus\(\);[\s\S]*?\};/,
    "clicking the NetEase detail hero/account panel should close open row menus"
  );
  assert.match(
    musicHtml,
    /const neteasePlaybackDetail = \(snapshot, detail = \{\}\) => \(\{[\s\S]*?tracks: Array\.isArray\(snapshot\?\.tracks\) \? snapshot\.tracks\.filter\(item => String\(item\?\.id \|\| ''\)\.startsWith\('netease:'\)\) : \[\],[\s\S]*?queueTrackIds: Array\.isArray\(snapshot\?\.queueTrackIds\) \? snapshot\.queueTrackIds\.filter\(id => String\(id\)\.startsWith\('netease:'\)\) : \[\],[\s\S]*?mode: snapshot\?\.mode \|\| 'sequence'/,
    "NetEase current-song pause/resume should include online queue metadata like local playback notifications"
  );
  assert.match(
    musicHtml,
    /notifyMusicPlayer\(neteasePlaybackDetail\(snapshot, \{ currentTrackId: song\.id, playing: false \}\)\);[\s\S]*?syncPlaybackRows\(playbackState\);[\s\S]*?notifyMusicPlayer\(neteasePlaybackDetail\(snapshot, \{ currentTrackId: song\.id, playing: true \}\)\);[\s\S]*?syncPlaybackRows\(playbackState\);/,
    "NetEase current-song pause/resume should refresh all visible row controls immediately"
  );
  assert.match(
    musicHtml,
    /playbackState = \{ currentTrackId: track\.id, playing: true \};[\s\S]*?syncPlaybackRows\(playbackState\);/,
    "NetEase new track playback should refresh all visible row controls immediately"
  );
  assert.match(
    musicHtml,
    /const enqueueNeteaseTrack = async \(song, mode = 'queue'\) => \{[\s\S]*?const playing = isCurrentNetease && snapshot\.playing === true && Boolean\(currentTrackId\);[\s\S]*?playbackState = \{ currentTrackId, playing \};[\s\S]*?syncPlaybackRows\(playbackState\);/,
    "NetEase queue actions should refresh every visible row state immediately when they switch the active online queue"
  );
  assert.match(
    playerScript,
    /window\.dispatchEvent\(new CustomEvent\('kairos:music-state-changed',\{detail\}\)\);[\s\S]*?window\.parent\.postMessage\(\{type:'kairos:music-state-changed',detail\},'\*'\);[\s\S]*?document\.querySelectorAll\('iframe'\)/,
    "shared player state changes should be broadcast across shell and embedded Music frames"
  );
});

test("NetEase rows use the same cover fallback as local rows", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/pages/music/index.html"), "utf8");

  assert.match(
    musicHtml,
    /if \(song\.coverUrl\) \{[\s\S]*?cover\.append\(img\);[\s\S]*?\} else \{[\s\S]*?music_note/,
    "NetEase rows should render a music_note placeholder instead of an empty image when cover art is missing"
  );
});

test("playlist selection checkboxes use stable icon text", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/pages/music/index.html"), "utf8");

  assert.match(
    musicHtml,
    /\.track-select-button \.checkmark\{font-family:"Material Symbols Outlined"/,
    "playlist selection checkmarks should render through Material Symbols"
  );
  assert.match(
    musicHtml,
    /<span class="checkmark">check<\/span>/,
    "playlist selection checkmarks should avoid fragile glyphs in source HTML"
  );
  assert.doesNotMatch(
    musicHtml,
    /<span class="checkmark">(?!check<\/span>)[\s\S]*?<\/span>/,
    "playlist selection checkmarks should not contain mojibake or direct check glyphs"
  );
});

test("local and NetEase liked menu copy stays aligned", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/pages/music/index.html"), "utf8");

  assert.match(
    musicHtml,
    /\$\{track\.liked \? 'Remove from Liked' : 'Like'\}/,
    "local playlist row menus should use the same liked-removal wording as NetEase rows"
  );
  assert.match(
    musicHtml,
    /\$\{isNeteaseSongLiked\(song\) \? 'Remove from Liked' : 'Like'\}/,
    "NetEase row menus should keep the same liked-removal wording"
  );
  assert.doesNotMatch(
    musicHtml,
    />Unlike</,
    "liked row menus should avoid the older Unlike label"
  );
});

test("local liked buttons expose current liked state like NetEase rows", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/pages/music/index.html"), "utf8");

  assert.match(
    musicHtml,
    /const likedAriaLabel = liked => liked \? 'Remove from liked songs' : 'Add to liked songs';/,
    "local liked buttons should have a reusable state-aware aria label"
  );
  assert.match(
    musicHtml,
    /aria-label="\$\{likedAriaLabel\(track\.liked === true\)\}" aria-pressed="\$\{track\.liked === true\}"/,
    "local playlist and history liked buttons should render labels from the current liked state"
  );
  assert.match(
    musicHtml,
    /button\.setAttribute\('aria-pressed', String\(liked\)\);[\s\S]*?button\.setAttribute\('aria-label', likedAriaLabel\(liked\)\);/,
    "local playlist liked button toggles should update aria label with aria-pressed"
  );
  assert.match(
    musicHtml,
    /const toggleTrackLike = async \(track, button\) => \{[\s\S]*?button\.disabled = true;[\s\S]*?finally \{[\s\S]*?button\.disabled = false;[\s\S]*?\}/,
    "local playlist liked button should be disabled while the update is in flight"
  );
  assert.match(
    musicHtml,
    /const button = event\.currentTarget;[\s\S]*?button\.setAttribute\('aria-pressed', String\(liked\)\);[\s\S]*?button\.setAttribute\('aria-label', likedAriaLabel\(liked\)\);/,
    "local history liked button toggles should update aria label with aria-pressed"
  );
  assert.match(
    musicHtml,
    /row\.querySelector\('\.track-like-button'\)\?\.addEventListener\('click', async event => \{[\s\S]*?button\.disabled = true;[\s\S]*?finally \{[\s\S]*?button\.disabled = false;[\s\S]*?\}/,
    "local history liked button should be disabled while the update is in flight"
  );
  assert.match(
    musicHtml,
    /console\.error\('toggle history like failed', error\);[\s\S]*?track\.liked = !liked;[\s\S]*?button\.setAttribute\('aria-pressed', String\(track\.liked === true\)\);[\s\S]*?button\.setAttribute\('aria-label', likedAriaLabel\(track\.liked === true\)\);[\s\S]*?toast\.error\('Like failed', 'Please try again\.'\);/,
    "local history liked button failures should roll back like state like playlist and NetEase rows"
  );
  assert.doesNotMatch(
    musicHtml,
    /aria-label="Like song"/,
    "local liked buttons should not keep the stale generic Like song label"
  );
});

test("local music missing files are visible and cleanable", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/pages/music/index.html"), "utf8");
  const preload = await fs.readFile(path.join(root, "electron/preload/index.cjs"), "utf8");
  const main = await fs.readFile(path.join(root, "electron/main/index.js"), "utf8");
  const library = await fs.readFile(path.join(root, "electron/services/music/music-library.js"), "utf8");

  assert.match(preload, /removeUnavailableTracks: \(\) => ipcRenderer\.invoke\("music:remove-unavailable-tracks"\)/, "preload should expose missing local music cleanup");
  assert.match(main, /ipcMain\.handle\("music:remove-unavailable-tracks",\(\)=>musicLibrary\.removeUnavailableTracks\(\)\);/, "main should register missing local music cleanup");
  assert.match(library, /async publicTrack\(track\) \{[\s\S]*?available[\s\S]*?unavailableReason[\s\S]*?missing_file/, "public music state should mark moved or deleted files");
  assert.match(library, /async removeUnavailableTracks\(\) \{[\s\S]*?state\.queueTrackIds = state\.queueTrackIds\.filter[\s\S]*?delete state\.positions\[id\][\s\S]*?playlist\.trackIds = \(playlist\.trackIds \|\| \[\]\)\.filter/, "cleanup should remove missing files from queues, positions, and playlists");
  assert.match(musicHtml, /const unavailable = track\.available === false;[\s\S]*?row\.classList\.toggle\('is-unavailable', unavailable\);[\s\S]*?File unavailable[\s\S]*?Missing/, "local playlist rows should visibly mark unavailable files");
  assert.match(musicHtml, /if \(target\.available === false\) \{[\s\S]*?toast\.error\('File unavailable', 'The local file was moved or deleted\.'\);[\s\S]*?return;/, "local playlist playback should stop before trying to play a moved file");
});

test("local music import rejects empty audio files", async () => {
  const library = await fs.readFile(path.join(root, "electron/services/music/music-library.js"), "utf8");
  const services = await fs.readFile(path.join(root, "electron/tests/integration/services.test.js"), "utf8");

  assert.match(library, /if \(stat\.size <= 0\) \{[\s\S]*?reason: "empty_file"[\s\S]*?continue;/, "local music import should reject empty supported-extension files");
  assert.match(services, /music library rejects empty audio files without polluting the library[\s\S]*?empty_file[\s\S]*?queueTrackIds,\[\]/, "service tests should cover empty-file rejection without queue pollution");
});

test("local music metadata import is bounded and fault tolerant", async () => {
  const library = await fs.readFile(path.join(root, "electron/services/music/music-library.js"), "utf8");
  const services = await fs.readFile(path.join(root, "electron/tests/integration/services.test.js"), "utf8");

  assert.match(library, /const MAX_EMBEDDED_COVER_BYTES = 5 \* 1024 \* 1024;/, "embedded cover extraction should have a bounded size cap");
  assert.match(library, /metadata\.cover\?\.data\?\.length && metadata\.cover\.data\.length <= MAX_EMBEDDED_COVER_BYTES/, "oversized embedded covers should be skipped instead of copied into userData");
  assert.match(services, /music library skips oversized embedded covers and survives malformed tags[\s\S]*?Huge Cover Track[\s\S]*?broken-tags[\s\S]*?covers\.length,0/, "service tests should cover oversized covers and malformed tag fallback");
});

test("local music import explains skipped files", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/pages/music/index.html"), "utf8");

  assert.match(
    musicHtml,
    /const rejectedImportReasonLabels = \{[\s\S]*?unsupported_format: 'unsupported format'[\s\S]*?empty_file: 'empty file'[\s\S]*?unreadable_file: 'unreadable file'[\s\S]*?\};/,
    "local import UI should translate rejected file reasons into readable copy"
  );
  assert.match(
    musicHtml,
    /const summarizeRejectedImports = rejected => \{[\s\S]*?counts\.set\(label, \(counts\.get\(label\) \|\| 0\) \+ 1\);[\s\S]*?join\(', '\);[\s\S]*?\};/,
    "local import UI should group skipped files by reason"
  );
  assert.match(
    musicHtml,
    /const rejectedSummary = summarizeRejectedImports\(result\.rejected\);[\s\S]*?skipped: \$\{rejectedSummary\}[\s\S]*?toast\.message\('Playlist imported', `\$\{result\.imported\?\.length \|\| 0\} imported, \$\{rejectedSummary\}`\);/,
    "local import status and toast should include skipped-file reasons"
  );
});

test("NetEase liked view updates its in-memory list when a song is removed", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/pages/music/index.html"), "utf8");

  assert.match(
    musicHtml,
    /if \(!nextLiked && neteaseActiveView === 'liked'\) \{[\s\S]*?neteaseLastSongs = neteaseLastSongs\.filter\(item => neteaseNumericId\(item\) !== id\);[\s\S]*?neteaseVisibleSongs = neteaseVisibleSongs\.filter\(item => neteaseNumericId\(item\) !== id\);/,
    "removing a NetEase liked song should update the current liked collections, not just the DOM row"
  );
  assert.match(
    musicHtml,
    /if \(!visibleRows && neteaseResults\) neteaseResults\.innerHTML = '<p class="netease-empty">No liked songs yet\.<\/p>';/,
    "removing the last NetEase liked song should show an empty-state message"
  );
  assert.match(
    musicHtml,
    /const metaLabel = neteaseAccountPanel\?\.querySelector\('\.playlist-detail-meta'\);[\s\S]*?if \(metaLabel\) metaLabel\.textContent = `\$\{visibleRows\} track\$\{visibleRows === 1 \? '' : 's'\}`;/,
    "removing a NetEase liked song should update the liked hero count with the table count"
  );
  assert.match(
    musicHtml,
    /const syncNeteaseCachedLike = \(id, liked\) => \{[\s\S]*?\[neteaseLastSongs, neteaseVisibleSongs\]\.forEach/,
    "NetEase liked changes should update both search and visible song caches"
  );
  assert.match(
    musicHtml,
    /syncNeteaseCachedLike\(id, nextLiked\);[\s\S]*?syncNeteaseCachedLike\(id, !nextLiked\);/,
    "NetEase liked changes should be rolled forward optimistically and rolled back on failure"
  );
  assert.match(
    musicHtml,
    /setNeteaseStatus\(`Logged in[$]\{name\}\.`, true\);[\s\S]*?await ensureNeteaseLikedIds\(true\)\.catch/,
    "NetEase login/status refresh should force-refresh liked ids before relying on row state"
  );
  assert.match(
    musicHtml,
    /neteaseLikedIds = new Set\(\);[\s\S]*?neteaseLikedIdsLoaded = false;[\s\S]*?setNeteaseStatus\('Anonymous mode\. Login may improve availability\.', true\);/,
    "NetEase anonymous status should clear account liked state"
  );
  assert.match(
    musicHtml,
    /<div class="music-sidebar-footer">[\s\S]*?<div class="music-sidebar-account-wrap" id="neteaseSidebarAccountWrap">[\s\S]*?id="neteaseSidebarAvatar" alt="" hidden[\s\S]*?id="neteaseSidebarAvatarFallback"[\s\S]*?id="neteaseSidebarName">&#x672A;&#x767B;&#x5F55;<\/span>[\s\S]*?class="music-sidebar-account-service"[\s\S]*?hidden[\s\S]*?class="material-symbols-outlined music-sidebar-account-chevron"[\s\S]*?hidden[\s\S]*?id="neteaseSidebarAccountMenu" role="menu" hidden/,
    "NetEase account profile should render an always-visible signed-out placeholder in the sidebar footer"
  );
  assert.doesNotMatch(
    musicHtml,
    /<div class="netease-status" id="neteaseStatus">/,
    "NetEase login status should not be shown at the top of the page body"
  );
  assert.match(
    musicHtml,
    /const renderNeteaseSidebarProfile = profile => \{[\s\S]*?neteaseSidebarAccountWrap\.hidden = false;[\s\S]*?if \(!hasProfile\) \{[\s\S]*?neteaseSidebarName\.textContent = '\\u672a\\u767b\\u5f55';[\s\S]*?neteaseSidebarAvatar\.hidden = true;[\s\S]*?neteaseSidebarAvatarFallback\.hidden = false;[\s\S]*?neteaseSidebarName\.textContent = profile\.nickname \|\| 'NetEase Cloud';[\s\S]*?neteaseSidebarAvatar\.src = avatarUrl;/,
    "NetEase status refresh should keep signed-out placeholder visible and update avatar/nickname when logged in"
  );
  assert.match(
    musicHtml,
    /serviceIcon\.hidden = !hasProfile;[\s\S]*?chevron\.hidden = !hasProfile;/,
    "signed-out sidebar account should hide the service icon and expand affordance"
  );
  assert.match(
    musicHtml,
    /setNeteaseStatus\(`Logged in[$]\{name\}\.`, true\);[\s\S]*?renderNeteaseSidebarProfile\(status\.profile\);/,
    "successful NetEase login should populate the sidebar profile"
  );
  assert.match(
    musicHtml,
    /showInitialMusicSource\(\);\s*initializeNeteaseView\(\);/,
    "Music startup should show the first ordered source while still checking NetEase status for the sidebar profile"
  );
  assert.match(
    musicHtml,
    /setNeteaseStatus\('Anonymous mode\. Login may improve availability\.', true\);[\s\S]*?renderNeteaseSidebarProfile\(null\);/,
    "anonymous NetEase status should hide the sidebar profile"
  );
  assert.match(
    musicHtml,
    /let neteaseStatusRequestId = 0;/,
    "NetEase status refresh should track request order"
  );
  assert.match(
    musicHtml,
    /let neteaseLoginRequestId = 0;/,
    "NetEase login should track QR request order"
  );
  assert.match(
    musicHtml,
    /const requestId = \+\+neteaseStatusRequestId;[\s\S]*?const status = await api\.getStatus\(\);[\s\S]*?if \(requestId !== neteaseStatusRequestId\) return;[\s\S]*?await ensureNeteaseLikedIds\(true\)\.catch[\s\S]*?if \(requestId !== neteaseStatusRequestId\) return;/,
    "stale NetEase status refreshes should not overwrite newer login or account state"
  );
  assert.match(
    musicHtml,
    /catch \(error\) \{[\s\S]*?if \(requestId !== neteaseStatusRequestId\) return;[\s\S]*?Unable to check NetEase status\./,
    "stale NetEase status errors should not overwrite newer status text"
  );
  assert.match(
    musicHtml,
    /const loginKey = neteaseLoginKey;[\s\S]*?const result = await api\.loginCheck\(\{ key: loginKey \}\);[\s\S]*?if \(loginKey !== neteaseLoginKey\) return;/,
    "stale NetEase QR polling should not overwrite the current login key state"
  );
  assert.match(
    musicHtml,
    /const requestId = \+\+neteaseLoginRequestId;[\s\S]*?const result = await api\.startLogin\(\);[\s\S]*?if \(requestId !== neteaseLoginRequestId\) return;/,
    "stale NetEase QR creation results should not replace a newer QR"
  );
  assert.match(
    musicHtml,
    /const startNeteaseLoginFlow = async \(\{ force = false \} = \{\}\) => \{[\s\S]*?if \(neteaseLoginInFlight \|\| \(neteaseLoginKey && !force\)\) return;[\s\S]*?if \(now < neteaseLoginCooldownUntil\) \{[\s\S]*?return;[\s\S]*?\}[\s\S]*?if \(force\) \{[\s\S]*?neteaseLoginKey = "";[\s\S]*?\}[\s\S]*?if \(result\?\.code === 406 \|\| result\?\.retryAfter\) \{[\s\S]*?neteaseLoginCooldownUntil = Date\.now\(\) \+ \(Number\(result\.retryAfter\) \|\| 60000\);/,
    "NetEase QR login should guard in-flight requests and cool down after rate limits"
  );
  assert.match(
    musicHtml,
    /catch \(error\) \{[\s\S]*?if \(requestId !== neteaseLoginRequestId\) return;[\s\S]*?Login failed/,
    "stale NetEase QR creation errors should not overwrite a newer login state"
  );
  assert.match(
    musicHtml,
    /finally \{[\s\S]*?if \(requestId === neteaseLoginRequestId\) setNeteaseBusy\(false\);[\s\S]*?\}/,
    "stale NetEase login requests should not clear the busy state for a newer QR"
  );
  assert.match(
    musicHtml,
    /let neteaseSearchRequestId = 0;/,
    "NetEase search should track request order"
  );
  assert.match(
    musicHtml,
    /let neteaseAccountRequestId = 0;/,
    "NetEase account collection loads should track request order"
  );
  assert.match(
    musicHtml,
    /const searchNeteaseSongs = async keyword => \{[\s\S]*?const requestId = \+\+neteaseSearchRequestId;[\s\S]*?const result = await api\.searchSongs\(\{ keyword: query, limit: 30, offset: 0 \}\);[\s\S]*?if \(neteaseActiveView !== 'search' \|\| requestId !== neteaseSearchRequestId\) return false;[\s\S]*?await ensureNeteaseLikedIds\(\)\.catch[\s\S]*?if \(neteaseActiveView !== 'search' \|\| requestId !== neteaseSearchRequestId\) return false;[\s\S]*?renderNeteaseResults\(result\?\.songs \|\| \[\]\);/,
    "NetEase search results should sync liked ids before rendering row state"
  );
  assert.match(
    musicHtml,
    /catch \(error\) \{[\s\S]*?if \(neteaseActiveView !== 'search' \|\| requestId !== neteaseSearchRequestId\) return false;[\s\S]*?Search failed/,
    "stale NetEase search failures should not overwrite a newer active view"
  );
  assert.match(
    musicHtml,
    /finally \{[\s\S]*?if \(requestId === neteaseSearchRequestId\) setNeteaseBusy\(false\);[\s\S]*?\}/,
    "stale NetEase search requests should not clear the busy state for a newer search"
  );
  assert.match(
    musicHtml,
    /const searchNeteaseSongs = async keyword => \{[\s\S]*?const requestId = \+\+neteaseSearchRequestId;[\s\S]*?const result = await api\.searchSongs\(\{ keyword: query, limit: 30, offset: 0 \}\);/,
    "NetEase search should be reusable by both submit and refresh actions"
  );
  assert.match(
    musicHtml,
    /let neteaseLastSearchKeyword = "";/,
    "NetEase search refresh should remember the previous successful search keyword"
  );
  assert.match(
    musicHtml,
    /neteaseLastSearchKeyword = query;[\s\S]*?renderNeteaseResults\(result\?\.songs \|\| \[\]\);/,
    "NetEase search should store the keyword only when a current search result is about to render"
  );
  assert.match(
    musicHtml,
    /const refreshNeteaseCurrentView = async \(\) => \{[\s\S]*?await initializeNeteaseView\(\);[\s\S]*?if \(neteaseActiveView === 'playlists'\) await loadNeteasePlaylists\(\);[\s\S]*?else if \(neteaseActiveView === 'liked'\) await loadNeteaseLiked\(\);[\s\S]*?else if \(neteaseActiveView === 'history'\) await loadNeteaseHistory\(\);[\s\S]*?const didSearch = await searchNeteaseSongs\(neteaseSearchInput\?\.value \|\| neteaseLastSearchKeyword\);[\s\S]*?if \(!didSearch\) refreshLabel = 'NetEase status';/,
    "NetEase refresh should reload the current account/search view after checking status"
  );
  assert.match(
    musicHtml,
    /<div class="netease-auth-gate" id="neteaseAuthGate" hidden>[\s\S]*?id="neteaseQrLoginMode"[\s\S]*?id="neteaseQrImage"[\s\S]*?id="neteaseOtherLoginButton"[\s\S]*?id="neteasePhoneLoginForm"[\s\S]*?id="neteasePhoneInput"[\s\S]*?id="neteaseSendCaptchaButton"[\s\S]*?id="neteaseQrLoginButton"/,
    "NetEase signed-out view should provide QR and phone verification login modes"
  );
  assert.doesNotMatch(
    musicHtml,
    /<header class="music-view-header">[\s\S]*?<h1 class="music-view-title">NetEase Cloud<\/h1>[\s\S]*?Search NetEase Cloud Music and play through Kairos\./,
    "NetEase page should not keep the old top title and status area"
  );
  assert.doesNotMatch(
    musicHtml,
    /id="neteaseRefreshButton"/,
    "NetEase page should not show the old top Refresh button"
  );
  assert.match(
    musicHtml,
    /let refreshLabel = \{ playlists: 'Playlists', liked: 'Liked Songs', history: 'History', search: 'Search' \}\[neteaseActiveView\] \|\| 'NetEase';[\s\S]*?toast\.message\(`[$]\{refreshLabel\} refreshed`\);/,
    "NetEase refresh toast should identify which view was refreshed"
  );
  assert.match(
    musicHtml,
    /neteaseSearchForm\?\.addEventListener\('submit', async event => \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?await searchNeteaseSongs\(neteaseSearchInput\?\.value \|\| ''\);[\s\S]*?\}\);/,
    "NetEase search form should use the same search helper as refresh"
  );
  assert.match(
    musicHtml,
    /const songsResult = await api\.getPlaylistSongs\(\{ neteaseId: playlist\.neteaseId, offset: 0 \}\);[\s\S]*?await ensureNeteaseLikedIds\(\)\.catch[\s\S]*?renderNeteaseSongCollection\(playlist\.name/,
    "NetEase playlist detail rows should sync liked ids before rendering row state"
  );
  assert.match(
    musicHtml,
    /const requestId = \+\+neteaseAccountRequestId;[\s\S]*?const result = await api\.getUserPlaylists\(\{ offset: 0 \}\);[\s\S]*?if \(neteaseActiveView !== 'playlists' \|\| requestId !== neteaseAccountRequestId\) return;/,
    "stale NetEase playlist list responses should not overwrite newer account content"
  );
  assert.match(
    musicHtml,
    /const detailRequestId = \+\+neteaseAccountRequestId;[\s\S]*?const songsResult = await api\.getPlaylistSongs\(\{ neteaseId: playlist\.neteaseId, offset: 0 \}\);[\s\S]*?if \(neteaseActiveView !== 'playlists' \|\| detailRequestId !== neteaseAccountRequestId\) return;[\s\S]*?await ensureNeteaseLikedIds\(\)\.catch[\s\S]*?if \(neteaseActiveView !== 'playlists' \|\| detailRequestId !== neteaseAccountRequestId\) return;/,
    "stale NetEase playlist detail responses should not overwrite a newer selected playlist"
  );
  assert.match(
    musicHtml,
    /catch \(error\) \{[\s\S]*?if \(neteaseActiveView !== 'playlists' \|\| detailRequestId !== neteaseAccountRequestId\) return;[\s\S]*?Unable to load playlist\./,
    "stale NetEase playlist detail errors should not overwrite a newer selected playlist"
  );
  assert.match(
    musicHtml,
    /const result = await api\.getHistory\(\{ type: neteaseHistoryType \}\);[\s\S]*?await ensureNeteaseLikedIds\(\)\.catch[\s\S]*?renderNeteaseSongCollection\('NetEase History'/,
    "NetEase history rows should sync liked ids before rendering row state"
  );
  assert.match(
    musicHtml,
    /const requestId = \+\+neteaseAccountRequestId;[\s\S]*?const result = await api\.getLikedSongs\(\);[\s\S]*?if \(neteaseActiveView !== 'liked' \|\| requestId !== neteaseAccountRequestId\) return;/,
    "stale NetEase liked responses should not overwrite newer account content"
  );
  assert.match(
    musicHtml,
    /const requestId = \+\+neteaseAccountRequestId;[\s\S]*?const result = await api\.getHistory\(\{ type: neteaseHistoryType \}\);[\s\S]*?if \(neteaseActiveView !== 'history' \|\| requestId !== neteaseAccountRequestId\) return;[\s\S]*?await ensureNeteaseLikedIds\(\)\.catch[\s\S]*?if \(neteaseActiveView !== 'history' \|\| requestId !== neteaseAccountRequestId\) return;/,
    "stale NetEase history responses should not overwrite newer account content"
  );
});

test("NetEase collection empty states stay contextual", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/pages/music/index.html"), "utf8");

  assert.match(
    musicHtml,
    /neteaseResults\.innerHTML = `<p class="netease-empty">[$]\{options\.emptyMessage \|\| 'No songs found\.'\}<\/p>`;/,
    "NetEase result rendering should allow collection-specific empty messages"
  );
  assert.match(
    musicHtml,
    /renderNeteaseResults\(songs, \{ remember: false, queueSongs: songs, withFilter: true, showPlayCount: options\.showPlayCount === true, historyType: options\.historyType, emptyMessage: options\.emptyMessage \}\);/,
    "NetEase collection pages should pass their empty message to the shared result table"
  );
  assert.match(
    musicHtml,
    /const playlist = result\.playlist \|\| \{\};[\s\S]*?renderNeteaseSongCollection\(playlist\.name \|\| 'Liked Songs'[\s\S]*?coverUrl: playlist\.coverUrl \|\| ''[\s\S]*?emptyMessage: 'No liked songs yet\.'/,
    "NetEase liked view should render the account red-heart playlist instead of a synthetic liked collection"
  );
  assert.match(
    musicHtml,
    /renderNeteaseSongCollection\('NetEase History'[\s\S]*?historyType: neteaseHistoryType,[\s\S]*?emptyMessage: 'No NetEase listening history yet\.'/,
    "NetEase history should use a history-specific empty state"
  );
  assert.match(
    musicHtml,
    /const result = await api\.getUserPlaylists\(\{ offset: 0 \}\);[\s\S]*?if \(neteaseActiveView !== 'playlists' \|\| requestId !== neteaseAccountRequestId\) return;/,
    "stale NetEase playlist requests should not overwrite a newer active view"
  );
  assert.match(
    musicHtml,
    /const songsResult = await api\.getPlaylistSongs\(\{ neteaseId: playlist\.neteaseId, offset: 0 \}\);[\s\S]*?if \(neteaseActiveView !== 'playlists' \|\| detailRequestId !== neteaseAccountRequestId\) return;/,
    "stale NetEase playlist detail requests should not overwrite a newer active view"
  );
  assert.match(
    musicHtml,
    /const result = await api\.getLikedSongs\(\);[\s\S]*?if \(neteaseActiveView !== 'liked' \|\| requestId !== neteaseAccountRequestId\) return;/,
    "stale NetEase liked requests should not overwrite a newer active view"
  );
  assert.match(
    musicHtml,
    /const result = await api\.getHistory\(\{ type: neteaseHistoryType \}\);[\s\S]*?if \(neteaseActiveView !== 'history' \|\| requestId !== neteaseAccountRequestId\) return;/,
    "stale NetEase history requests should not overwrite a newer active view"
  );
});

test("NetEase history row menu follows history layout", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/pages/music/index.html"), "utf8");

  assert.match(
    musicHtml,
    /let neteaseHistoryType = 1;/,
    "NetEase history should default to the API weekly record type"
  );
  assert.match(
    musicHtml,
    /data-history-type="1"[\s\S]*?最近一周[\s\S]*?data-history-type="0"[\s\S]*?所有时间/,
    "NetEase history should expose API range buttons for weekly and all-time records"
  );
  assert.match(
    musicHtml,
    /\.netease-history-tabs\{position:relative;display:inline-flex[\s\S]*?border:0;background:transparent/,
    "NetEase history range tabs should sit on the table border without a pill container"
  );
  assert.match(
    musicHtml,
    /body\[data-page="music"\] \.netease-history-tabs button\.netease-history-tab:hover:not\(\.kairos-create\):not\(\.habit-primary\):not\(\.play\):not\(\.send\)[\s\S]*?background-color:transparent!important[\s\S]*?box-shadow:none!important/,
    "NetEase history range tabs should override the global button hover background"
  );
  assert.match(
    musicHtml,
    /<span class="netease-history-indicator" aria-hidden="true"><\/span>[\s\S]*?const positionHistoryIndicator = \(\) => \{[\s\S]*?indicator\.style\.width = `\$\{active\.offsetWidth\}px`;[\s\S]*?indicator\.style\.transform = `translateX\(\$\{active\.offsetLeft\}px\)`;/,
    "NetEase history range tabs should share a smoothly moving underline indicator"
  );
  assert.match(
    musicHtml,
    /const nextType = Number\(button\.dataset\.historyType\);[\s\S]*?neteaseHistoryType = nextType;[\s\S]*?loadNeteaseHistory\(nextType\);/,
    "NetEase history range buttons should reload through the API type parameter"
  );
  assert.match(
    musicHtml,
    /const rowMenuHtml = options\.showPlayCount[\s\S]*?\? `<span class="track-row-menu-wrap">[\s\S]*?data-action="play-next"[\s\S]*?Play Next[\s\S]*?<\/span><\/span>`[\s\S]*?: `<span class="track-row-menu-wrap">[\s\S]*?data-action="add-queue"[\s\S]*?data-action="like"/,
    "NetEase history rows should use a history-specific menu instead of the full song action menu"
  );
  assert.doesNotMatch(
    musicHtml,
    /options\.showPlayCount\s*\?\s*`(?:(?!`\s*:)[\s\S])*data-action="add-queue"/,
    "NetEase history row menu should not include Add to Queue because Play Next already matches local History behavior"
  );
});

test("music controls suppress global hover backgrounds", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/pages/music/index.html"), "utf8");
  const playerCss = await fs.readFile(path.join(root, "app/shell/player/music-player.css"), "utf8");

  assert.match(
    musicHtml,
    /body\[data-page="music"\] \.playlist-detail-table button\.track-play-button:hover:not\(\.kairos-create\):not\(\.habit-primary\):not\(\.play\):not\(\.send\)[\s\S]*?background-color:transparent!important[\s\S]*?box-shadow:none!important/,
    "track play buttons should override the global button hover background"
  );
  assert.match(
    musicHtml,
    /body\[data-page="music"\] \.playlist-detail-table button\.track-play-button:hover:not\(\.kairos-create\):not\(\.habit-primary\):not\(\.play\):not\(\.send\),[\s\S]*?button\.track-play-button:focus-visible:not[\s\S]*?transform:translate\(-50%,-50%\) scale\(1\)!important/,
    "track play buttons should preserve their centered transform while suppressing hover effects"
  );
  assert.match(
    musicHtml,
    /body\[data-page="music"\] button\.track-like-button:hover:not\(\.kairos-create\):not\(\.habit-primary\):not\(\.play\):not\(\.send\)[\s\S]*?background-color:transparent!important[\s\S]*?box-shadow:none!important/,
    "like buttons should override the global button hover background"
  );
  assert.match(
    musicHtml,
    /body\[data-page="music"\] button\.track-row-menu-trigger:hover:not\(\.kairos-create\):not\(\.habit-primary\):not\(\.play\):not\(\.send\)[\s\S]*?background-color:transparent!important[\s\S]*?box-shadow:none!important/,
    "row more buttons should override the global button hover background"
  );
  assert.match(
    playerCss,
    /#musicToggle:hover \{[\s\S]*?box-shadow: none !important/,
    "main player play button should not add a hover shadow"
  );
  assert.match(
    playerCss,
    /#musicPlayer \.music-playlist-panel header button:hover,[\s\S]*?#musicPlayer \.music-track-remove:focus-visible \{[\s\S]*?background-color: transparent !important;[\s\S]*?box-shadow: none !important/,
    "queue clear and remove buttons should suppress hover background and shadow"
  );
});

test("NetEase sidebar source can collapse after opening", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/pages/music/index.html"), "utf8");

  assert.match(
    musicHtml,
    /if \(button\.dataset\.source === 'netease'\) \{[\s\S]*?const submenu = button\.closest\('\.music-submenu'\);[\s\S]*?if \(submenu\?\.dataset\.state !== 'open'\) \{[\s\S]*?button\.setAttribute\('aria-expanded', 'false'\);[\s\S]*?return;[\s\S]*?\}[\s\S]*?showNeteaseSection\(neteaseActiveView \|\| 'search'\);/,
    "NetEase source click should respect the submenu toggle's closed state instead of forcing it open"
  );
});

test("NetEase sidebar uses bundled app icon", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/pages/music/index.html"), "utf8");
  const icon = await fs.stat(path.join(root, "app/assets/icons/netease-format.ico"));

  assert.ok(icon.isFile(), "NetEase sidebar icon should be bundled with app assets");
  assert.match(
    musicHtml,
    /<img class="music-item-icon-img" src="\.\.\/\.\.\/assets\/icons\/netease-format\.ico" alt="" aria-hidden="true">[\s\S]*?<span>Netease Music<\/span>/,
    "Netease Music sidebar entry should render the bundled ico instead of the generic cloud icon"
  );
});

test("NetEase sidebar labels use requested copy", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/pages/music/index.html"), "utf8");

  assert.match(
    musicHtml,
    /<span>Netease Music<\/span>[\s\S]*?data-netease-view="playlists"[\s\S]*?<span>Playlist<\/span>[\s\S]*?data-netease-view="liked"[\s\S]*?<span>Like<\/span>/,
    "NetEase sidebar labels should read Netease Music, Playlist, and Like"
  );
});

test("NetEase sidebar account menu can log out", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/pages/music/index.html"), "utf8");
  const preload = await fs.readFile(path.join(root, "electron/preload/index.cjs"), "utf8");
  const main = await fs.readFile(path.join(root, "electron/main/index.js"), "utf8");
  const service = await fs.readFile(path.join(root, "electron/services/music/netease-api-service.js"), "utf8");

  assert.match(preload, /logout: \(\) => ipcRenderer\.invoke\("netease:logout"\)/, "preload should expose NetEase logout");
  assert.match(preload, /sendCaptcha: \(input\) => ipcRenderer\.invoke\("netease:send-captcha", input\)/, "preload should expose NetEase captcha sending");
  assert.match(preload, /loginWithPhone: \(input\) => ipcRenderer\.invoke\("netease:login-with-phone", input\)/, "preload should expose NetEase phone login");
  assert.match(preload, /openVerification: \(url\) => ipcRenderer\.invoke\("netease:open-verification", url\)/, "preload should expose NetEase verification links");
  assert.doesNotMatch(preload, /switchAccount|netease:switch-account/, "preload should not expose removed account switching");
  assert.match(main, /ipcMain\.handle\("netease:logout",\(\)=>neteaseService\.logout\(\)\);/, "main should register NetEase logout");
  assert.doesNotMatch(main, /netease:switch-account|switchAccount/, "main should not register removed account switching");
  assert.match(main, /ipcMain\.handle\("netease:send-captcha",\(_event,input\)=>neteaseService\.sendCaptcha\(input\)\);/, "main should register NetEase captcha sending");
  assert.match(main, /ipcMain\.handle\("netease:login-with-phone",\(_event,input\)=>neteaseService\.loginWithPhone\(input\)\);/, "main should register NetEase phone login");
  assert.match(main, /ipcMain\.handle\("netease:open-verification"[\s\S]*?shell\.openExternal\(target\)/, "main should open NetEase verification links through Electron shell");
  assert.match(service, /function neteaseFailure\(error, fallback\) \{[\s\S]*?needsVerification: Number\(code\) === 10004 \|\| Number\(code\) === 10003,[\s\S]*?retryAfter: Number\(code\) === 406 \? 60000 : 0/, "service should convert NetEase failures into normal UI responses");
  assert.match(service, /export function readableNeteasePlaybackMessage\(data = \{\}, fallback = ""\)[\s\S]*?requires NetEase membership or purchase[\s\S]*?restricted by NetEase rights[\s\S]*?unavailable on NetEase/, "service should provide readable playback failure messages");
  assert.match(service, /async playSong\(\{ id, neteaseId, level = DEFAULT_LEVEL \} = \{\}\) \{[\s\S]*?try \{[\s\S]*?readableNeteasePlaybackMessage\(urlData, "No playable URL returned for this song\."\)[\s\S]*?catch \(error\) \{[\s\S]*?return neteaseFailure\(error, "Unable to load playable NetEase URL\."\);/, "service should return readable NetEase playback failures instead of throwing raw API errors");
  assert.match(service, /async function withSuppressedNeteaseErrors\(task\)[\s\S]*?if \(args\[0\] === "\[ERR\]"\) return;/, "service should suppress noisy NetEase API internal error logs");
  assert.doesNotMatch(service, /\?{4,}/, "service should not contain question-mark fallback messages");
  assert.match(service, /async sendCaptcha\(\{ phone, countrycode = "86" \} = \{\}\) \{[\s\S]*?neteaseApi\.captcha_sent\(\{ phone: targetPhone, ctcode:/, "service should send NetEase SMS captcha");
  assert.match(service, /async loginWithPhone\(\{ phone, captcha, countrycode = "86" \} = \{\}\) \{[\s\S]*?neteaseApi\.login_cellphone\(\{[\s\S]*?captcha: targetCaptcha,[\s\S]*?this\.cookie = body\.cookie;[\s\S]*?catch \(error\) \{[\s\S]*?return neteaseFailure\(error, "Phone login failed\."\);/, "service should login with phone captcha and return readable failures");
  assert.doesNotMatch(service, /this\.accounts|rememberAccount|switchAccount/, "service should not keep removed account switching state");
  assert.match(service, /async logout\(\) \{[\s\S]*?this\.cookie = "";[\s\S]*?this\.loginKey = "";[\s\S]*?await this\.save\(\);/, "logout should clear saved NetEase session state");
  assert.match(
    musicHtml,
    /neteaseSidebarAccount\?\.addEventListener\('click'[\s\S]*?if \(neteaseSidebarAccount\.disabled\) return;[\s\S]*?neteaseSidebarAccountMenu\.hidden = !next;[\s\S]*?neteaseSidebarAccount\.setAttribute\('aria-expanded', String\(next\)\);/,
    "sidebar account button should toggle its menu"
  );
  assert.match(
    musicHtml,
    /id="neteaseSidebarAccountMenu" role="menu" hidden>[\s\S]*?data-action="logout"[\s\S]*?Log Out[\s\S]*?neteaseSidebarAccountMenu\?\.addEventListener\('click'[\s\S]*?if \(button\.dataset\.action === 'logout'\) \{[\s\S]*?await api\?\.logout\?\.\(\);[\s\S]*?resetNeteaseSessionUi\(\);[\s\S]*?toast\.message\('Logged out'\);/,
    "account menu should directly show only logout"
  );
  assert.doesNotMatch(musicHtml, /renderNeteaseAccountMenu|data-action="account"|data-action="new-login"|switchAccount/, "account switching UI should be removed");
  assert.match(
    musicHtml,
    /neteaseLoginButton\?\.addEventListener\('click', \(\) => startNeteaseLoginFlow\(\{ force: true \}\)\);[\s\S]*?neteaseOtherLoginButton\?\.addEventListener\('click', \(\) => setNeteaseLoginMode\('phone'\)\);[\s\S]*?neteaseSendCaptchaButton\?\.addEventListener\('click', async \(\) => \{[\s\S]*?api\.sendCaptcha\(\{ phone, countrycode: '86' \}\);[\s\S]*?neteasePhoneLoginForm\?\.addEventListener\('submit', async event => \{[\s\S]*?api\.loginWithPhone\(\{ phone, captcha, countrycode: '86' \}\);/,
    "NetEase login UI should switch to phone mode, send captcha, and submit phone login"
  );
  assert.match(
    musicHtml,
    /id="neteaseVerificationPanel" hidden[\s\S]*?id="neteaseVerificationButton"[\s\S]*?const setNeteaseVerification = \(result = null\) => \{[\s\S]*?needsVerification[\s\S]*?neteaseVerificationButton\?\.addEventListener\('click', async \(\) => \{[\s\S]*?api\.openVerification\(neteaseVerificationUrl\);/,
    "phone login should show and open NetEase security verification links"
  );
  assert.match(
    musicHtml,
    /body\[data-page="music"\] button\.music-sidebar-account:hover:not\(\.kairos-create\):not\(\.habit-primary\):not\(\.play\):not\(\.send\)[\s\S]*?background-color: transparent!important;[\s\S]*?box-shadow: none!important/,
    "sidebar account button should suppress the global button hover shadow"
  );
  assert.match(
    musicHtml,
    /\.netease-phone-form\{display:grid!important;justify-items:stretch!important;[\s\S]*?\.netease-phone-submit\{width:100%;height:36px/,
    "phone login form should stretch the submit button instead of centering it as a small pill"
  );
});

test("NetEase search page renders daily recommendations and hot playlists", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/pages/music/index.html"), "utf8");
  const preload = await fs.readFile(path.join(root, "electron/preload/index.cjs"), "utf8");
  const main = await fs.readFile(path.join(root, "electron/main/index.js"), "utf8");
  const service = await fs.readFile(path.join(root, "electron/services/music/netease-api-service.js"), "utf8");

  assert.match(preload, /getSearchHome: \(input\) => ipcRenderer\.invoke\("netease:get-search-home", input\)/, "preload should expose NetEase search home");
  assert.match(main, /ipcMain\.handle\("netease:get-search-home",\(_event,input\)=>neteaseService\.getSearchHome\(input\)\);/, "main should register NetEase search home");
  assert.match(service, /async getSearchHome\(\{ songLimit = 10, playlistLimit = 8 \} = \{\}\) \{[\s\S]*?neteaseApi\.recommend_songs[\s\S]*?neteaseApi\.personalized[\s\S]*?dailySongs[\s\S]*?hotPlaylists/, "service should load daily songs and hot playlists");
  assert.doesNotMatch(service, /savedPlaylistIds/, "search home should not infer playlist collection by comparing saved playlist ids");
  assert.match(service, /function playlistSubscribedState\(body = \{\}\) \{[\s\S]*?source\.subscribed === true[\s\S]*?source\.isSubscribed === true[\s\S]*?source\.subscribedPlaylist === true[\s\S]*?source\.playlist\?\.subscribed === true/, "playlist detail should read subscribed state from NetEase dynamic playlist API fields");
  assert.match(service, /playlist_detail_dynamic\(this\.withCookie\(\{ id: playlistId \}\)\)[\s\S]*?subscribed: playlistSubscribedState\(detailResult\?\.body \|\| \{\}\)/, "playlist detail should return the API subscribed state to the renderer");
  assert.match(service, /async setPlaylistSubscribed\(\{ id, neteaseId, subscribed = true \} = \{\}\) \{[\s\S]*?const input = \{[\s\S]*?t: subscribed \? 1 : 2[\s\S]*?neteaseApi\.playlist_subscribe\(this\.withCookie\(input\)\)/, "playlist collection should use the NetEase playlist subscribe API");
  assert.match(service, /Number\(parsed\.code\) !== 406[\s\S]*?playlist_subscribe\(this\.withCookie\(\{ \.\.\.input, crypto: "weapi" \}\)\)/, "playlist collection should retry through weapi when NetEase rejects the eapi route as too frequent");
  assert.match(preload, /setPlaylistSubscribed: \(input\) => ipcRenderer\.invoke\("netease:set-playlist-subscribed", input\)/, "preload should expose playlist collection");
  assert.match(main, /ipcMain\.handle\("netease:set-playlist-subscribed",\(_event,input\)=>neteaseService\.setPlaylistSubscribed\(input\)\);/, "main should register playlist collection");
  assert.match(musicHtml, /\.netease-search-home\{display:grid;gap:28px/, "search home should have dedicated layout styles");
  assert.match(
    musicHtml,
    /const loadNeteaseSearchHome = async \(\{ force = false \} = \{\}\) => \{[\s\S]*?api\.getSearchHome\(\{ songLimit: 8, playlistLimit: 8 \}\);[\s\S]*?Daily Recommended Songs[\s\S]*?createNeteaseHomeSongTable\(dailySongs\)[\s\S]*?Hot Playlists[\s\S]*?makeNeteasePlaylistCard\(playlist, 'search-home'\)/,
    "search home should render daily songs and hot playlist cards"
  );
  assert.match(
    musicHtml,
    /const createNeteaseHomeSongTable = songs => \{[\s\S]*?table\.className = 'playlist-detail-table netease-results netease-home-table';[\s\S]*?track-like-button[\s\S]*?track-row-menu-trigger/,
    "daily recommendations should reuse the playlist song row styling and controls"
  );
  assert.match(
    musicHtml,
    /const showNeteaseSearchBack = \(\) => \{[\s\S]*?playlist-detail-back[\s\S]*?loadNeteaseSearchHome\(\{ force: true \}\);/,
    "search results should provide a back button to the recommendation home"
  );
  assert.match(
    musicHtml,
    /playlist-subscribe-button[\s\S]*?toggleNeteasePlaylistSubscribed\(options\.playlist, subscribeButton\)/,
    "NetEase playlist detail should show a save or unsave button next to Play All"
  );
  assert.match(
    musicHtml,
    /const openNeteasePlaylistDetail = async[\s\S]*?playlist\.subscribed = playlist\.subscribed === true \|\| songsResult\.subscribed === true;[\s\S]*?renderNeteaseSongCollection\(playlist\.name[\s\S]*?playlist/,
    "playlist detail should preserve API-confirmed collection state and allow dynamic detail to mark saved playlists"
  );
  assert.match(
    musicHtml,
    /if \(neteaseSearchHomeLoaded && !force && neteaseResults\.querySelector\('\.netease-search-home'\)\) return;/,
    "returning to Search should only skip loading when the recommendation home still exists in the DOM"
  );
  assert.match(
    musicHtml,
    /if \(view === 'search'\) \{[\s\S]*?if \(!neteaseLastSongs\.length\) loadNeteaseSearchHome\(\);[\s\S]*?else renderNeteaseResults\(neteaseLastSongs\);/,
    "opening the Search tab should load the recommendation home before any search results"
  );
  assert.match(
    musicHtml,
    /if \(!query\) \{[\s\S]*?await loadNeteaseSearchHome\(\{ force: true \}\);[\s\S]*?return true;[\s\S]*?\}/,
    "submitting an empty Search query should return to the recommendation home"
  );
});

test("shared player exposes liked control for current local and NetEase tracks", async () => {
  const playerJs = await fs.readFile(path.join(root, "app/shell/player/music-player.js"), "utf8");
  const playerCss = await fs.readFile(path.join(root, "app/shell/player/music-player.css"), "utf8");

  assert.match(playerJs, /id="musicLike"[\s\S]*?aria-pressed="false"/, "shared player should render a current-song liked button");
  assert.match(playerJs, /const syncLikeButton = \(\) => \{[\s\S]*?els\.like\.setAttribute\('aria-pressed', String\(liked\)\);/, "liked button should mirror the active track");
  assert.match(playerJs, /if\(isNeteaseId\(track\.id\)\)\{[\s\S]*?setSongLiked\?\.\(\{id:track\.id,neteaseId:track\.neteaseId,liked:nextLiked\}\)/, "NetEase player likes should call the NetEase like API");
  assert.match(playerJs, /updateTrack\?\.\(\{id:track\.id,liked:nextLiked\}\)/, "local player likes should call the local music library");
  assert.match(playerCss, /\.music-like-button\[aria-pressed="true"\][\s\S]*?color: #ff4761/, "liked player button should become red when active");
});
test("NetEase Play All skips unavailable leading songs", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/pages/music/index.html"), "utf8");

  assert.match(
    musicHtml,
    /const playNeteaseCollection = async songs => \{[\s\S]*?for \(const song of candidates\) \{[\s\S]*?await playNeteaseTrack\(song, songs, \{ forceSequence: true \}\);/,
    "NetEase Play All should try each song instead of failing only because the first song is unavailable"
  );
  assert.match(
    musicHtml,
    /if \(!options\.forceSequence && snapshot\.currentTrackId === song\.id && snapshot\.playing === true\)[\s\S]*?if \(!options\.forceSequence && snapshot\.currentTrackId === song\.id && snapshot\.playing === false\)/,
    "NetEase Play All should bypass single-row pause/resume toggles so it can rebuild the full collection queue"
  );
  assert.match(
    musicHtml,
    /throw lastError \|\| new Error\('No playable songs in this collection\.'\);/,
    "NetEase Play All should only fail after every candidate is unavailable"
  );
});

test("NetEase row playback builds a full visible queue like local playlists", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/pages/music/index.html"), "utf8");

  assert.match(
    musicHtml,
    /const localPlaybackDetail = detail => \(\{[\s\S]*?tracks: musicState\.tracks \|\| \[\],[\s\S]*?\.\.\.detail[\s\S]*?\}\);/,
    "local queue notifications should carry local track metadata when replacing an online queue"
  );
  assert.match(
    musicHtml,
    /const localLibrarySyncDetail = \(detail = \{\}\) => \{[\s\S]*?const snapshot = getPlayerSnapshot\(\);[\s\S]*?if \(String\(snapshot\.currentTrackId \|\| ''\)\.startsWith\('netease:'\)\) return localPlaybackDetail\(detail\);[\s\S]*?queueTrackIds: musicState\.queueTrackIds \|\| \[\],[\s\S]*?currentTrackId: musicState\.currentTrackId \|\| null,[\s\S]*?playing: musicState\.playing === true,[\s\S]*?\.\.\.detail[\s\S]*?\}\);[\s\S]*?\};/,
    "local library metadata sync should not replace an active NetEase queue with stale local playback state"
  );
  assert.doesNotMatch(
    musicHtml,
    /notifyMusicPlayer\(\);/,
    "local metadata changes should not trigger an unscoped shared player refresh"
  );
  assert.match(
    musicHtml,
    /const getVisiblePlaylistTrackIds = \(\) => \{[\s\S]*?querySelectorAll\('tr\[data-track-id\]'\)[\s\S]*?model\.tracks\.find\(track => track\.id === id\)\?\.available !== false[\s\S]*?return visibleIds\.length \? visibleIds : model\.tracks\.filter\(track => track\.available !== false\)\.map\(track => track\.id\);[\s\S]*?\};/,
    "local playlist row playback should derive its queue from visible playable rows and skip missing files"
  );
  assert.match(
    musicHtml,
    /const queueTrackIds = \(options\.queueTrackIds \|\| getVisiblePlaylistTrackIds\(\)\)\.filter\(id => model\.tracks\.find\(track => track\.id === id\)\?\.available !== false\);[\s\S]*?notifyMusicPlayer\(localPlaybackDetail\(\{ queueTrackIds, currentTrackId: target\.id, playing: true/,
    "local playlist row playback should use visible queue ids and include local metadata for the shared player"
  );
  assert.match(
    musicHtml,
    /const playable = model\.tracks\.filter\(track => track\.available !== false\);[\s\S]*?playPlaylistTrack\(first\.id, \{ forceSequence: true, queueTrackIds: playable\.map\(track => track\.id\) \}\);/,
    "local playlist Play All should keep using the full playable playlist queue even when the table is filtered"
  );
  assert.match(
    musicHtml,
    /const getVisibleHistoryTrackIds = tracks => \{[\s\S]*?querySelectorAll\('\.history-row\[data-track-id\]'\)[\s\S]*?\.filter\(row => !row\.hidden\)[\s\S]*?return visibleIds\.length \? visibleIds : sourceIds;[\s\S]*?\};/,
    "local history row playback should derive its queue from the currently visible filtered rows"
  );
  assert.match(
    musicHtml,
    /const queueTrackIds = getVisibleHistoryTrackIds\(tracks\);[\s\S]*?notifyMusicPlayer\(localPlaybackDetail\(\{ queueTrackIds, currentTrackId: target\.id, playing: true, mode: 'sequence' \}\)\);/,
    "local history playback should use visible queue ids and include local metadata for the shared player"
  );
  assert.match(
    musicHtml,
    /const addSelectedTracksToQueue = async \(\) => \{[\s\S]*?notifyMusicPlayer\(localPlaybackDetail\(\{ queueTrackIds: musicState\.queueTrackIds \|\| \[\], currentTrackId: musicState\.currentTrackId \|\| null, playing: musicState\.playing === true \}\)\);/,
    "local multi-select Add to Queue should include local metadata for the shared player"
  );
  assert.match(
    musicHtml,
    /const addTrackToPlayNext = async track => \{[\s\S]*?notifyMusicPlayer\(localPlaybackDetail\(\{[\s\S]*?queueTrackIds: musicState\.queueTrackIds \|\| \[\],[\s\S]*?currentTrackId: musicState\.currentTrackId \|\| null,[\s\S]*?playing: musicState\.playing === true[\s\S]*?\}\)\);/,
    "local Play Next should include local metadata for the shared player"
  );
  assert.match(
    musicHtml,
    /const getVisibleNeteaseQueueSongs = fallbackSongs => \{[\s\S]*?querySelectorAll\('tbody tr\[data-id\]'\)[\s\S]*?\.filter\(row => !row\.hidden\)[\s\S]*?return visibleSongs\.length \? visibleSongs : source;[\s\S]*?\};/,
    "NetEase row playback should derive its queue from the currently visible filtered rows"
  );
  assert.match(
    musicHtml,
    /const queueSongs = options\.queueSongs \|\| songs;[\s\S]*?await playNeteaseTrack\(song, getVisibleNeteaseQueueSongs\(queueSongs\)\);/,
    "clicking a NetEase row should play that song while keeping the current visible result set as the queue"
  );
  assert.match(
    musicHtml,
    /const playNeteaseTrack = async \(song, queueSongs = \[\], options = \{\}\) => \{[\s\S]*?mode: options\.forceSequence \? 'sequence' : snapshot\.mode \|\| 'sequence'/,
    "NetEase row playback should preserve the current playback mode unless Play All explicitly resets it"
  );
  assert.match(
    musicHtml,
    /renderNeteaseResults\(songs, \{ remember: false, queueSongs: songs, withFilter: true, showPlayCount: options\.showPlayCount === true, historyType: options\.historyType, emptyMessage: options\.emptyMessage \}\);/,
    "NetEase account collections should pass their full song list into the same row playback queue path"
  );
  assert.match(
    musicHtml,
    /const queueSource = \(queueSongs\?\.length \? queueSongs : \[song\]\)\.filter\(item => item\?\.id\);[\s\S]*?const queueTrackIds = tracks\.map\(item => item\.id\);[\s\S]*?currentTrackId: track\.id/,
    "the shared player payload should include the full NetEase queue while starting at the clicked track"
  );
});

test("shared player skips unavailable NetEase songs while advancing the queue", async () => {
  const playerScript = await fs.readFile(path.join(root, "app/shell/player/music-player.js"), "utf8");

  assert.match(
    playerScript,
    /const adjacentCandidates = direction => \{[\s\S]*?return ordered\.map\(track=>track\.id\);[\s\S]*?\};/,
    "shared player should calculate a finite candidate list before advancing"
  );
  assert.doesNotMatch(
    playerScript,
    /const nextId =/,
    "shared player should not keep the old single-id advance helper that bypasses skip-aware queue traversal"
  );
  assert.match(
    playerScript,
    /async function playAdjacentTrack\(direction=1\)\{[\s\S]*?for\(const id of adjacentCandidates\(direction\)\)\{[\s\S]*?const ok=await playTrack\(id,true,\{silentFailure:true\}\);[\s\S]*?if\(skipped\) toast\('message','Skipped unavailable songs'/,
    "shared player should keep trying later queue items when a NetEase track cannot be played"
  );
  assert.match(
    playerScript,
    /const silentFailure = options\.silentFailure === true;[\s\S]*?if\(!silentFailure\) toast\('error','Unable to refresh NetEase URL'\);[\s\S]*?catch\(error\)\{[\s\S]*?const message=playbackErrorText\(error\);[\s\S]*?if\(!silentFailure\) toast\('error',message\);/,
    "skip-aware queue advance should suppress per-track failure toasts while preserving source-aware normal errors"
  );
  assert.match(
    playerScript,
    /state\.playing=false;[\s\S]*?syncPlayButton\(\);[\s\S]*?updateQueuePlaybackState\(\);[\s\S]*?if\(skipped\) toast\('error','No playable songs left'/,
    "shared player should clear the playing state when every remaining queue candidate is unavailable"
  );
  assert.match(
    playerScript,
    /els\.audio\.onended=\(\)=>\{ playAdjacentTrack\(1\); \};/,
    "automatic track end should use the same skip-aware queue advance path"
  );
});

test("shared player queue removal preserves playback continuity", async () => {
  const playerScript = await fs.readFile(path.join(root, "app/shell/player/music-player.js"), "utf8");

  assert.match(
    playerScript,
    /const removedCurrent=state\.currentTrackId===track\.id;[\s\S]*?const nextPlaying=Boolean\(nextCurrent\)&&state\.playing===true;[\s\S]*?loadTrack\(false\); await continueQueuePlayback\(removedCurrent&&nextPlaying\); emitState\(\);/,
    "removing a non-current queue item should preserve playing state, while removing the current item should continue playback with the next queued song"
  );
  assert.match(
    playerScript,
    /async function continueQueuePlayback\(shouldPlay\)\{[\s\S]*?await playLoadedAudio\(\);[\s\S]*?state\.playing=false;[\s\S]*?updateQueuePlaybackState\(\);/,
    "queue playback continuity should use the same playable URL refresh and error handling path as normal playback"
  );
  assert.match(
    playerScript,
    /els\.clear\.onclick=async\(\)=>\{[\s\S]*?suppressPausePersist=true; els\.audio\.pause\(\); suppressPausePersist=false;[\s\S]*?queueTrackIds:\[\],currentTrackId:null,playing:false/,
    "clearing the queue should explicitly stop audio without leaking a stale pause state into persistence"
  );
});

test("shared player queue item click targets share play pause behavior", async () => {
  const playerScript = await fs.readFile(path.join(root, "app/shell/player/music-player.js"), "utf8");

  assert.match(
    playerScript,
    /async function toggleQueueTrack\(id\)\{[\s\S]*?if \(id===state\.currentTrackId && !els\.audio\.paused\) \{ els\.audio\.pause\(\); return; \}[\s\S]*?await playTrack\(id,true\);[\s\S]*?\}/,
    "queue item toggle should pause the current playing track and play other tracks"
  );
  assert.match(
    playerScript,
    /play\.onclick=e=>\{ e\.stopPropagation\(\); toggleQueueTrack\(track\.id\); \};/,
    "queue cover play button should use the shared queue toggle behavior"
  );
  assert.match(
    playerScript,
    /main\.onclick=\(\)=>toggleQueueTrack\(track\.id\);/,
    "queue title area should use the same play pause behavior as the cover play button"
  );
});

test("shared player queue reorder stays local-persistent only for local queues", async () => {
  const playerScript = await fs.readFile(path.join(root, "app/shell/player/music-player.js"), "utf8");

  assert.match(
    playerScript,
    /async function persistQueueOrderFromDom\(\)\{[\s\S]*?state=\{\.\.\.state,queueTrackIds:nextQueue,currentTrackId:nextQueue\.includes\(state\.currentTrackId\)\?state\.currentTrackId:nextQueue\[0\]\|\|null\};[\s\S]*?if\(api&&!hasNeteaseQueue\(\)\) state=await api\.updatePlayback/,
    "queue drag reorder should update the in-memory shared player queue but only persist local queues"
  );
  assert.match(
    playerScript,
    /els\.playlist\.addEventListener\('dragend',async\(\)=>\{[\s\S]*?if\(hadDrag\) await persistQueueOrderFromDom\(\);/,
    "queue dragend should route all reorder persistence through the source-aware queue order helper"
  );
});

test("shared player queue empty state is source-neutral", async () => {
  const playerScript = await fs.readFile(path.join(root, "app/shell/player/music-player.js"), "utf8");

  assert.match(
    playerScript,
    /e\.textContent='Queue is empty';/,
    "shared player should not describe an empty NetEase queue as a missing local import"
  );
  assert.match(
    playerScript,
    /<button aria-label="Queue" class="music-playlist-button" id="musicPlaylistToggle" type="button">/,
    "shared player queue toggle should use the same queue terminology as the queue panel"
  );
  assert.doesNotMatch(
    playerScript,
    /aria-label="Playlist" class="music-playlist-button"/,
    "shared player queue toggle should not expose old playlist terminology"
  );
  assert.doesNotMatch(
    playerScript,
    /No music imported yet/,
    "shared player queue empty copy should stay neutral across local and online sources"
  );
  assert.match(
    playerScript,
    /toast\('success','Queue cleared'\);/,
    "clearing the shared player should describe the action as a queue operation"
  );
  assert.doesNotMatch(
    playerScript,
    /Playlist cleared/,
    "shared player copy should not imply that clearing the queue removed a playlist"
  );
});

test("shared player artist fallback respects local and NetEase sources", async () => {
  const playerScript = await fs.readFile(path.join(root, "app/shell/player/music-player.js"), "utf8");

  assert.match(
    playerScript,
    /const artistFallback = track => isNeteaseId\(track\?\.id\) \? 'NetEase Cloud' : 'Local music';/,
    "shared player should choose fallback artist text from the active track source"
  );
  assert.match(
    playerScript,
    /main\.querySelector\('\.music-track-subtitle'\)\.textContent=clean\(track\.artist\)\|\|artistFallback\(track\);/,
    "queue rows should not show Local music for NetEase songs with missing artist metadata"
  );
  assert.match(
    playerScript,
    /artist\.textContent=clean\(track\?\.artist\)\|\|artistFallback\(track\);/,
    "queue drag previews should use the same source-aware artist fallback"
  );
  assert.match(
    playerScript,
    /els\.artist\.textContent=clean\(t\.artist\)\|\|artistFallback\(t\);/,
    "the main shared player artist label should use the same source-aware fallback"
  );
});

test("NetEase first-play notification retries past shell player fallback mount", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/pages/music/index.html"), "utf8");
  const shellScript = await fs.readFile(path.join(root, "app/shell/navigation/stitch-shell.js"), "utf8");

  assert.match(
    shellScript,
    /\[120, 360, 800, 1500\]\.forEach\(delay => setTimeout\(ensureShellPlayer, delay\)\)/,
    "shell should keep a delayed player mount fallback for Music routing"
  );
  assert.match(
    musicHtml,
    /\[40, 120, 260, 520, 900, 1500, 2200\]\.forEach\(\(delay, index, attempts\) => \{/,
    "NetEase direct playback notifications should retry longer than the shell fallback mount window"
  );
});

test("NetEase account song collections are not capped to tiny preview slices", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/pages/music/index.html"), "utf8");
  const neteaseService = await fs.readFile(path.join(root, "electron/services/music/netease-api-service.js"), "utf8");

  assert.match(
    musicHtml,
    /getUserPlaylists\(\{\s*offset:\s*0\s*\}\)/,
    "NetEase account playlist view should not hard-code a 50-playlist preview limit"
  );
  assert.match(
    neteaseService,
    /const MAX_ACCOUNT_PLAYLISTS = 500;[\s\S]*?async getUserPlaylists\(\{ limit = 0, offset = 0 \} = \{\}\)[\s\S]*?while \(playlists\.length < \(targetLimit \|\| MAX_ACCOUNT_PLAYLISTS\)\)/,
    "NetEase account playlists should be fetched in pages instead of a single tiny batch"
  );
  assert.doesNotMatch(
    musicHtml,
    /getPlaylistSongs\(\{\s*neteaseId:\s*playlist\.neteaseId,\s*limit:\s*200/,
    "NetEase playlist detail should not hard-code a 200-song preview limit"
  );
  assert.match(
    neteaseService,
    /while \(songs\.length < \(targetLimit \|\| MAX_ACCOUNT_SONGS\)\) \{[\s\S]*?playlist_track_all/,
    "NetEase playlist songs should be fetched in pages for full-account playlist playback"
  );
  assert.match(
    neteaseService,
    /async getLikedPlaylist\(profile\) \{[\s\S]*?neteaseApi\.user_playlist_create[\s\S]*?page\.find\(isLikedPlaylist\)/,
    "NetEase liked view should find the account red-heart playlist from created playlists"
  );
  assert.match(
    neteaseService,
    /async getLikedSongs\(\) \{[\s\S]*?const playlist = await this\.getLikedPlaylist\(auth\.profile\);[\s\S]*?const result = await this\.getPlaylistSongs\(\{ neteaseId: playlist\.neteaseId \}\);/,
    "NetEase liked view should load songs from the red-heart playlist instead of rebuilding a synthetic list"
  );
  assert.doesNotMatch(
    neteaseService,
    /for \(const part of chunks\(limitedIds, PAGE_SIZE\)\)|await neteaseApi\.song_detail\(this\.withCookie\(\{ ids: part\.join/,
    "NetEase liked view should not aggregate liked ids through song_detail batches"
  );
});

test("NetEase playlist cards reuse local tilted-card interaction", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/pages/music/index.html"), "utf8");
  const neteaseService = await fs.readFile(path.join(root, "electron/services/music/netease-api-service.js"), "utf8");

  assert.match(
    musicHtml,
    /hero\.querySelector\('\.playlist-detail-meta'\)\.textContent = subtitle \|\| `[$]\{songs\.length\} track[$]\{songs\.length === 1 \? '' : 's'\}`;/,
    "NetEase detail hero fallback should use the same track/tracks wording as local playlist details"
  );
  assert.match(
    musicHtml,
    /const creator = playlist\.creator \|\| 'NetEase Cloud';[\s\S]*?`[$]\{trackCount\} track[$]\{trackCount === 1 \? '' : 's'\} \\u00b7 [$]\{creator\}`/,
    "NetEase playlist detail meta should include track count and source context like local playlist details"
  );
  assert.match(
    musicHtml,
    /const totalTracks = result\.playlists\.reduce\(\(sum, playlist\) => sum \+ \(Number\(playlist\.trackCount\) \|\| 0\), 0\);[\s\S]*?`[$]\{result\.playlists\.length\} playlist[$]\{result\.playlists\.length === 1 \? '' : 's'\} \\u00b7 [$]\{totalTracks\} track[$]\{totalTracks === 1 \? '' : 's'\}`/,
    "NetEase playlist summary should match the local playlists/tracks count format"
  );
  assert.match(
    musicHtml,
    /if \(!result\.playlists\.length\) \{[\s\S]*?empty\.className = 'netease-empty';[\s\S]*?empty\.textContent = 'No NetEase playlists found\.';[\s\S]*?neteaseAccountPanel\.replaceChildren\(wrap\);[\s\S]*?return;/,
    "NetEase playlist account view should show an explicit empty state instead of a blank grid"
  );
  assert.match(
    musicHtml,
    /card\.className = 'playlist-tilted-card';[\s\S]*?card\.querySelector\('\.playlist-card-meta'\)\.textContent = `\$\{playlist\.trackCount \|\| 0\} tracks`;[\s\S]*?attachTiltedCard\(card\);/,
    "NetEase playlist cards should use the same tilted hover behavior as local playlist cards"
  );
  assert.match(
    neteaseService,
    /fetchPages\(neteaseApi\.user_playlist_create\),[\s\S]*?fetchPages\(neteaseApi\.user_playlist_collect\)/,
    "NetEase playlist grouping should use the API's created and collected playlist endpoints directly"
  );
  assert.match(
    neteaseService,
    /function playlistRows\(body = \{\}\) \{[\s\S]*?if \(Array\.isArray\(body\.data\)\) return body\.data;[\s\S]*?body\.createdPlaylist[\s\S]*?body\.collectPlaylist[\s\S]*?body\.data\?\.createdPlaylist[\s\S]*?body\.data\?\.collectPlaylist/,
    "NetEase playlist grouping should parse the created and collected endpoint response shapes"
  );
  assert.doesNotMatch(
    neteaseService,
    /neteaseApi\.user_playlist\(/,
    "NetEase playlist grouping should not fetch one mixed user playlist and infer ownership in the UI"
  );
  assert.match(
    neteaseService,
    /createdPlaylists = createdResult\.playlists\.filter\(playlist => !isLikedPlaylist\(playlist\)\)\.map\(playlist => normalizePlaylist\(playlist, \{ owned: true \}\)\);[\s\S]*?savedPlaylists = savedResult\.playlists\.filter\(playlist => !isLikedPlaylist\(playlist\)\)\.map\(playlist => normalizePlaylist\(playlist, \{ subscribed: true \}\)\);/,
    "NetEase playlist service should use API-provided created and collected groups for ownership and collection state"
  );
  assert.match(
    musicHtml,
    /const createdGroup = Array\.isArray\(result\.createdPlaylists\) \? result\.createdPlaylists : result\.playlists;[\s\S]*?const savedGroup = Array\.isArray\(result\.savedPlaylists\) \? result\.savedPlaylists : \[\];[\s\S]*?appendPlaylistGroup\('Created Playlists', createdGroup \|\| \[\]\);[\s\S]*?appendPlaylistGroup\('Saved Playlists', savedGroup \|\| \[\]\);/,
    "NetEase playlist view should render API-provided groups and avoid an empty grouped page while the main process is still on an older response shape"
  );
  assert.match(
    musicHtml,
    /<div id="neteaseAccountPanel"><\/div>[\s\S]*?<div id="neteaseResults">/,
    "NetEase account and playlist detail hero should render above the song result table"
  );
});

test("NetEase loading states use shimmer placeholders", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/pages/music/index.html"), "utf8");

  assert.match(
    musicHtml,
    /\.shimmer\{[\s\S]*?animation:shimmer 1\.35s ease-in-out infinite[\s\S]*?@keyframes shimmer/,
    "NetEase loading placeholders should have a visible shimmer animation"
  );
  assert.match(
    musicHtml,
    /const renderPlaylistLoading = \(\) => `[\s\S]*?netease-loading-card-grid[\s\S]*?netease-loading-card shimmer/,
    "playlist loading should show shimmering playlist cards"
  );
  assert.match(
    musicHtml,
    /const renderSongDetailLoading = \(\) => `[\s\S]*?netease-loading-hero[\s\S]*?netease-loading-cover shimmer/,
    "playlist detail loading should show a shimmering hero cover area"
  );
  assert.match(
    musicHtml,
    /const renderSongRowsLoading = \(label = 'Loading songs'\) => `[\s\S]*?netease-loading-row[\s\S]*?netease-loading-thumb shimmer/,
    "song loading should show shimmering table rows"
  );
  assert.match(
    musicHtml,
    /neteaseAccountPanel\.innerHTML = renderPlaylistLoading\(\);/,
    "loading playlists should use shimmer instead of static text"
  );
  assert.match(
    musicHtml,
    /neteaseAccountPanel\.innerHTML = renderSongDetailLoading\(\);[\s\S]*?neteaseResults\.innerHTML = renderSongRowsLoading\(\);/,
    "loading playlist songs should use shimmer in both hero and song rows"
  );
  assert.match(
    musicHtml,
    /neteaseResults\.innerHTML = renderSongRowsLoading\('Searching songs'\);/,
    "searching songs should use shimmering rows"
  );
});
