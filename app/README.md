# Kairos application

Active frontend files for the Kairos calendar application.

- `index.html`: main calendar and SPA shell.
- `schedule.html`: schedule overview.
- `habits.html`: habits page.
- `music.html`: music integration page placeholder.
- `stitch-shell.js`: navigation and secondary-page loading.
- `schedule-feature.js`: shared schedule state and interactions.
- `habits-feature.js`: habit interactions.
- `ai-chat.js`: AI assistant interface.

Run the desktop application from the repository root with `pnpm dev`, `npm start`, `start-kairos.cmd`, or `start-kairos.ps1`.

If local Node/package-manager setup is confusing, run `npm run doctor` or `node scripts/kairos-doctor.cjs` from the repository root.

Netease Music integration is limited to the user's own authorized account for personal learning and daily planning. Kairos does not redistribute music content, provide commercial public playback, or bypass Netease rights, membership, region, verification, rate limit, or unavailable-song restrictions. See `docs/NETEASE-COMPLIANCE.md`.
