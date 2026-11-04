// Validates every list declared in lists/structure.json:
// 1. awesome-lint rules (the GitHub metadata rule runs separately in CI).
// 2. The shared structure: same sections, in the same order, with the titles from structure.json.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import lint from 'awesome-lint/index.js';
import {createConfig} from 'awesome-lint/config.js';
import {createRules} from 'awesome-lint/rules/index.js';
import githubRule from 'awesome-lint/rules/github.js';
import balancedPunctuationRule from 'awesome-lint/rules/balanced-punctuation.js';

process.chdir(path.resolve(import.meta.dirname, '..'));

const structure = JSON.parse(fs.readFileSync('lists/structure.json', 'utf8'));
const languages = Object.entries(structure.languages);
const mainLanguage = languages.find(([, language]) => language.file === 'README.md')[0];
const rules = createRules().filter(([rule]) => rule !== githubRule);
const mainConfig = createConfig(rules);

// Lists in other languages use local quotes („…”, „…“, «…»), which awesome-lint does not know.
const languageListConfig = createConfig(rules.map(([rule, options]) => (
	rule === balancedPunctuationRule ? [rule, ['error', [['«', '»'], '"']]] : [rule, options]
)));

let errors = 0;
let warnings = 0;

function report(file, line, message, isWarning = false) {
	const location = line ? `${file}:${line}` : file;
	console.log(`${location}  ${isWarning ? 'warning' : 'error'}  ${message}`);

	if (isWarning) {
		warnings++;
	} else {
		errors++;
	}
}

// awesome-lint only accepts ASCII capitals at the start of a description,
// so it rejects descriptions that start with Ș, Î, Greek or Cyrillic letters.
function isNonAsciiCasingFalsePositive(message, lines) {
	if (message.ruleId !== 'awesome-list-item' || !message.reason.includes('valid casing')) {
		return false;
	}

	const description = lines[message.line - 1].slice(message.column - 1).replace(/^ - /, '');
	return /^[„«"'(]?[\p{Lu}\p{Lt}\p{Lo}]/u.test(description);
}

async function runAwesomeLint(code, file) {
	const config = code === mainLanguage ? mainConfig : languageListConfig;
	const vfiles = await lint({filename: file, config});

	for (const vfile of vfiles) {
		const name = path.relative('.', vfile.path).replaceAll('\\', '/');
		const lines = String(vfile.value).split(/\r?\n/);

		for (const message of vfile.messages) {
			if (!isNonAsciiCasingFalsePositive(message, lines)) {
				report(name, message.line, `${message.reason} (${message.ruleId})`, message.ruleId === 'awesome-spell-check');
			}
		}
	}
}

function expectedHeadings(code) {
	const expected = [];

	if (code === mainLanguage) {
		expected.push({depth: 2, id: 'languages', title: structure.languagesSection});
	}

	for (const section of structure.sections) {
		expected.push({depth: 2, id: section.id, title: section.title[code], hasSubsections: Boolean(section.subsections)});

		for (const subsection of section.subsections ?? []) {
			expected.push({depth: 3, id: subsection.id, parent: section.id, title: subsection.title[code]});
		}
	}

	return expected;
}

function readHeadings(lines) {
	const headings = [];

	for (const [index, line] of lines.entries()) {
		const heading = /^(#{2,}) (.+)$/.exec(line);

		if (heading) {
			headings.push({depth: heading[1].length, title: heading[2].trim(), line: index + 1, entries: 0});
		} else if (headings.length > 0 && line.startsWith('- [')) {
			headings.at(-1).entries++;
		}
	}

	return headings;
}

function checkSections(code, file, lines) {
	const expected = expectedHeadings(code);
	const headings = readHeadings(lines);
	const sections = headings.filter(heading => heading.title !== 'Contents');

	if (!headings.some(heading => heading.depth === 2 && heading.title === 'Contents')) {
		report(file, 0, 'Missing "## Contents" section');
	}

	let previous;
	let parent;

	for (const [index, heading] of sections.entries()) {
		if (heading.depth > 3) {
			report(file, heading.line, `Heading "${heading.title}" is too deep, use only ## and ###`);
			continue;
		}

		const found = expected.findIndex(item => item.depth === heading.depth && item.title === heading.title);

		if (found === -1) {
			report(file, heading.line, `Unknown section "${heading.title}", use a "${code}" title from lists/structure.json`);
			continue;
		}

		if (previous && found <= previous.index) {
			report(file, heading.line, `Section "${heading.title}" must come before "${previous.title}", follow the order in lists/structure.json`);
		}

		const item = expected[found];
		previous = {index: found, title: heading.title};

		if (item.depth === 2) {
			parent = item;
		} else if (item.parent !== parent?.id) {
			report(file, heading.line, `Subsection "${heading.title}" is not inside its parent section`);
		}

		const nextIsSubsection = sections[index + 1]?.depth === 3;

		if (item.hasSubsections && heading.entries > 0) {
			report(file, heading.line, `Section "${heading.title}" has subsections, move its entries into one of them`);
		} else if (heading.entries === 0 && !(item.hasSubsections && nextIsSubsection)) {
			report(file, heading.line, `Section "${heading.title}" is empty, remove it or add entries`);
		}
	}
}

// The same language bar appears near the top of every list, with the current language in bold.
function languageBar(code) {
	const folder = path.posix.dirname(structure.languages[code].file);

	return languages.map(([otherCode, language]) => {
		const label = `${language.flag} ${language.name}`;
		return otherCode === code ? `**${label}**` : `[${label}](${path.posix.relative(folder, language.file)})`;
	}).join(' · ');
}

function checkLinks(code, file, text, lines) {
	const bar = languageBar(code);

	if (!lines.includes(bar)) {
		report(file, 0, `Missing or outdated language bar, add this line under the description:\n${bar}`);
	}

	if (code !== mainLanguage) {
		return;
	}

	for (const [otherCode, language] of languages) {
		const url = `${structure.repository}/tree/main/${path.posix.dirname(language.file)}#readme`;

		if (otherCode !== mainLanguage && !text.includes(`](${url})`)) {
			report(file, 0, `"${structure.languagesSection}" is missing the ${language.name} list: ${url}`);
		}
	}
}

function checkStructureFile() {
	const declared = new Set(languages.map(([, language]) => language.file));

	for (const folder of fs.readdirSync('lists', {withFileTypes: true})) {
		if (folder.isDirectory() && !declared.has(`lists/${folder.name}/README.md`)) {
			report(`lists/${folder.name}`, 0, 'Folder is not declared in lists/structure.json');
		}
	}

	for (const [code, language] of languages) {
		if (!language.name || !language.flag || !language.file) {
			report('lists/structure.json', 0, `Language "${code}" needs a name, a flag, and a file`);
		}
	}

	for (const section of structure.sections.flatMap(section => [section, ...(section.subsections ?? [])])) {
		for (const [code] of languages) {
			if (!section.title[code]) {
				report('lists/structure.json', 0, `Section "${section.id}" has no "${code}" title`);
			}
		}
	}
}

checkStructureFile();

for (const [code, language] of languages) {
	if (!fs.existsSync(language.file)) {
		report(language.file, 0, 'File is missing');
		continue;
	}

	const text = fs.readFileSync(language.file, 'utf8');
	const lines = text.split(/\r?\n/);
	await runAwesomeLint(code, language.file);
	checkSections(code, language.file, lines);
	checkLinks(code, language.file, text, lines);
}

console.log(`\n${languages.length} lists checked: ${errors} errors, ${warnings} warnings`);
process.exitCode = errors > 0 ? 1 : 0;
