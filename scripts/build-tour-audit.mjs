import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve('dist-tour');
const files = [];
async function walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), 'Publication cannot contain symlinks');
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full); else files.push(path.relative(root, full));
  }
}
await walk(root);
for (const file of files) {
  assert(/^(index\.html|recorded-evidence\.json|\.nojekyll|assets\/[\w-]+\.(js|css))$/.test(file), `Unexpected public file: ${file}`);
  const text = await fs.readFile(path.join(root, file), 'utf8');
  assert(!/\/Users\/|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sourceMappingURL=/.test(text), `Private metadata or source map in ${file}`);
}
const evidence = JSON.parse(await fs.readFile(path.join(root, 'recorded-evidence.json'), 'utf8'));
const intended = JSON.parse(await fs.readFile('tour/public/recorded-evidence.json', 'utf8'));
assert.deepEqual(evidence, intended, 'Published evidence must match reviewed artifact');
assert.equal(evidence.state.scenarioId, '12a9ddab-2484-41ba-89b3-9654e824a0d8');
assert.equal(evidence.networkProofs.length, 8);
const signatures = new Set(evidence.state.evidence.map(event => event.signature).filter(Boolean));
for (const proof of evidence.networkProofs) {
  assert.equal(proof.scenarioId, evidence.state.scenarioId);
  assert(signatures.has(proof.signature));
}
assert.equal(evidence.state.settlement.amount, 800);
assert.equal(evidence.state.treasuryReturn.amount, 200);
assert.equal(evidence.state.chain.vaultBalance, 0);
assert.notEqual(evidence.state.settlement.signature, evidence.state.treasuryReturn.signature);
assert(evidence.networkProofs.find(proof => proof.action === 'release-remainder').evidence.logs.includes('Program log: Kontor::RemainderReleased amount=200000000'));
assert.equal(evidence.networkProofs.find(proof => proof.action === 'test-previous').evidence.tokenMovement, '0');
const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
assert(!/(?:src|href)=["']\/(?!\/)/.test(html), 'Root-relative assets break repository subpaths');
await fs.writeFile(path.join(root, '.nojekyll'), '');
const bytes = (await Promise.all(files.map(file => fs.stat(path.join(root, file))))).reduce((sum, stat) => sum + stat.size, 0);
console.log(`Tour publication audit passed: ${files.length + (files.includes('.nojekyll') ? 0 : 1)} allowlisted files, ${Math.round(bytes / 1024)} KB, one coherent historical scenario.`);
