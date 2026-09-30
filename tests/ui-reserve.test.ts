import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import App, {type TourPresentation} from '../src/App';
import {initialState} from '../server/engine.js';
import type {State} from '../contracts/api.js';
function render(balance:number|null,operation:State['operation']=null){const state=initialState();state.amountDue=800;state.credit=200;state.chain.vaultBalance=balance;state.operation=operation;return renderToStaticMarkup(createElement<{tour?:TourPresentation}>(App,{tour:{state,initialPage:'detail',evidenceHref:'./recorded-evidence.json'} as TourPresentation}));}
test('reserve preview uses actual six-decimal balance and describes a conditional separate return',()=>{const html=render(1000.000001);assert.match(html,/1,000\.000001 Test USD/);assert.match(html,/After a successful 800 Test USD supplier payment, 200\.000001 Test USD would remain for a separate treasury return/);assert.match(html,/Rehearsal setup simulates funding this reserve; no network tokens move/);assert.doesNotMatch(html,/Rehearsal treasury return/);});
test('missing reserve stays unknown rather than inferring funding or credit remainder',()=>{const html=render(null);assert.match(html,/Not recorded/);assert.match(html,/remaining reserve cannot be calculated/);assert.doesNotMatch(html,/would remain|Returned to Hamburg/);});
test('underfunded reserve explains insufficiency without a negative return preview',()=>{const html=render(799.999999);assert.match(html,/799\.999999 Test USD/);assert.match(html,/Insufficient reserve for the 800 Test USD supplier payment/);assert.doesNotMatch(html,/would remain|−0\.000001|-0\.000001/);});
test('pending operation labels last confirmed reserve and suppresses predicted return',()=>{const html=render(1000.000001,{type:'approve',status:'unknown',message:'Awaiting confirmation'});assert.match(html,/Last confirmed vault reserve/);assert.match(html,/1,000\.000001 Test USD/);assert.match(html,/Wait for the current operation to be resolved/);assert.doesNotMatch(html,/would remain/);});
test('exactly funded reserve previews zero without claiming a treasury transfer',()=>{const html=render(800);assert.match(html,/0 Test USD would remain in this vault/);assert.doesNotMatch(html,/would remain for a separate treasury return/);});
