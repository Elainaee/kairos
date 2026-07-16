const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("kairosDesktop", Object.freeze({
  isDesktop: true,
  listProviders: () => ipcRenderer.invoke("ai:list-providers"),
  getProviderSettings: () => ipcRenderer.invoke("ai:get-settings"),
  saveProviderSettings: (settings) => ipcRenderer.invoke("ai:save-settings", settings),
  saveFirecrawlSettings: (settings) => ipcRenderer.invoke("ai:save-firecrawl-settings", settings),
  testProvider: (provider, sessionKey = "") => ipcRenderer.invoke("ai:test-provider", { provider, sessionKey }),
  closeAiWindow: () => ipcRenderer.invoke("ai-window:close"),
  onShellCommand: (handler) => {
    const listener = (_event, command) => handler(command);
    ipcRenderer.on("shell:command", listener);
    return () => ipcRenderer.removeListener("shell:command", listener);
  },
  reminders: Object.freeze({
    notify: (input = {}) => ipcRenderer.invoke("reminder:notify", input)
  }),
  sendMessage: (payload) => ipcRenderer.invoke("ai:send", payload),
  memories: Object.freeze({ list:()=>ipcRenderer.invoke("ai:memories:list"), forget:(id)=>ipcRenderer.invoke("ai:memories:forget",id), clear:()=>ipcRenderer.invoke("ai:memories:clear") }),
  stopMessage: (requestId) => ipcRenderer.invoke("ai:stop", requestId),
  conversations: Object.freeze({ list:()=>ipcRenderer.invoke("ai:conversations:list"),create:(input)=>ipcRenderer.invoke("ai:conversations:create",input),get:(id)=>ipcRenderer.invoke("ai:conversations:get",id),update:(id,patch)=>ipcRenderer.invoke("ai:conversations:update",{id,patch}),delete:(id)=>ipcRenderer.invoke("ai:conversations:delete",id) }),
  getUsage: (filters={}) => ipcRenderer.invoke("ai:usage",filters),
  attachments: Object.freeze({ save:(input)=>ipcRenderer.invoke("ai:attachments:save",input),remove:(id)=>ipcRenderer.invoke("ai:attachments:remove",id),prepare:(id,provider)=>ipcRenderer.invoke("ai:attachments:prepare",{id,provider}) }),
  context: Object.freeze({ assess:(conversationId,provider,limit)=>ipcRenderer.invoke("ai:context:assess",{conversationId,provider,limit}),resolve:(conversationId,action,carrySummary=false)=>ipcRenderer.invoke("ai:context:resolve",{conversationId,action,carrySummary}) }),
  permissions: Object.freeze({ get:()=>ipcRenderer.invoke("ai:permissions:get"),set:(input)=>ipcRenderer.invoke("ai:permissions:set",input) }),
  tools: Object.freeze({ query:(domain,query={})=>ipcRenderer.invoke("ai:tools:query",{domain,query}),propose:(input)=>ipcRenderer.invoke("ai:tools:propose",input),decide:(input)=>ipcRenderer.invoke("ai:tools:decide",input) }),
  appState: Object.freeze({ initialize:(legacy)=>ipcRenderer.invoke("app:initialize",legacy),save:(state)=>ipcRenderer.invoke("app:save",state),get:()=>ipcRenderer.invoke("app:get"),audit:()=>ipcRenderer.invoke("app:audit"),listBackups:()=>ipcRenderer.invoke("app:list-backups"),readBackup:(name)=>ipcRenderer.invoke("app:read-backup",name),restoreBackup:(name)=>ipcRenderer.invoke("app:restore-backup",name),exportCurrent:()=>ipcRenderer.invoke("app:export-current"),importJson:()=>ipcRenderer.invoke("app:import-json"),onChanged:(handler)=>{const listener=(_event,state)=>handler(state);ipcRenderer.on("app:state-changed",listener);return()=>ipcRenderer.removeListener("app:state-changed",listener);} }),
  music: Object.freeze({
    getState: () => ipcRenderer.invoke("music:get-state"),
    chooseFiles: () => ipcRenderer.invoke("music:choose-files"),
    chooseFolder: () => ipcRenderer.invoke("music:choose-folder"),
    addFiles: (filePaths) => ipcRenderer.invoke("music:add-files", filePaths),
    syncFolders: () => ipcRenderer.invoke("music:sync-folders"),
    updatePlayback: (patch) => ipcRenderer.invoke("music:update-playback", patch),
    updateTrack: (input) => ipcRenderer.invoke("music:update-track", input),
    removeTrack: (id) => ipcRenderer.invoke("music:remove-track", id),
    removeUnavailableTracks: () => ipcRenderer.invoke("music:remove-unavailable-tracks"),
    clear: () => ipcRenderer.invoke("music:clear"),
    reorder: (ids) => ipcRenderer.invoke("music:reorder", ids),
    reorderPlaylist: (id, trackIds) => ipcRenderer.invoke("music:reorder-playlist", { id, trackIds }),
    playPlaylist: (id) => ipcRenderer.invoke("music:play-playlist", id),
    removePlaylist: (id) => ipcRenderer.invoke("music:remove-playlist", id),
    refreshPlaylist: (id) => ipcRenderer.invoke("music:refresh-playlist", id),
    removeTracksFromPlaylist: (id, trackIds) => ipcRenderer.invoke("music:remove-tracks-from-playlist", { id, trackIds }),
    restoreHiddenTracks: (id, trackPaths) => ipcRenderer.invoke("music:restore-hidden-tracks", { id, trackPaths }),
    pathForFile: (file) => webUtils.getPathForFile(file)
  }),
  netease: Object.freeze({
    getStatus: () => ipcRenderer.invoke("netease:get-status"),
    startLogin: () => ipcRenderer.invoke("netease:start-login"),
    loginCheck: (input) => ipcRenderer.invoke("netease:login-check", input),
    sendCaptcha: (input) => ipcRenderer.invoke("netease:send-captcha", input),
    loginWithPhone: (input) => ipcRenderer.invoke("netease:login-with-phone", input),
    openVerification: (url) => ipcRenderer.invoke("netease:open-verification", url),
    logout: () => ipcRenderer.invoke("netease:logout"),
    searchSongs: (input) => ipcRenderer.invoke("netease:search-songs", input),
    getSearchHome: (input) => ipcRenderer.invoke("netease:get-search-home", input),
    playSong: (input) => ipcRenderer.invoke("netease:play-song", input),
    getUserPlaylists: (input) => ipcRenderer.invoke("netease:get-user-playlists", input),
    getPlaylistSongs: (input) => ipcRenderer.invoke("netease:get-playlist-songs", input),
    setPlaylistSubscribed: (input) => ipcRenderer.invoke("netease:set-playlist-subscribed", input),
    getLikedSongs: () => ipcRenderer.invoke("netease:get-liked-songs"),
    getLikedSongIds: () => ipcRenderer.invoke("netease:get-liked-song-ids"),
    setSongLiked: (input) => ipcRenderer.invoke("netease:set-song-liked", input),
    getHistory: (input) => ipcRenderer.invoke("netease:get-history", input)
  }),
  onStreamEvent: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("ai:stream", listener);
    return () => ipcRenderer.removeListener("ai:stream", listener);
  },
  pet: Object.freeze({
    hide: () => ipcRenderer.invoke("pet:hide"),
    show: () => ipcRenderer.invoke("pet:show"),
    click: () => ipcRenderer.invoke("pet:click"),
    react: (action, payload = {}) => ipcRenderer.invoke("pet:react", { action, ...payload }),
    isReady: () => ipcRenderer.invoke("pet:is-ready"),
    getVisibility: () => ipcRenderer.invoke("pet:get-visibility"),
    resize: (w, h) => ipcRenderer.invoke("pet:resize", { width: w, height: h }),
    move: (dx, dy) => ipcRenderer.invoke("pet:move", { dx, dy }),
    setMousePassthrough: (ignore) => ipcRenderer.send("pet:set-mouse-passthrough", Boolean(ignore)),
    onVisibilityChanged: (handler) => {
      const listener = (_event, visible) => handler(visible);
      ipcRenderer.on("pet:visibility", listener);
      return () => ipcRenderer.removeListener("pet:visibility", listener);
    },
    onOpenAi: (handler) => {
      const listener = () => handler();
      ipcRenderer.on("pet:open-ai", listener);
      return () => ipcRenderer.removeListener("pet:open-ai", listener);
    },
    onAction: (handler) => {
      const listener = (_event, payload) => handler(payload);
      ipcRenderer.on("pet:action", listener);
      return () => ipcRenderer.removeListener("pet:action", listener);
    },
    onBlur: (handler) => {
      const listener = () => handler();
      ipcRenderer.on("pet:blur", listener);
      return () => ipcRenderer.removeListener("pet:blur", listener);
    }
  })
}));
