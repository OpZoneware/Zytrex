/* eslint-disable @typescript-eslint/no-require-imports -- Standalone integration harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { spawn } = require('node:child_process');
require.extensions['.ts'] = (m,f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const { withSandbox } = require('../lib/sandbox.ts');
const { databasePool, tokenHash } = require('../lib/persistence.ts');
const store = require('../lib/store.ts');
const pay = require('../lib/services/payments.ts');
const request = token => new Request('http://localhost/api/session', {method:'POST',headers:token?{cookie:`zytrex_demo=${token}`}:{}});
const delay = ms => new Promise(r=>setTimeout(r,ms));
const snapshot = withSandbox(async()=>Response.json({balance:store.db().accounts[0].available_balance,user:store.currentUser().id}));
if (!process.env.DATABASE_URL || process.env.ZYTREX_TEST_DATABASE !== '1') throw new Error('Use a dedicated migrated test database and set ZYTREX_TEST_DATABASE=1.');
async function worker(mode,token,id) {
  if(mode==='read') return (await snapshot(request(token))).json();
  if(mode==='pay') return (await withSandbox(async()=>Response.json(await pay.authorizeAndExecute(id,store.currentUser(),'123456')))(request(token))).json();
  for(let i=0;i<5;i++) {
    const result=await withSandbox(async()=>{const account=store.db().accounts[0];const before=account.available_balance;await delay(30);account.available_balance=before-100;return Response.json({ok:true});})(request(token));
    assert.equal(result.status,200);
  }
  return {ok:true};
}
function child(mode,token,id='') {
  return new Promise((resolve,reject)=>{
    const processChild=spawn(process.execPath,[__filename,'worker',mode,token,id],{env:process.env,stdio:['ignore','pipe','pipe']});
    let output='',error='';processChild.stdout.on('data',d=>output+=d);processChild.stderr.on('data',d=>error+=d);
    processChild.on('error',reject);processChild.on('close',code=>code?reject(new Error(error)):resolve(JSON.parse(output)));
  });
}
async function main() {
  if(process.argv[2]==='worker') {try {console.log(JSON.stringify(await worker(...process.argv.slice(3))));}finally{await databasePool().end();}return;}
  const tokens=[];
  try {
    const fresh=await snapshot(request());assert.equal(fresh.status,200);
    const token=fresh.headers.get('set-cookie').match(/zytrex_demo=([^;]+)/)[1];tokens.push(token);
    await withSandbox(async()=>{store.setCurrentUser('usr_amara');return Response.json({ok:true});})(request(token));
    const restored=await child('read',token);assert.equal(restored.user,'usr_amara');assert.equal(restored.balance,28450250);
    console.log('PASS a new server process restores identity and balances');
    await Promise.all([child('increment',token),child('increment',token)]);
    assert.equal((await child('read',token)).balance,28449250);
    console.log('PASS cross-process row locking prevents lost updates');
    const failed=await withSandbox(async()=>{store.db().accounts[0].available_balance=1;throw new Error('injected');})(request(token));
    assert.equal(failed.status,503);assert.equal((await child('read',token)).balance,28449250);
    const serverFailure=await withSandbox(async()=>{store.db().accounts[0].available_balance=2;return Response.json({ok:false},{status:500});})(request(token));
    assert.equal(serverFailure.status,500);assert.equal((await child('read',token)).balance,28449250);
    console.log('PASS exceptions and HTTP 500 roll back without losing committed data');
    let paymentIds=[];
    await withSandbox(async()=>{
      store.setCurrentUser('usr_daniel');const d=store.db();d.policies.outside_hours_extra=false;
      const maker=d.users.find(u=>u.role==='operations');
      paymentIds=[20000000,20000000].map(amount=>{
        const p=pay.preparePayment({beneficiary_id:'ben_godwin',amount,purpose:'Persistence regression',requested_by:maker.id,source:'manual'}).payment;
        for(const role of p.required_approvals) assert.equal(pay.decidePayment(p.id,d.users.find(u=>u.role===role),'APPROVED').ok,true);
        return p.id;
      });return Response.json({ok:true});
    })(request(token));
    const payments=await Promise.all(paymentIds.map(id=>child('pay',token,id)));
    assert.equal(payments.filter(p=>p.ok).length,1);
    assert.equal((await child('read',token)).balance,8449200);
    console.log('PASS payments on separate processes cannot overspend shared funds');
    const second=await snapshot(request());const token2=second.headers.get('set-cookie').match(/zytrex_demo=([^;]+)/)[1];tokens.push(token2);
    assert.equal((await second.json()).balance,28450250);
    await databasePool().query('UPDATE zytrex_sandbox_sessions SET expires_at = clock_timestamp() - interval \'1 second\' WHERE token_hash=$1',[tokenHash(token2)]);
    const expired=await snapshot(request(token2));assert.equal(expired.status,401);assert.match(expired.headers.get('set-cookie'),/Max-Age=0/);
    console.log('PASS browsers stay isolated and expired sessions are rejected');
    const saved=await databasePool().query('SELECT token_hash FROM zytrex_sandbox_sessions WHERE token_hash=$1',[tokenHash(token)]);
    assert.equal(saved.rows[0].token_hash.length,64);assert.notEqual(saved.rows[0].token_hash,token);
    const prior=process.env.DATABASE_URL;delete process.env.DATABASE_URL;process.env.VERCEL='1';
    try {assert.equal((await snapshot(request())).status,503);}finally{process.env.DATABASE_URL=prior;delete process.env.VERCEL;}
    console.log('PASS opaque tokens are hashed and deployment fails closed without storage');
  } finally {
    for(const token of tokens) await databasePool().query('DELETE FROM zytrex_sandbox_sessions WHERE token_hash=$1',[tokenHash(token)]);
    await databasePool().end();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
