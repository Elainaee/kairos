const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const localeDir = process.env.KAIROS_I18N_DIR
  ? path.resolve(process.env.KAIROS_I18N_DIR)
  : path.join(root, 'app', 'i18n', 'locales');
const localeFiles = ['en.json', 'zh-CN.json'];
const mojibake = /\uFFFD|锟斤拷|Ã.|Â.|â€|鈥|闂|鏃|鍔|璁|绠|绉|鎴|鍙/;

const read = file => JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf8'));
const flatten = (value, prefix = '', target = {}) => {
  for (const [key, child] of Object.entries(value || {})) {
    const fullKey = prefix ? prefix + '.' + key : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, fullKey, target);
    else target[fullKey] = child;
  }
  return target;
};

const catalogs = Object.fromEntries(localeFiles.map(file => [file, flatten(read(file))]));
const referenceKeys = Object.keys(catalogs[localeFiles[0]]).sort();
const referenceSet = new Set(referenceKeys);
const failures = [];

const sourceRoots = [
  path.join(root, 'app', 'features'),
  path.join(root, 'app', 'shell'),
  path.join(root, 'app', 'pages'),
  path.join(root, 'renderer', 'src'),
  path.join(root, 'electron', 'main'),
  path.join(root, 'electron', 'services')
];
const translationFileExtensions = new Set(['.js', '.cjs', '.mjs', '.ts', '.vue', '.html']);
const listSourceFiles = directory => {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(target);
    return entry.isFile() && translationFileExtensions.has(path.extname(entry.name)) ? [target] : [];
  });
};
const sourceFiles = sourceRoots.flatMap(listSourceFiles);
const usedTranslationKeys = new Map();
const registerUsedKey = (key, file) => {
  if (!usedTranslationKeys.has(key)) usedTranslationKeys.set(key, new Set());
  usedTranslationKeys.get(key).add(path.relative(root, file));
};
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\b(?:t|tr|trPlural)\(\s*(['"])([a-z][\w.-]*)\1/g)) registerUsedKey(match[2], file);
  for (const match of source.matchAll(/\bdata-i18n(?:-(?:placeholder|title|aria-label|alt|value))?="([a-z][\w.-]*)"/g)) registerUsedKey(match[1], file);
}

for (const file of localeFiles) {
  const catalog = catalogs[file];
  const keys = Object.keys(catalog).sort();
  const missing = referenceKeys.filter(key => !(key in catalog));
  const extra = keys.filter(key => !referenceSet.has(key));
  if (missing.length) failures.push(file + ': missing keys: ' + missing.join(', '));
  if (extra.length) failures.push(file + ': extra keys: ' + extra.join(', '));
  for (const [key, value] of Object.entries(catalog)) {
    if (typeof value !== 'string' || !value.trim()) failures.push(file + ': ' + key + ' must be a non-empty string');
    if (typeof value === 'string' && mojibake.test(value)) failures.push(file + ': ' + key + ' contains probable mojibake: ' + value);
  }
}

for (const [key, files] of usedTranslationKeys) {
  if (!referenceSet.has(key)) failures.push(`source uses missing i18n key ${key}: ${[...files].sort().join(', ')}`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('i18n catalogs valid: ' + referenceKeys.length + ' aligned keys (' + localeFiles.join(', ') + ')');
}

module.exports = { flatten, read, localeFiles, localeDir };
