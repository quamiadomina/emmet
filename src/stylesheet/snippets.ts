import parse, { CSSValue, ParseOptions } from '@emmetio/css-abbreviation';

export type CSSSnippet = CSSSnippetRaw | CSSSnippetProperty;

export const enum CSSSnippetType {
    Raw = 'Raw',
    Property = 'Property'
}

interface CSSSnippetBase {
    type: CSSSnippetType;
    key: string;
}

export interface CSSSnippetRaw extends CSSSnippetBase {
    type: CSSSnippetType.Raw;
    value: string;
}

export interface CSSSnippetProperty extends CSSSnippetBase {
    type: CSSSnippetType.Property;
    property: string;
    value: CSSValue[][];
    dependencies: CSSSnippetProperty[];
}

export interface CSSKeywordRef {
    keyword: string;

    /** Reference to CSS snippet value which contains current keyword */
    index: number;
}

const reProperty = /^([a-z-]+)(?:\s*:\s*([^\n\r]+))?$/;
const opt: ParseOptions = { value: true };

/**
 * Creates structure for holding resolved CSS snippet
 */
export default function createSnippet(key: string, value: string): CSSSnippet {
    // A snippet could be a raw text snippet (e.g. arbitrary text string) or a
    // CSS property with possible values separated by `|`.
    // In latter case, we have to parse snippet as CSS abbreviation
    const m = value.match(reProperty);
    if (m) {
        return {
            type: CSSSnippetType.Property,
            key,
            property: m[1],
            value: m[2].split('|').map(parseValue),
            dependencies: []
        };
    }

    return { type: CSSSnippetType.Raw, key, value };
}

/**
 * Returns list of unique keywords for current CSS snippet and its dependencies
 */
export function getKeywords(snippet: CSSSnippet): CSSKeywordRef[] {
    const stack: CSSSnippetProperty[] = [];
    const result: CSSKeywordRef[] = [];
    const lookup: Set<string> = new Set();
    let i = 0;

    if (snippet.type === CSSSnippetType.Property) {
        // Scan valid CSS-properties only
        stack.push(snippet);
    }

    while (i < stack.length) {
        // NB Keep items in stack instead of push/pop to avoid possible
        // circular references
        const item = stack[i++];

        // Extract possible keywords from snippet values
        for (let index = 0; index < item.value.length; index++) {
            for (const keyword of keywordsFromValue(item.value[index])) {
                if (!lookup.has(keyword)) {
                    result.push({ index, keyword });
                    lookup.add(keyword);
                }
            }
        }

        // Add dependencies into scan stack
        for (const dep of item.dependencies) {
            if (!stack.includes(dep)) {
                stack.push(dep);
            }
        }
    }

    return result;
}

function keywordsFromValue(value: CSSValue[]): string[] {
    const keywords: string[] = [];
    for (const v of value) {
        for (const kw of v.value) {
            if (kw.type === 'Literal') {
                keywords.push(kw.value);
            } else if (kw.type === 'FunctionCall') {
                keywords.push(kw.name);
            }
        }
    }

    return keywords;
}

/**
 * Nests more specific CSS properties into shorthand ones, e.g.
 * `background-position-x` -> `background-position` -> `background`
 */
export function nest(snippets: CSSSnippet[]): CSSSnippet[] {
    snippets = snippets.sort(snippetsSort);
    const stack: CSSSnippetProperty[] = [];
    let prev: CSSSnippet;

    // For sorted list of CSS properties, create dependency graph where each
    // shorthand property contains its more specific one, e.g.
    // background -> background-position -> background-position-x
    for (const cur of snippets.filter(isProperty)) {
        // Check if current property belongs to one from parent stack.
        // Since `snippets` array is sorted, items are perfectly aligned
        // from shorthands to more specific variants
        while (stack.length) {
            prev = stack[stack.length - 1];

            if (cur.property.startsWith(prev.property!)
                && cur.property.charCodeAt(prev.property!.length) === 45 /* - */) {
                prev.dependencies.push(cur);
                stack.push(cur);
                break;
            }

            stack.pop();
        }

        if (!stack.length) {
            stack.push(cur);
        }

    }

    return snippets;
}

/**
 * A sorting function for array of snippets
 */
function snippetsSort(a: CSSSnippet, b: CSSSnippet): number {
    if (a.key === b.key) {
        return 0;
    }

    return a.key < b.key ? -1 : 1;
}

function parseValue(value: string): CSSValue[] {
    return parse(value.trim(), opt)[0].value;
}

function isProperty(snippet: CSSSnippet): snippet is CSSSnippetProperty {
    return snippet.type === CSSSnippetType.Property;
}