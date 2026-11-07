import DefaultTheme from 'vitepress/theme';
import {inBrowser} from 'vitepress';
import {nextTick, onMounted} from 'vue';
import './custom.css';

// The catalogs keep their groups in closed <details>. When a link or a search result
// points to a group (or to a heading followed by a group), open it.
function openLinkedGroup() {
	if (!location.hash) {
		return;
	}

	let target;

	try {
		target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
	} catch {
		return;
	}

	const inside = target?.closest('details');
	const next = target?.nextElementSibling;
	const details = inside ?? (next?.tagName === 'DETAILS' ? next : null);

	if (details && !details.open) {
		details.open = true;

		// A closed group has no position on the page, so VitePress could not scroll to it.
		// Scroll after its own scrolling, which runs in the next animation frame.
		if (inside) {
			requestAnimationFrame(() => requestAnimationFrame(() => details.scrollIntoView({block: 'start'})));
		}
	}
}

export default {
	extends: DefaultTheme,
	enhanceApp({router}) {
		if (!inBrowser) {
			return;
		}

		const previous = router.onAfterRouteChange;
		router.onAfterRouteChange = async to => {
			await previous?.(to);
			await nextTick();
			openLinkedGroup();
		};

		window.addEventListener('hashchange', openLinkedGroup);
	},
	setup() {
		onMounted(openLinkedGroup);
	},
};
