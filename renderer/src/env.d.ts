/// <reference types="vite/client" />


interface Window {
  kairosDesktop?: {
    isDesktop?: boolean;
    windowControls?: {
      minimize?(): Promise<boolean>;
      toggleMaximize?(): Promise<boolean>;
      isMaximized?(): Promise<boolean>;
      onMaximizedChanged?(handler: (maximized: boolean) => void): () => void;
      close?(): Promise<boolean>;
      closeAction?(action: "tray" | "exit" | "cancel"): Promise<boolean>;
      onCloseRequested?(handler: () => void): () => void;
    };
    appState?: {
      get(): Promise<Record<string, unknown>>;
      save(state: Record<string, unknown>): Promise<Record<string, unknown>>;
      onChanged?(handler: (state: Record<string, unknown>) => void): () => void;
    };
    pet?: {
      react?(action: "idle" | "talk" | "happy" | "sleepy" | "reminder", payload?: { title?: string }): Promise<unknown>;
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
