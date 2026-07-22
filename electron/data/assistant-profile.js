const DEFAULT_NAME = "Kairos Assistant";
const MAX_AVATAR_LENGTH = 350000;

export function normalizeAssistantProfile(value = {}) {
  const name = String(value?.name || "").trim().slice(0, 32) || DEFAULT_NAME;
  const avatar = typeof value?.avatar === "string" && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value.avatar) && value.avatar.length <= MAX_AVATAR_LENGTH ? value.avatar : "";
  return { name, avatar, updatedAt: String(value?.updatedAt || ""), migratedAt: String(value?.migratedAt || "") };
}

export function initializeAssistantProfile(stored, legacy, now = new Date().toISOString()) {
  const current = normalizeAssistantProfile(stored);
  if (current.migratedAt) return { profile: current, changed: false };
  return {
    profile: normalizeAssistantProfile({
      name: legacy?.name || current.name,
      avatar: legacy?.avatar || current.avatar,
      updatedAt: current.updatedAt || now,
      migratedAt: now
    }),
    changed: true
  };
}

export function updateAssistantProfile(stored, input, now = new Date().toISOString()) {
  const current = normalizeAssistantProfile(stored);
  return normalizeAssistantProfile({ ...input, updatedAt: now, migratedAt: current.migratedAt || now });
}
