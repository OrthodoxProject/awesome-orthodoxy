// Website of the lists, built with VitePress: https://vitepress.dev
// Languages, pages, sidebars and links all come from the repository (see site.mjs),
// so the site needs no changes when a list, a page or a language is added.

import fs from 'node:fs';
import path from 'node:path';
import {defineConfig} from 'vitepress';
import {interfaceText, searchTranslations} from './i18n.mjs';
import {
	contributingPage,
	languages,
	markdownPlugin,
	pageDescription,
	pageTitle,
	repository,
	rewrites,
	root,
	routeOf,
	sidebar,
	slugify,
} from './site.mjs';

// GitHub Pages serves the site from /<repository>/; the workflow passes that path in BASE_PATH.
const base = `${(process.env.BASE_PATH ?? '').replace(/\/$/, '')}/`;
const logo = `data:image/svg+xml;base64,${fs.readFileSync(path.join(root, 'media/logo.svg')).toString('base64')}`;

function localeTheme(language) {
	const text = interfaceText(language.code);
	const contributing = contributingPage(language);

	return {
		nav: contributing ? [{text: pageTitle(contributing), link: routeOf(contributing)}] : [],
		sidebar: sidebar(language),
		outline: {level: [2, 3], label: text.outline},
		docFooter: {prev: text.previous, next: text.next},
		editLink: {pattern: `${repository}/edit/main/:path`, text: text.edit},
		lastUpdated: {text: text.lastUpdated, formatOptions: {dateStyle: 'medium'}},
		darkModeSwitchLabel: text.appearance,
		lightModeSwitchTitle: text.lightTheme,
		darkModeSwitchTitle: text.darkTheme,
		sidebarMenuLabel: text.menu,
		returnToTopLabel: text.top,
		langMenuLabel: text.language,
		skipToContentLabel: text.skip,
		notFound: {title: text.notFound, quote: text.notFoundText, linkLabel: text.home, linkText: text.home},
	};
}

const locales = Object.fromEntries(languages.map(language => [language.isMain ? 'root' : language.code, {
	label: `${language.flag} ${language.name}`,
	lang: language.code,
	link: language.isMain ? '/' : `/${language.code}/`,
	title: pageTitle(language.file),
	description: pageDescription(language.file),
	themeConfig: localeTheme(language),
}]));

export default defineConfig({
	base,
	cleanUrls: true,
	lastUpdated: true,
	rewrites,
	srcExclude: ['.github/**'],
	locales,
	// The lists are not translations of each other, so the language menu opens the list of that language.
	i18nRouting: false,
	head: [
		['link', {rel: 'icon', type: 'image/svg+xml', href: logo}],
		['meta', {name: 'theme-color', content: '#7b1e2b'}],
	],
	markdown: {
		// List entries may contain braces, which must not be read as attributes.
		attrs: {disable: true},
		anchor: {slugify},
		config(md) {
			md.use(markdownPlugin, {base});
		},
	},
	themeConfig: {
		logo: {src: logo, alt: 'IC XC NIKA'},
		socialLinks: [{icon: 'github', link: repository}],
		search: {
			provider: 'local',
			options: {
				detailedView: true,
				miniSearch: {
					options: {
						// Finds "carti" and "cărți", "Ορθοδοξία" and "ορθοδοξια": accents and case are ignored.
						processTerm: term => term.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase(),
					},
					searchOptions: {
						// Every word must match, so each word typed narrows the results.
						combineWith: 'AND',
						fuzzy: 0.2,
						prefix: true,
						boost: {title: 4, text: 2, titles: 1},
					},
				},
				locales: Object.fromEntries(languages.map(language => [
					language.isMain ? 'root' : language.code,
					{translations: searchTranslations(language.code)},
				])),
			},
		},
	},
});
