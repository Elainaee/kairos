# Netease Music first-version scope

> Updated: 2026-07-15

Kairos uses Netease Music only as a personal account playback integration for the user's own learning and daily schedule workspace.

## Allowed scope

- Personal authorization only: the user signs in with their own Netease Music account.
- Personal learning and daily planning scenarios only.
- Playback is routed through the local Kairos desktop player for the signed-in user.
- Local app state may store the user's login cookie, playback queue metadata, quality preference, liked state, and non-content cache needed for the desktop experience.
- The user can clear the saved Netease session and local Netease playback cache from Settings > Music.

## Out of scope

- No music content redistribution.
- No commercial public playback.
- No shared account service.
- No download, re-hosting, or resale of Netease Music audio.
- No bypass of Netease rights, membership, region, security verification, rate limit, or unavailable-song restrictions.

## Required user-facing behavior

- Login UI must say the integration is for the user's own account and personal use.
- Settings > Music must provide login state, logout or session clearing, local playback cache clearing, account refresh, and quality preference controls.
- If Netease blocks login, requests verification, rate-limits the request, or refuses playback, Kairos must show a readable message and keep local music, schedule, habits, reminders, and AI entry usable.
- Netease and local music may share the same visible player, but online and local queues must stay isolated when required by playback source behavior.
