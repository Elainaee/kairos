// Opt-in Vue preview. The regular `npm start` path remains the legacy UI.
process.env.KAIROS_RENDERER = "vue";
require("./kairos-dev.cjs");
