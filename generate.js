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
                const svgContent = readSvgContent(svgPath);

                if (!iconMap.has(pascalName)) {
                    iconMap.set(pascalName, {
                        name: pascalName,
                        variants: {}
                    });
                }

                iconMap.get(pascalName).variants[variantName] = svgContent;
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

    let svgContent = $derived(src?.[selectedVariant] || src?.outline || '');

    let processedSvg = $derived(processSvg(svgContent, size, className, style));

    function processSvg(svg, iconSize, classes, styles) {
        if (!svg) return '';

        let processed = svg;

        const sizeStr = String(iconSize);

        processed = processed
        .replace(/ width="[^"]*"/g, \` width="\${sizeStr}"\`)
        .replace(/ height="[^"]*"/g, \` height="\${sizeStr}"\`)
        .replace(/ width=\d+/g, \` width="\${sizeStr}"\`)
        .replace(/ height=\d+/g, \` height="\${sizeStr}"\`);

        if (!processed.includes(' width=') && !processed.includes(' height=')) {
            processed = processed.replace('<svg', \`<svg width="\${sizeStr}" height="\${sizeStr}"\`);
        }

        if (classes) {
            if (processed.includes('class="')) {
                processed = processed.replace(/class="([^"]*)"/, \`class="$1 \${classes}"\`);
            } else {
                processed = processed.replace('<svg', \`<svg class="\${classes}"\`);
            }
        }

        if (styles) {
            if (processed.includes('style="')) {
                processed = processed.replace(/style="([^"]*)"/, \`style="$1; \${styles}"\`);
            } else {
                processed = processed.replace('<svg', \`<svg style="\${styles}"\`);
            }
        }

        return processed;
    }

</script>

{@html processedSvg}

<style>
    :global(.icon) {
        display: inline-block;
        vertical-align: middle;
        flex-shrink: 0;
    }

    :global(.icon svg) {
        display: block;
    }
</style>`;

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
    class?: string;
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
