export type TextDirection = 'rtl' | 'ltr';

export function detectTextDirection(
	text: string,
	defaultDir: TextDirection = 'ltr'
): TextDirection {
	if (!text || typeof text !== 'string') {
		return 'ltr';
	}

	//  Remove neutral/weak characters
	const neutralChars = /^[\s\d!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]+/;
	const cleanText = text.replace(neutralChars, '');

	if (!cleanText) {
		return defaultDir;
	}

	// \u0590-\u05FF: Hebrew
	// \u0600-\u06FF: Arabic
	// \u0700-\u074F: Syriac
	// \u0750-\u077F: Arabic Supplement
	// \u0780-\u07BF: Thaana
	// \u07C0-\u07FF: N'Ko
	// \u08A0-\u08FF: Arabic Extended-A
	// \uFB1D-\uFDFF: Hebrew & Arabic Presentation Forms-A
	// \uFE70-\uFEFF: Arabic Presentation Forms-B
	const rtlRegex =
		/^[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u07C0-\u07FF\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

	return rtlRegex.test(cleanText) ? 'rtl' : 'ltr';
}
