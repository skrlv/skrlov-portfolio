import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const checked = new Set();
const files = {};
for (const file of ['index.html', 'styles.css', 'app.js', 'scroll-model.mjs']) {
  try {
    files[file] = await readFile(path.join(root, file), 'utf8');
  } catch {
    errors.push(`Required runtime file is missing: ${file}`);
    files[file] = '';
  }
}

const html = files['index.html'];
const expectedPanels = ['intro', 'g2', 'forma', 'tishe', 'obekt', 'pauza', 'chisto', 'contact'];
const attribute = (tag, name) => tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([^"']*)["']`))?.[1];
const panelTags = [...html.matchAll(/<section\b[^>]*>/g)]
  .map(match => match[0])
  .filter(tag => attribute(tag, 'class')?.split(/\s+/).includes('panel'));
const actualPanels = panelTags.map(tag => attribute(tag, 'id'));
if (JSON.stringify(actualPanels) !== JSON.stringify(expectedPanels)) {
  errors.push(`Expected the eight portfolio screens in order: ${expectedPanels.join(', ')}; got ${actualPanels.join(', ')}.`);
}
for (const match of html.matchAll(/<a\b[^>]*\bdata-goto\s*=\s*["'][^"']*["'][^>]*>/g)) {
  const tag = match[0];
  const index = Number(attribute(tag, 'data-goto'));
  if (!Number.isInteger(index) || index < 0 || index >= expectedPanels.length || attribute(tag, 'href') !== `#${expectedPanels[index]}`) {
    errors.push(`Navigation target does not match its screen: ${tag}`);
  }
}
const rail = html.match(/<nav\b[^>]*class\s*=\s*["'][^"']*\bscreen-nav\b[^"']*["'][^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '';
const railTargets = [...rail.matchAll(/<a\b[^>]*>/g)].map(match => Number(attribute(match[0], 'data-goto')));
if (railTargets.length !== expectedPanels.length || railTargets.some((target, index) => target !== index)) {
  errors.push('The navigation rail must link to all eight screens exactly once and in order.');
}
const ids = [...html.matchAll(/(?:^|\s)id\s*=\s*["']([^"']+)["']/g)].map(match => match[1]);
const uniqueIds = new Set(ids);
if (uniqueIds.size !== ids.length) {
  errors.push(`Duplicate IDs: ${ids.filter((id, index) => ids.indexOf(id) !== index).join(', ')}`);
}
if (!/<html\b[^>]*\blang\s*=\s*["']ru["']/i.test(html)) errors.push('The document language must be Russian.');
if (!/<meta\b[^>]*\bname\s*=\s*["']viewport["']/i.test(html)) errors.push('Responsive viewport metadata is missing.');
if (!/<title>[^<]+<\/title>/i.test(html)) errors.push('A page title is required.');

async function checkReference(reference, from, allowAnchor = true) {
  const value = reference.trim().replace(/&amp;/g, '&');
  if (!value || /^(https?:|mailto:|tel:|data:|blob:)/i.test(value)) return;
  if (/^(\/|[a-z][a-z\d+.-]*:)/i.test(value)) {
    errors.push(`${from}: use a relative asset or an HTTPS link, not ${value}`);
    return;
  }
  const [pathname, fragment] = value.split('#');
  if (!pathname) {
    if (allowAnchor && fragment && !uniqueIds.has(fragment)) errors.push(`${from}: anchor #${fragment} has no target.`);
    return;
  }
  let relative;
  try {
    relative = decodeURIComponent(pathname.split('?')[0]);
  } catch {
    errors.push(`${from}: invalid URL encoding in ${value}`);
    return;
  }
  const resolved = path.resolve(root, path.dirname(from), relative);
  const within = path.relative(root, resolved);
  if (within === '..' || within.startsWith(`..${path.sep}`)) {
    errors.push(`${from}: ${value} points outside the deployable site.`);
    return;
  }
  if (allowAnchor && within === 'index.html' && fragment && !uniqueIds.has(fragment)) errors.push(`${from}: anchor #${fragment} has no target.`);
  if (checked.has(within)) return;
  checked.add(within);
  try {
    const entry = await stat(resolved);
    if (!entry.isFile()) errors.push(`${from}: ${value} is not a file.`);
  } catch {
    errors.push(`${from}: local resource does not exist: ${value}`);
  }
}

for (const match of html.matchAll(/(?:^|\s)(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
  await checkReference(match[1], 'index.html');
}
for (const match of files['styles.css'].matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) {
  await checkReference(match[1], 'styles.css', false);
}
for (const match of files['app.js'].matchAll(/\b(?:from\s*|import\s*)["'](\.[^"']+)["']/g)) {
  await checkReference(match[1], 'app.js', false);
}
for (const match of files['app.js'].matchAll(/["']((?:\.\/)?assets\/[^"']+)["']/g)) {
  if (!match[1].includes('${')) await checkReference(match[1], 'app.js', false);
}
for (const match of html.matchAll(/\baria-(?:controls|labelledby|describedby)\s*=\s*["']([^"']+)["']/g)) {
  for (const id of match[1].split(/\s+/)) {
    if (!uniqueIds.has(id)) errors.push(`ARIA reference has no static target: ${id}`);
  }
}

const content = `${html}\n${files['app.js']}`;
for (const repo of ['g2-fashion-demo', 'forma-architecture-demo', 'tishe-retreat-demo', 'obekt-design-demo', 'pauza-coffee-demo', 'chisto-cleaning-demo']) {
  const url = `https://skrlv.github.io/${repo}/`;
  if (!content.includes(url)) errors.push(`Project link is missing: ${url}`);
}
if (!content.includes('https://t.me/skrlov')) errors.push('The supplied Telegram contact is missing.');
for (const image of ['g2', 'forma', 'tishe', 'obekt', 'pauza', 'chisto']) await checkReference(`assets/${image}.jpg`, 'index.html', false);

if (errors.length) {
  console.error(`Site validation failed:\n${errors.map(error => `- ${error}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Site validation passed: ${uniqueIds.size} unique IDs, ${checked.size} local resources, 8 screens, all 6 project links and Telegram contact.`);
}
