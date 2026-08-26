import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Помечает ESM-сборку как модульную.
 *
 * Сам пакет объявлен как "commonjs" ради NestJS, поэтому файлы в dist/esm
 * Node без этой отметки трактовал бы как CommonJS и падал на import/export.
 */
const target = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/esm/package.json');
writeFileSync(target, JSON.stringify({ type: 'module' }, null, 2) + '\n');
console.log('dist/esm помечен как ESM');
