import { chromium } from '/Users/ashutoshchatterjee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const url='http://127.0.0.1:5174/kontor-tour/';
const out='../.kontor-control';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const report={kind:'source-aware browser integration',runs:[],errors:[]};
const expectedTitles=['First, agree on the amount.','One approval. One more to go.','Approved does not mean paid.','A small credit changes the decision.','The old instruction meets a hard stop.','A fresh amount needs a fresh yes.','Two approvals, now for 800.','Check the amount before it leaves.','800 paid. The history stays intact.','Don’t take the tour’s word for it.'];
async function run(width,reducedMotion){
 const context=await browser.newContext({viewport:{width,height:width===390?844:1000},reducedMotion,acceptDownloads:true,permissions:['clipboard-read','clipboard-write']});
 const requests=[],badRequests=[],errors=[],observations=[];
 await context.route('**/*',route=>{const r=route.request();requests.push({url:r.url(),method:r.method(),type:r.resourceType()});if(!r.url().startsWith(url)||r.method()!=='GET'||/\/api\//.test(r.url())){badRequests.push(r.url());return route.abort();}return route.continue();});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('websocket',w=>badRequests.push(w.url()));
 const capture=async(name)=>{await page.screenshot({path:`${out}/tour-integration-${width}-${name}.png`,fullPage:false});};
 const snap=async()=>page.evaluate(()=>({title:document.querySelector('.tour-guide h1')?.textContent,chapter:document.querySelector('[aria-current="step"]')?.textContent,overflow:document.documentElement.scrollWidth>innerWidth,scrollWidth:document.documentElement.scrollWidth,focus:document.activeElement?.textContent?.trim().slice(0,100),dialog:!!document.querySelector('dialog[open]'),announcement:document.querySelector('[aria-live="polite"]')?.textContent,panel:document.querySelector('.approval-panel')?.textContent,invoice:document.querySelector('.paper-total')?.textContent,evidenceCount:document.querySelectorAll('.history-event').length}));
 try{
 await page.goto(url);await page.getByRole('button',{name:'Follow the payment'}).waitFor();await capture('welcome');
 assert((await page.locator('body').innerText()).includes('they submit no transactions'));assert(!(await snap()).overflow);
 await page.getByRole('button',{name:'Follow the payment'}).focus();await page.keyboard.press('Enter');
 for(let i=0;i<10;i++){
  await page.waitForFunction(t=>document.querySelector('.tour-guide h1')?.textContent===t,expectedTitles[i]);
  const s=await snap();observations.push({step:i+1,...s});assert(!s.overflow,`overflow at ${i+1}`);assert(s.chapter);assert(s.announcement?.includes(expectedTitles[i]));
  if(i!==7)assert.equal(await page.locator('.tour-guide h1').evaluate(e=>e===document.activeElement),true,`focus at ${i+1}`);
  if([0,3,4,7,8,9].includes(i))await capture(`step-${i+1}`);
  if(i===7){assert(s.dialog);for(let j=0;j<8;j++){await page.keyboard.press(j%2?'Shift+Tab':'Tab');assert(await page.evaluate(()=>!!document.activeElement?.closest('dialog')),'modal focus escaped');}await page.getByRole('dialog').getByRole('button',{name:'Show recorded payment result',exact:true}).click();}
  else if(i<9)await page.locator('.tour-guide-actions button').click();
 }
 // Evidence identities, actual browser download, all local disclosures/copy and tabs.
 const fixture=JSON.parse(await fs.readFile('tour/public/recorded-evidence.json','utf8'));
 const links=await page.locator('a[href]').evaluateAll(as=>as.map(a=>({text:a.textContent,href:a.href,download:a.hasAttribute('download')})));
 const explorerLinks=links.filter(l=>l.href.startsWith('https://explorer.solana.com/tx/'));
 for(const link of explorerLinks){const u=new URL(link.href);assert.equal(u.searchParams.get('cluster'),'devnet');assert(fixture.state.evidence.some(e=>u.pathname.endsWith(e.signature)));}
 assert(explorerLinks.some(l=>l.href.includes(fixture.state.settlement.signature)));
 const dp=page.waitForEvent('download');await page.getByRole('link',{name:/03 \/ THE RECORD/}).click();const download=await dp;const path=await download.path();assert.deepEqual(JSON.parse(await fs.readFile(path,'utf8')),fixture);
 for(const d of await page.locator('details > summary').all())await d.click();
 const copies=page.getByRole('button',{name:/^Copy /});for(const b of await copies.all())await b.click();
 await page.getByRole('tab',{name:'Overview',exact:true}).click();await page.getByRole('tab',{name:'Overview',exact:true}).press('ArrowRight');assert.equal(await page.getByRole('tab',{name:/Evidence/}).getAttribute('aria-selected'),'true');
 await page.getByRole('button',{name:'All payables',exact:true}).click();for(const name of ['To pay','Paid','All payables'])await page.locator('.list-tabs').getByRole('button',{name:new RegExp('^'+name)}).click();await page.locator('.invoice-row').click();
 // Back and direct chapters deterministically restore expected scene.
 await page.locator('.tour-back').click();assert.equal((await snap()).title,expectedTitles[8]);
 for(const [chapter,title] of [['Credit',expectedTitles[3]],['Block',expectedTitles[4]],['Reapprove',expectedTitles[5]],['Approve',expectedTitles[0]]]){await page.getByRole('navigation',{name:'Tour chapters'}).getByRole('button',{name:new RegExp(chapter+'$')}).click();assert.equal((await snap()).title,title);}
 await page.getByRole('navigation',{name:'Tour chapters'}).getByRole('button',{name:/Pay$/}).click();assert(await page.getByRole('dialog').isVisible());await page.keyboard.press('Escape');assert.equal(await page.locator('dialog[open]').count(),0);await page.locator('.tour-guide-actions button').click();assert.equal((await snap()).title,expectedTitles[8]);
 await page.getByRole('button',{name:/Restart/}).first().click();assert.equal((await snap()).title,expectedTitles[0]);
 await page.getByRole('button',{name:'Kontor tour home'}).click();await page.getByRole('button',{name:'Inspect recorded evidence'}).click();assert.equal((await snap()).title,expectedTitles[9]);
 const forbidden=await page.getByRole('button',{name:/^(Approve |Apply credit|Test previous approval|Save approved payment|Reset workspace|Check status|Pay 800)/}).count();assert.equal(forbidden,0);
 report.runs.push({width,reducedMotion,status:'PASS',observations,requests,badRequests,errors,download:download.suggestedFilename(),explorerLinkCount:explorerLinks.length,finalLinks:links});
 assert.equal(badRequests.length,0);assert.equal(errors.length,0);
 }catch(e){report.runs.push({width,reducedMotion,status:'FAIL',failure:String(e),observations,requests,badRequests,errors});await capture('failure');}
 await context.close();
}
try{await run(1440,'no-preference');await run(390,'reduce');}finally{await browser.close();await fs.writeFile('research/tour/integration-browser-results.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.runs.map(({width,status,failure,observations,requests,badRequests,errors})=>({width,status,failure,steps:observations.length,requests,badRequests,errors})),null,2));}
