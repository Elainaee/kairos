/// <reference types="vite/client" />

interface Window {
  kairosDesktop?: {
    isDesktop?: boolean;
    windowControls?: {
      minimize?(): Promise<boolean>;
      toggleMaximize?(): Promise<boolean>;
      isMaximized?(): Promise<boolean>;
      onMaximizedChanged?(handler: (maximized: boolean) => void): () => void;
      toggleFullScreen?(): Promise<boolean>;
      isFullScreen?(): Promise<boolean>;
      onFullScreenChanged?(handler: (fullscreen: boolean) => void): () => void;
      close?(): Promise<boolean>;
      closeAction?(action: "tray" | "exit" | "cancel"): Promise<boolean>;
      onCloseRequested?(handler: () => void): () => void;
    };
    appState?: {
      get(): Promise<Record<string, unknown>>;
      save(state: Record<string, unknown>): Promise<Record<string, unknown>>;
      onChanged?(handler: (state: Record<string, unknown>) => void): () => void;
    };
    focus?: {
      get?(): Promise<any>;
      start?(input?: Record<string, unknown>): Promise<any>;
      rest?(input?: Record<string, unknown>): Promise<any>;
      resume?(input?: Record<string, unknown>): Promise<any>;
      update?(input?: Record<string, unknown>): Promise<any>;
      finish?(input?: Record<string, unknown>): Promise<any>;
      chooseScene?(): Promise<{ canceled: boolean; filePath?: string; name?: string; kind?: "video" | "image" | "html" }>;
      validateScene?(): Promise<{ available: boolean; kind?: string }>;
      onChanged?(handler: (snapshot: any) => void): () => void;
    };
    pet?: {
      react?(action: "idle" | "talk" | "happy" | "sleepy" | "reminder" | "focus-away", payload?: { title?: string }): Promise<unknown>;
      isReady?(): Promise<boolean>;
      getVisibility?(): Promise<boolean>;
      show?(): Promise<boolean>;
      onVisibilityChanged?(handler: (visible: boolean) => void): () => void;
    };
    reminders?: {
      notify?(input: { scheduleId: string; title?: string; note?: string; missed?: boolean }): Promise<unknown>;
    };
    music?: {
      getState?(): Promise<any>;
      chooseFiles?(): Promise<any>;
      chooseFolder?(): Promise<any>;
      updatePlayback?(patch: Record<string, unknown>): Promise<any>;
      updateTrack?(input: Record<string, unknown>): Promise<any>;
      playPlaylist?(id: string): Promise<any>;
    };
  };
}
