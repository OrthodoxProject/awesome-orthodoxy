// Builds the website from the repository itself:
// - lists/structure.json declares the languages, and each language becomes a locale of the site;
// - every Markdown file becomes a page (README.md is the index page of its folder);
// - links written for GitHub are rewritten so they work on the site.

import fs from 'node:fs';
import path from 'node:path';

export const root = path.resolve(import.meta.dirname, '..');
export const structure = JSON.parse(fs.readFileSync(path.join(root, 'lists/structure.json'), 'utf8'));
export const repository = structure.repository;

// Each language from lists/structure.json. The main list (README.md) is the root of the site,
// the others are served from /<code>/ (lists/ro/README.md → /ro/).
export const languages = Object.entries(structure.languages).map(([code, language]) => {
	const folder = path.posix.dirname(language.file);
	return {code, ...language, folder, isMain: folder === '.'};
});

const mainLanguage = languages.find(language => language.isMain);

function findMarkdownFiles(dir = '') {
	return fs.readdirSync(path.join(root, dir), {withFileTypes: true}).flatMap(entry => {
		if (entry.name.startsWith('.') || entry.name === 'node_modules') {
			return [];
		}

		const file = path.posix.join(dir, entry.name);

		if (entry.isDirectory()) {
			return findMarkdownFiles(file);
		}

		return entry.name.endsWith('.md') ? [file] : [];
	});
}

// Natural order, so video.md comes before video-2.md.
export const pages = findMarkdownFiles().sort((a, b) => a.replace(/\.md$/, '').localeCompare(b.replace(/\.md$/, ''), 'en', {numeric: true}));
const pageSet = new Set(pages);

export function languageOf(file) {
	return languages.find(language => !language.isMain && file.startsWith(`${language.folder}/`)) ?? mainLanguage;
}

// Path of the page on the site, as a VitePress source path: lists/ro/README.md → ro/index.md
export function rewritePath(file) {
	const language = languageOf(file);
	const target = language.isMain ? file : `${language.code}/${file.slice(language.folder.length + 1)}`;
	return target.replace(/(^|\/)README\.md$/, '$1index.md');
}

// URL of the page, without the base: lists/ro/README.md → /ro/, contributing.md → /contributing
export function routeOf(file) {
	return `/${rewritePath(file).replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')}`;
}

export const rewrites = Object.fromEntries(pages
	.map(file => [file, rewritePath(file)])
	.filter(([file, target]) => file !== target));

// Same anchors as GitHub, so the links between sections written for GitHub also work on the site.
export function slugify(text) {
	return text.trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replaceAll(' ', '-');
}

// Removes badges, images and link syntax from a Markdown heading.
function plainText(markdown) {
	return markdown
		.replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/[*_`]/g, '')
		.trim();
}

const fileCache = new Map();

function readPage(file) {
	if (!fileCache.has(file)) {
		const text = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
		const headings = [];
		const used = new Set();
		let inCode = false;

		for (const line of text.split('\n')) {
			if (/^(```|~~~)/.test(line)) {
				inCode = !inCode;
			}

			const match = inCode ? null : /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);

			// The "Contents" section is removed from the site, where the outline replaces it.
			if (!match || (match[1] === '##' && match[2] === 'Contents')) {
				continue;
			}

			const title = plainText(match[2]);
			let slug = slugify(title);

			for (let index = 1; used.has(slug); index++) {
				slug = `${slugify(title)}-${index}`;
			}

			used.add(slug);
			headings.push({depth: match[1].length, title, slug});
		}

		const description = /^> (.+)$/m.exec(text)?.[1].trim() ?? '';
		const title = headings.find(heading => heading.depth === 1)?.title ?? path.posix.basename(file, '.md');
		fileCache.set(file, {title, description, headings});
	}

	return fileCache.get(file);
}

export function pageTitle(file) {
	return readPage(file).title;
}

export function pageDescription(file) {
	return readPage(file).description;
}

// The sections (## and ###) of a list, as sidebar links to their anchors.
function sectionItems(file) {
	const items = [];

	for (const heading of readPage(file).headings) {
		const item = {text: heading.title, link: `${routeOf(file)}#${heading.slug}`};

		if (heading.depth === 2) {
			items.push(item);
		} else if (heading.depth === 3 && items.length > 0) {
			const parent = items.at(-1);
			parent.items ??= [];
			parent.collapsed = true;
			parent.items.push(item);
		}
	}

	return items;
}

// "e-religie: cărți pe autori" in the group "e-religie" becomes "Cărți pe autori".
function shortTitle(title, groupTitle, language) {
	const prefix = `${groupTitle}: `;

	if (!groupTitle || !title.startsWith(prefix) || title.length === prefix.length) {
		return title;
	}

	const rest = title.slice(prefix.length);
	return rest[0].toLocaleUpperCase(language.code) + rest.slice(1);
}

// Pages and subfolders of a folder: a subfolder becomes a group, linked to its README.md.
// The groups of the language folder are open; deeper groups are closed until one of their pages is open.
function folderItems(language, folder, groupTitle) {
	const inFolder = pages.filter(file => languageOf(file) === language && path.posix.dirname(file) === folder);
	const subfolders = [...new Set(pages
		.filter(file => languageOf(file) === language && file.startsWith(folder === '.' ? '' : `${folder}/`))
		.map(file => path.posix.relative(folder, file).split('/'))
		.filter(parts => parts.length > 1)
		.map(parts => path.posix.join(folder, parts[0])))]
		.filter(subfolder => language.isMain ? !subfolder.startsWith('lists') : true)
		.sort();

	const groups = subfolders.map(subfolder => {
		const readme = `${subfolder}/README.md`;
		const text = pageSet.has(readme) ? pageTitle(readme) : path.posix.basename(subfolder);
		return {
			text: shortTitle(text, groupTitle, language),
			link: pageSet.has(readme) ? routeOf(readme) : undefined,
			collapsed: folder !== language.folder,
			items: folderItems(language, subfolder, text),
		};
	});

	const files = inFolder
		.filter(file => !/(^|\/)(README|contributing)\.md$/.test(file))
		.map(file => ({text: shortTitle(pageTitle(file), groupTitle, language), link: routeOf(file)}));

	// As in the README of a folder: its own pages first, then its subfolders.
	return [...files, ...groups];
}

// Sidebar of a language: its list with all sections, the other pages of its folder, and the contribution guide.
export function sidebar(language) {
	const readme = language.file;
	const contributing = path.posix.join(language.folder, 'contributing.md');
	const items = [
		{text: pageTitle(readme), link: routeOf(readme), items: sectionItems(readme)},
		...folderItems(language, language.folder),
	];

	if (pageSet.has(contributing)) {
		items.push({text: pageTitle(contributing), link: routeOf(contributing)});
	}

	return items;
}

export function contributingPage(language) {
	const contributing = path.posix.join(language.folder, 'contributing.md');
	return pageSet.has(contributing) ? contributing : undefined;
}

// Where a link written in the repository points to: a page of the site, or another file of the repository.
function resolveLink(url, fromFile) {
	let target;
	let hash;

	if (url.startsWith(`${repository}/`)) {
		const match = /^(?:tree|blob)\/main\/([^?#]*)(?:\?[^#]*)?(#.*)?$/.exec(url.slice(repository.length + 1));

		if (!match) {
			return null;
		}

		target = decodeURIComponent(match[1]).replace(/\/$/, '') || '.';
		hash = match[2] ?? '';
	} else if (/^([a-z][a-z\d+.-]*:|\/|#)/i.test(url)) {
		return null;
	} else {
		const match = /^([^?#]*)(?:\?[^#]*)?(#.*)?$/.exec(url);
		target = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), decodeURIComponent(match[1])));
		hash = match[2] ?? '';
	}

	if (target.startsWith('..')) {
		return null;
	}

	if (pageSet.has(target)) {
		return {page: target, hash};
	}

	const absolute = path.join(root, target);

	if (!fs.existsSync(absolute)) {
		return null;
	}

	if (fs.statSync(absolute).isDirectory()) {
		const readme = path.posix.join(target, 'README.md');
		// GitHub adds #readme to folder links; on the site the folder is the page itself.
		return pageSet.has(readme) ? {page: readme, hash: hash === '#readme' ? '' : hash} : {folder: target, hash};
	}

	return {file: target, hash};
}

function repositoryUrl({folder, file, hash}) {
	return folder ? `${repository}/tree/main/${folder}${hash}` : `${repository}/blob/main/${file}${hash}`;
}

// Markdown links: VitePress turns /ro/index.md into /ro/, adds the base and checks for dead links.
function mapMarkdownLink(url, fromFile) {
	const link = resolveLink(url, fromFile);

	if (!link) {
		return url;
	}

	return link.page ? `/${rewritePath(link.page)}${link.hash}` : repositoryUrl(link);
}

// Links in raw HTML are not processed by VitePress, so they get their final URL here.
function mapHtmlLink(url, fromFile, base) {
	const link = resolveLink(url, fromFile);

	if (!link) {
		return url;
	}

	return link.page ? `${base}${routeOf(link.page).slice(1)}${link.hash}` : repositoryUrl(link);
}

function rewriteHtml(html, fromFile, base) {
	return html.replace(/\bhref=(["'])(.*?)\1/g, (_, quote, url) => `href=${quote}${mapHtmlLink(url, fromFile, base)}${quote}`);
}

function sourceFile(env) {
	const file = env.realPath ?? env.path;
	return file ? path.relative(root, file).replaceAll('\\', '/') : null;
}

// Changes the parsed Markdown of every page so it reads well on the site.
export function markdownPlugin(md, {base}) {
	md.core.ruler.after('inline', 'awesome-orthodoxy-site', state => {
		const file = sourceFile(state.env);

		if (!file || !pageSet.has(file)) {
			return;
		}

		const {tokens} = state;
		removeContents(tokens);
		removeLogo(tokens);
		cleanTitle(tokens);

		if (addSummaryHeadings(state)) {
			// Every group of a catalog becomes a heading, so the outline shows only the ## sections.
			state.env.frontmatter ??= {};
			state.env.frontmatter.outline ??= 2;
		}

		for (const token of tokens) {
			if (token.type === 'html_block') {
				token.content = rewriteHtml(token.content, file, base);
			}

			for (const child of token.children ?? []) {
				if (child.type === 'link_open') {
					child.attrSet('href', mapMarkdownLink(child.attrGet('href'), file));
				} else if (child.type === 'html_inline') {
					child.content = rewriteHtml(child.content, file, base);
				}
			}
		}
	});
}

// "## Contents" is needed on GitHub. On the site the sidebar and the outline already list the sections.
function removeContents(tokens) {
	const start = tokens.findIndex((token, index) => token.type === 'heading_open'
		&& token.tag === 'h2'
		&& tokens[index + 1].content.trim() === 'Contents');

	if (start === -1) {
		return;
	}

	let end = start + 1;

	while (end < tokens.length && !(tokens[end].type === 'heading_open' && ['h1', 'h2'].includes(tokens[end].tag))) {
		end++;
	}

	tokens.splice(start, end - start);
}

// The logo next to the title of each list; on the site it is already in the navigation bar.
function removeLogo(tokens) {
	const index = tokens.findIndex(token => token.type === 'inline'
		&& token.content.includes('media/logo.svg')
		&& token.children.every(child => child.type === 'html_inline' || (child.type === 'text' && !child.content.trim())));

	if (index > 0 && tokens[index - 1].type === 'paragraph_open') {
		tokens.splice(index - 1, 3);
	}
}

// Keeps only the text of the main title, without the Awesome badge.
function cleanTitle(tokens) {
	const index = tokens.findIndex(token => token.type === 'heading_open' && token.tag === 'h1');

	if (index === -1) {
		return;
	}

	const inline = tokens[index + 1];
	const children = [];

	for (let i = 0; i < inline.children.length; i++) {
		const child = inline.children[i];

		if (child.type === 'link_open' && inline.children[i + 1]?.type === 'image' && inline.children[i + 2]?.type === 'link_close') {
			i += 2;
		} else if (child.type !== 'image') {
			children.push(child);
		}
	}

	const last = children.at(-1);

	if (last?.type === 'text') {
		last.content = last.content.trimEnd();
	}

	inline.children = children;
	inline.content = children.filter(child => child.type === 'text').map(child => child.content).join('');
}

// In the catalogs, each <details> group is named in its <summary> (an author, for example).
// The name is repeated as a hidden heading at the start of the group, right before its list:
// search then finds the group, shows its entries, and the theme opens the group.
// Groups whose summary is only a count ("13 titluri") stay as they are.
function addSummaryHeadings(state) {
	const {tokens} = state;
	let level = 1;
	let added = false;

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];

		if (token.type === 'heading_open') {
			level = Number(token.tag.slice(1));
			continue;
		}

		const match = token.type === 'html_block' && /^<details>\s*<summary>([^<]+)<\/summary>\s*$/.exec(token.content);

		if (!match || /^\d/.test(match[1].trim())) {
			continue;
		}

		const tag = `h${Math.min(level + 1, 6)}`;
		const headingOpen = new state.Token('heading_open', tag, 1);
		headingOpen.markup = '#'.repeat(Number(tag.slice(1)));
		headingOpen.block = true;
		headingOpen.attrSet('class', 'summary-heading');
		const inline = new state.Token('inline', '', 0);
		inline.content = match[1].trim();
		inline.children = [];
		state.md.inline.parse(inline.content, state.md, state.env, inline.children);
		const headingClose = new state.Token('heading_close', tag, -1);
		headingClose.markup = headingOpen.markup;
		headingClose.block = true;

		tokens.splice(i + 1, 0, headingOpen, inline, headingClose);
		i += 3;
		added = true;
	}

	return added;
}
