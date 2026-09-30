import { execFileSync } from 'node:child_process';
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const forbidden = /^(?:\.hackfleet(?:\/|$)|research(?:\/|$)|tasks(?:\/|$)|project-memory(?:\/|$)|AGENTS\.md$|hackfleet\.yaml$|\.github\/workflows\/hackfleet-)/;
const found = files.filter(file => forbidden.test(file));
if (found.length) throw new Error('Process files belong on the process branch: ' + found.join(', '));
console.log('Product tree contains no fleet process files.');
