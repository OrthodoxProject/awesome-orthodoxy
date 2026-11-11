// Builds the GitHub wiki from the Markdown files of the repository, like the website (see .vitepress/site.mjs):
// every file becomes a wiki page, README.md becomes Home, and the links point to the wiki pages.
// The workflow .github/workflows/wiki.yml publishes it on each merge into main.
//
// Usage: node scripts/wiki.mjs <folder>

import fs from 'node:fs';
import path from 'node:path';
import {languageOf, languages, pageTitle, pages, repository, resolveLink, root} from '../.vitepress/site.mjs';

const output = process.argv[2];

if (!output) {
	console.error('Usage: node scripts/wiki.mjs <folder>');
	process.exit(1);
}

const [, owner, name] = new URL(repository).pathname.split('/');
const website = `https://${owner.toLowerCase()}.github.io/${name}/`;

// The wiki names a page after its file, and shows a "-" in the name as a space.
// "Resurse Ortodoxe: video (2)" becomes the page "Resurse Ortodoxe – video 2".
function cleanName(title) {
	return title
		.replace(/:\s*/g, ' – ')
		.replace(/[^\p{L}\p{M}\p{N}'’ –-]/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

// Page names must be unique: lists with the same title get the name of their language.
const names = new Map(pages.map(file => [file, file === 'README.md' ? 'Home' : cleanName(pageTitle(file))]));

for (const file of pages) {
	const others = pages.filter(other => other !== file && names.get(other) === names.get(file));

	if (others.length > 0) {
		for (const page of [file, ...others]) {
			names.set(page, `${names.get(page)} – ${languageOf(page).name}`);
		}
	}
}

for (const [index, file] of pages.entries()) {
	if (pages.slice(0, index).some(other => names.get(other) === names.get(file))) {
		names.set(file, `${names.get(file)} – ${index}`);
	}
}

function pageLink(file) {
	return names.get(file).replaceAll(' ', '-');
}

function mapLink(url, fromFile, {image = false} = {}) {
	const link = resolveLink(url, fromFile);

	if (!link) {
		return url;
	}

	if (link.page) {
		return `${pageLink(link.page)}${link.hash}`;
	}

	if (link.folder) {
		return `${repository}/tree/main/${link.folder}${link.hash}`;
	}

	return `${repository}/${image ? 'raw' : 'blob'}/main/${link.file}${link.hash}`;
}

function convert(file) {
	let text = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');

	// The wiki shows the name of the page as its title, except on Home.
	if (file !== 'README.md') {
		text = text.replace(/^# .*\n+/, '');
	}

	return text
		.replace(/(!?)\[((?:[^[\]]|\[[^\]]*\])*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (match, bang, label, url, title = '') => {
			const mapped = mapLink(url, file, {image: bang === '!'});
			return mapped === url ? match : `${bang}[${label}](${mapped}${title})`;
		})
		.replace(/\b(href|src)=(["'])(.*?)\2/g, (_, attribute, quote, url) => `${attribute}=${quote}${mapLink(url, file, {image: attribute === 'src'})}${quote}`);
}

// The sidebar lists the languages, and under each one the other sections of its folder (the Romanian library, for example).
function sidebar() {
	const lines = [`**[Website with search](${website})**`, ''];

	for (const language of languages) {
		lines.push(`- [${language.flag} ${language.name}](${pageLink(language.file)})`);

		const prefix = language.isMain ? '' : `${language.folder}/`;
		const sections = pages.filter(file => languageOf(file) === language
			&& /^[^/]+\/README\.md$/.test(file.slice(prefix.length)));

		for (const section of sections) {
			lines.push(`  - [${pageTitle(section)}](${pageLink(section)})`);
		}
	}

	return `${lines.join('\n')}\n`;
}

const footer = `This wiki is copied from the [repository](${repository}) on each change, so edits made here are replaced. To change a page, edit its file in the repository: see the [contribution guidelines](${pageLink('contributing.md')}).\n`;

fs.mkdirSync(output, {recursive: true});

for (const file of pages) {
	fs.writeFileSync(path.join(output, `${names.get(file).replaceAll(' ', '-')}.md`), convert(file));
}

fs.writeFileSync(path.join(output, '_Sidebar.md'), sidebar());
fs.writeFileSync(path.join(output, '_Footer.md'), footer);
console.log(`${pages.length} wiki pages written to ${output}`);
