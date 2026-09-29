export async function copyTextToClipboard(text, {
	clipboard = globalThis.navigator?.clipboard,
	documentRef = globalThis.document,
} = {}) {
	if (typeof text !== 'string' || !text.length) return false;
	if (typeof clipboard?.writeText === 'function') {
		try {
			await clipboard.writeText(text);
			return true;
		} catch {
			// Some Windy WebViews expose the API but reject writes without permission.
		}
	}
	if (typeof documentRef?.createElement !== 'function' || typeof documentRef.execCommand !== 'function'
		|| typeof documentRef.body?.appendChild !== 'function') return false;

	const textarea = documentRef.createElement('textarea');
	textarea.value = text;
	textarea.setAttribute('readonly', '');
	textarea.setAttribute('aria-hidden', 'true');
	Object.assign(textarea.style, {
		position: 'fixed',
		left: '-10000px',
		top: '0',
		width: '1px',
		height: '1px',
		opacity: '0',
		pointerEvents: 'none',
	});
	documentRef.body.appendChild(textarea);
	let copied = false;
	try {
		textarea.focus({ preventScroll: true });
		textarea.select();
		textarea.setSelectionRange(0, textarea.value.length);
		copied = documentRef.execCommand('copy') === true;
	} catch {
		copied = false;
	} finally {
		if (typeof textarea.remove === 'function') textarea.remove();
		else textarea.parentNode?.removeChild(textarea);
	}
	return copied;
}
