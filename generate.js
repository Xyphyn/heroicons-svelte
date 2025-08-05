#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SVG_ROOT = './node_modules/heroicons';
const OUTPUT_DIR = './dist';
const ICONS_DIR = path.join(OUTPUT_DIR, 'icons');

const SIZE_MAPPINGS = {
    '16': 'micro',
    '20': 'mini',
    '24': 'outline'
};

function toPascalCase(str) {
    return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

function parseSvgContent(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    // Remove XML declaration and comments
    content = content
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();

    // Extract SVG attributes
    const svgMatch = content.match(/<svg([^>]*)>/);
    if (!svgMatch) return null;

    const svgAttributes = {};
    const attributeMatches = svgMatch[1].matchAll(/(\w+(?:-\w+)*)="([^"]*)"/g);

    for (const match of attributeMatches) {
        if (match[1] == "xmlns" || match[1] == "aria-hidden" || match[1] == "data-slot") continue
        svgAttributes[match[1]] = match[2];
    }

    // Extract path elements
    const pathElements = [];
    const pathMatches = content.matchAll(/<path([^>]*)\/?>/g);

    for (const match of pathMatches) {
        const pathAttributes = {};
        const pathAttributeMatches = match[1].matchAll(/(\w+(?:-\w+)*)="([^"]*)"/g);

        for (const attrMatch of pathAttributeMatches) {
            pathAttributes[attrMatch[1]] = attrMatch[2];
        }

        if (Object.keys(pathAttributes).length > 0) {
            pathElements.push(pathAttributes);
        }
    }

    return {
        a: svgAttributes,
        path: pathElements
    };
}

function readSvgContent(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    content = content
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();

    if (!content.includes('fill="currentColor"') && !content.includes('stroke="currentColor"')) {
        if (content.includes('fill="none"')) {
            content = content.replace('<svg', '<svg stroke="currentColor"');
        } else {
            content = content.replace('<svg', '<svg fill="currentColor"');
        }
    }

    return content;
}

function generateIcons() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.mkdirSync(ICONS_DIR, { recursive: true });

    const iconMap = new Map();

    const sizeDirs = ['16', '20', '24'];

    sizeDirs.forEach(sizeDir => {
        const sizePath = path.join(SVG_ROOT, sizeDir);

        if (!fs.existsSync(sizePath)) {
            return;
        }

        const variants = fs.readdirSync(sizePath).filter(item =>
            fs.statSync(path.join(sizePath, item)).isDirectory()
        );

        variants.forEach(variant => {
            const variantPath = path.join(sizePath, variant);
            const svgFiles = fs.readdirSync(variantPath).filter(file =>
            file.endsWith('.svg')
            );

            let variantName;
            if (sizeDir === '24') {
                variantName = variant;
            } else {
                variantName = SIZE_MAPPINGS[sizeDir];
            }

            console.log(`📁 Processing ${sizeDir}/${variant} -> ${variantName} (${svgFiles.length} icons)`);

            svgFiles.forEach(svgFile => {
                const iconName = path.basename(svgFile, '.svg');
                const pascalName = toPascalCase(iconName);
                const svgPath = path.join(variantPath, svgFile);
                const parsedSvg = parseSvgContent(svgPath);

                if (!parsedSvg) {
                    console.warn(`⚠️  Failed to parse ${svgFile}, skipping...`);
                    return;
                }

                // Initialize icon object if it doesn't exist
                if (!iconMap.has(pascalName)) {
                    iconMap.set(pascalName, {
                        name: pascalName,
                        variants: {}
                    });
                }

                // Add this variant
                iconMap.get(pascalName).variants[variantName] = parsedSvg;
            });
        });
    });

    const iconNames = [];

    iconMap.forEach((iconData, iconName) => {
        const iconContent = `export const ${iconName} = ${JSON.stringify(iconData.variants, null, 2)};`;

        const iconFilePath = path.join(ICONS_DIR, `${iconName}.js`);
        fs.writeFileSync(iconFilePath, iconContent);

        iconNames.push(iconName);
    });

    const iconComponentContent = `
<script>
    let { src, size = "24", mini = false, micro = false, solid = false, variant = null, class: className, style = "", ...rest } = $props()

    let selectedVariant = variant ||
    (micro ? 'micro' :
    mini ? 'mini' :
    solid ? 'solid' :
    'outline');

    let icon = $derived(src?.[selectedVariant] || src?.outline || {});

    let svgAttributes = icon ? {
        ...icon.a,
        ...(className && { class: className }),
        ...(style && { style })
    } : {};
</script>

<svg {...svgAttributes} xmlns="http://www.w3.org/2000/svg" width={size} height={size} aria-hidden="true" {...rest}>
    {#each icon?.path ?? [] as a}
        <path {...a} />
    {/each}
</svg>`;

    fs.writeFileSync(path.join(OUTPUT_DIR, 'Icon.svelte'), iconComponentContent);

    let barrelContent = `export { default as Icon } from './Icon.svelte';
`;

    iconNames.sort().forEach(iconName => {
        barrelContent += `export { ${iconName} } from './icons/${iconName}.js';\n`;
    });

    fs.writeFileSync(path.join(OUTPUT_DIR, 'index.js'), barrelContent);
    console.log('📦 Generated barrel export file');

    let typeDefinitions = `export interface IconVariants {
    outline?: string;
    solid?: string;
    mini?: string;
    micro?: string;
}
export interface IconProps {
    src: IconVariants;
    size?: string | number;
    mini?: boolean;
    micro?: boolean;
    solid?: boolean;
    variant?: 'outline' | 'solid' | 'mini' | 'micro';
    class?: ClassValue;
    style?: string;
}
export type IconSource = IconVariants;
export declare const Icon: import('svelte').Component<IconProps>;
// Icon exports
    `;

    iconNames.sort().forEach(iconName => {
        typeDefinitions += `export declare const ${iconName}: IconVariants;\n`;
    });

    fs.writeFileSync(path.join(OUTPUT_DIR, 'index.d.ts'), typeDefinitions);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    generateIcons();
}

export { generateIcons };
