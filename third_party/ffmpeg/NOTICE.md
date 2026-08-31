# FFmpeg runtime notice

Kairos packages the Windows x64 FFmpeg command-line executable supplied by the
`ffmpeg-static` npm package. The exact package version, executable SHA-256 and
reported version are generated into `vendor/ffmpeg/win-x64/manifest.json` by
`pnpm prepare:ffmpeg` before packaging.

License: GPL-3.0-or-later. The packaged binary and corresponding-source
information are available from the upstream FFmpeg project:

- https://ffmpeg.org/legal.html
- https://ffmpeg.org/download.html

Do not replace the bundled executable manually. Update the pinned
`ffmpeg-static` dependency, regenerate the manifest, and review the license
obligations as one change.
