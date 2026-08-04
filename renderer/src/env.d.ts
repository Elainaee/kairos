/// <reference types="vite/client" />


interface Window {
  kairosDesktop?: {
    isDesktop?: boolean;
    appState?: {
      get(): Promise<Record<string, unknown>>;
      save(state: Record<string, unknown>): Promise<Record<string, unknown>>;
      onChanged?(handler: (state: Record<string, unknown>) => void): () => void;
    };
    pet?: {
      react?(action: "idle" | "talk" | "happy" | "sleepy" | "reminder", payload?: { title?: string }): Promise<unknown>;
      isReady?(): Promise<boolean>;
      getVisibility?(): Promise<boolean>;
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
