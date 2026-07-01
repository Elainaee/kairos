const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("kairosDesktop", Object.freeze({
  isDesktop: true,
  listProviders: () => ipcRenderer.invoke("ai:list-providers"),
  getProviderSettings: () => ipcRenderer.invoke("ai:get-settings"),
  saveProviderSettings: (settings) => ipcRenderer.invoke("ai:save-settings", settings),
  testProvider: (provider, sessionKey = "") => ipcRenderer.invoke("ai:test-provider", { provider, sessionKey }),
  closeAiWindow: () => ipcRenderer.invoke("ai-window:close"),
  sendMessage: (payload) => ipcRenderer.invoke("ai:send", payload),
  extractSchedules: (payload) => ipcRenderer.invoke("ai:extract-schedules", payload),
  stopMessage: (requestId) => ipcRenderer.invoke("ai:stop", requestId),
  conversations: Object.freeze({ list:()=>ipcRenderer.invoke("ai:conversations:list"),create:(input)=>ipcRenderer.invoke("ai:conversations:create",input),get:(id)=>ipcRenderer.invoke("ai:conversations:get",id),update:(id,patch)=>ipcRenderer.invoke("ai:conversations:update",{id,patch}),delete:(id)=>ipcRenderer.invoke("ai:conversations:delete",id) }),
  getUsage: (filters={}) => ipcRenderer.invoke("ai:usage",filters),
  attachments: Object.freeze({ save:(input)=>ipcRenderer.invoke("ai:attachments:save",input),remove:(id)=>ipcRenderer.invoke("ai:attachments:remove",id),prepare:(id,provider)=>ipcRenderer.invoke("ai:attachments:prepare",{id,provider}) }),
  context: Object.freeze({ assess:(conversationId,provider,limit)=>ipcRenderer.invoke("ai:context:assess",{conversationId,provider,limit}),resolve:(conversationId,action,carrySummary=false)=>ipcRenderer.invoke("ai:context:resolve",{conversationId,action,carrySummary}) }),
  permissions: Object.freeze({ get:()=>ipcRenderer.invoke("ai:permissions:get"),set:(input)=>ipcRenderer.invoke("ai:permissions:set",input) }),
  tools: Object.freeze({ query:(domain,query={})=>ipcRenderer.invoke("ai:tools:query",{domain,query}),propose:(input)=>ipcRenderer.invoke("ai:tools:propose",input),decide:(input)=>ipcRenderer.invoke("ai:tools:decide",input) }),
  appState: Object.freeze({ initialize:(legacy)=>ipcRenderer.invoke("app:initialize",legacy),save:(state)=>ipcRenderer.invoke("app:save",state),get:()=>ipcRenderer.invoke("app:get"),onChanged:(handler)=>{const listener=(_event,state)=>handler(state);ipcRenderer.on("app:state-changed",listener);return()=>ipcRenderer.removeListener("app:state-changed",listener);} }),
  music: Object.freeze({
    getState: () => ipcRenderer.invoke("music:get-state"),
    chooseFiles: () => ipcRenderer.invoke("music:choose-files"),
    chooseFolder: () => ipcRenderer.invoke("music:choose-folder"),
    addFiles: (filePaths) => ipcRenderer.invoke("music:add-files", filePaths),
    syncFolders: () => ipcRenderer.invoke("music:sync-folders"),
    updatePlayback: (patch) => ipcRenderer.invoke("music:update-playback", patch),
    updateTrack: (input) => ipcRenderer.invoke("music:update-track", input),
    removeTrack: (id) => ipcRenderer.invoke("music:remove-track", id),
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
  onStreamEvent: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("ai:stream", listener);
    return () => ipcRenderer.removeListener("ai:stream", listener);
  },
  pet: Object.freeze({
    hide: () => ipcRenderer.invoke("pet:hide"),
    show: () => ipcRenderer.invoke("pet:show"),
    click: () => ipcRenderer.invoke("pet:click"),
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
    onBlur: (handler) => {
      const listener = () => handler();
      ipcRenderer.on("pet:blur", listener);
      return () => ipcRenderer.removeListener("pet:blur", listener);
    }
  })
}));
