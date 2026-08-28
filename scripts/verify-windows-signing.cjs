const required = /^(1|true|yes)$/i.test(process.env.REQUIRE_WINDOWS_SIGNING || "");
const certificate = process.env.CSC_LINK;
const password = process.env.CSC_KEY_PASSWORD;

if (Boolean(certificate) !== Boolean(password)) {
  throw new Error("Windows signing requires both CSC_LINK and CSC_KEY_PASSWORD; configure both or neither.");
}

if (required && !certificate) {
  throw new Error("Windows signing is required, but CSC_LINK and CSC_KEY_PASSWORD are not configured.");
}

console.log(certificate ? "Windows code signing certificate is configured." : "Windows code signing is not configured for this non-release build.");
