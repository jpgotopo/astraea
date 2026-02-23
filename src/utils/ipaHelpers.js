/**
 * Phonetix Logic: Browser-compatible IPA transcription.
 */

let englishDict = {};
let isDictLoading = false;

/**
 * Loads the English IPA dictionary from the public folder.
 */
export const loadEnglishDict = async () => {
    if (Object.keys(englishDict).length > 0 || isDictLoading) return;

    isDictLoading = true;
    try {
        const response = await fetch('/ipadict.txt');
        const text = await response.text();
        const lines = text.split('\n');

        const dict = {};
        lines.forEach(line => {
            const parts = line.split(/\s+/);
            if (parts.length >= 2) {
                dict[parts[0].toLowerCase()] = parts[1];
            }
        });
        englishDict = dict;
        console.log(`Phonetix: Loaded ${Object.keys(englishDict).length} English IPA entries.`);
    } catch (err) {
        console.error('Phonetix Error: Failed to load IPA dictionary', err);
    } finally {
        isDictLoading = false;
    }
};

/**
 * Improved Spanish rule-based IPA transcription.
 */
const spanishToIpa = (text) => {
    let ipa = text.toLowerCase()
        .replace(/h/g, '')
        .replace(/v/g, 'b')
        .replace(/ll/g, 'ʝ')
        .replace(/y/g, 'ʝ')
        .replace(/rr/g, 'r')
        .replace(/r/g, 'ɾ')
        .replace(/ñ/g, 'ɲ')
        .replace(/ch/g, 'tʃ')
        .replace(/qu[eé]/g, 'ke')
        .replace(/qu[ií]/g, 'ki')
        .replace(/c[aáoóuú]/g, (m) => 'k' + m[1])
        .replace(/c[eéií]/g, (m) => 's' + m[1])
        .replace(/g[aáoóuú]/g, (m) => 'ɡ' + m[1])
        .replace(/g[eéií]/g, (m) => 'x' + m[1])
        .replace(/j/g, 'x')
        .replace(/z/g, 's')
        // Vowels and accents
        .replace(/á/g, 'a')
        .replace(/é/g, 'e')
        .replace(/í/g, 'i')
        .replace(/ó/g, 'o')
        .replace(/ú/g, 'u')
        .replace(/ü/g, 'u');

    return ipa;
};

/**
 * Main transcription function.
 */
export const transcribeToIpa = (text, language = 'en') => {
    if (!text) return '';

    const words = text.toLowerCase().split(/\s+/);

    if (language === 'es') {
        return words.map(spanishToIpa).join(' ');
    }

    // English lookup
    const ipaWords = words.map(word => {
        const cleanWord = word.replace(/[^a-z]/g, '');
        let result = englishDict[cleanWord];

        // Check for variations like word(1), word(2) if primary not found
        if (!result) {
            result = englishDict[cleanWord + '(1)'] || cleanWord;
        }

        return result;
    });

    return ipaWords.join(' ');
};
