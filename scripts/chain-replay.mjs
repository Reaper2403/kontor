// A separate executor process submits captured bytes, with no normal UI/pay path.
import { readFile, writeFile } from 'node:fs/promises';
import { createClient } from '../chain/client.mjs';
import { loadOrCreateKeys } from '../chain/bootstrap.mjs';
const path=process.argv[2];if(!path)throw new Error('Pass public replay-request JSON');
const request=JSON.parse(await readFile(path,'utf8'));
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(request.rpcUrl)&&request.rpcUrl!=='https://api.devnet.solana.com')throw new Error('Only test-network replay allowed');
const directory=process.env.KONTOR_KEY_DIR;if(!directory)throw new Error('Set external KONTOR_KEY_DIR');
const keys=await loadOrCreateKeys(directory),client=createClient({...request,keys,onPrepared:async prepared=>writeFile(`${directory}/replay-inflight.json`,JSON.stringify(prepared),{mode:0o600})});
const result=await client.testPrevious(request.scenario,request.capture);
console.log(JSON.stringify({...result,evidence:{...result.evidence,executorProcess:process.pid,separateExecutor:true}}));
