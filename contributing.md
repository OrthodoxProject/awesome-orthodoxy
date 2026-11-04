# Contribution Guidelines

Thank you for helping. Please read these rules before you open a pull request.

## Where to Add a Resource

- Add a resource to the list of its language.
  - English and international resources go in [README.md](README.md).
  - Other languages go in `lists/<code>/README.md`, for example [lists/ro/README.md](lists/ro/README.md).
- Open one pull request per resource, or per small group of related resources.

## What to Add

- Resources of the canonical Eastern Orthodox Churches: official websites, texts, media, music, art, and software.
- Only active, maintained, and useful resources. No dead links and no placeholder sites.
- No personal pages, shops (except church publishers), or sites that only collect donations.
- When two Orthodox jurisdictions claim the same territory, list the official websites of both, without comment.

## How to Add It

Use this format:

```md
- [Name](https://link) - Description.
```

- Put the entry at the bottom of the right section.
- Keep the description short and objective. It starts with a capital letter and ends with a period.
- Do not start the description with the name of the resource.
- Do not use marketing words such as "best" or "amazing".
- Use only the sections from [lists/structure.json](lists/structure.json), in the same order, with the exact title for that language.
- Do not leave a section empty. When you add the first entry of a section, also add the section to `## Contents`.
- When a section has subsections, put its entries only in the subsections.

## Add a New Language

1. Create `lists/<code>/README.md` and `lists/<code>/contributing.md`, where `<code>` is the [ISO 639-1](https://en.wikipedia.org/wiki/List_of_ISO_639_language_codes) code of the language.
2. Add the language (name, flag, file) and a title for every section to [lists/structure.json](lists/structure.json).
3. Add the new list to the `Lists by Language` section of [README.md](README.md).
4. Start from an existing list: title, badge, logo, description, language bar, and `## Contents` (always in English).
5. Update the language bar in every list. `npm test` prints the exact line each list needs.

## Check Your Changes

The checks run automatically on every pull request. To run them locally you need [Node.js](https://nodejs.org) 20.11 or newer:

```sh
npm install
npm test
```

`npm install` also adds a Git hook that runs `npm test` before each commit.

`npm test` checks that:

- every list passes the [awesome-lint](https://github.com/sindresorhus/awesome-lint) rules;
- every list uses the sections from `lists/structure.json`, in order, without empty sections;
- every list has the same language bar, and the main list links to every language in `Lists by Language`.

On pull requests, CI also runs the official `awesome-lint` on `README.md` and checks the links of the changed files with [lychee](https://lychee.cli.rs). The links of all lists are checked every week.
