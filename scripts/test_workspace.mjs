import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
fs.mkdirSync('artifacts',{recursive:true});
page.on('response',async r=>{if(r.url().includes('/api/')) console.log('API',r.status(),r.url(),(await r.text().catch(()=>'' )).slice(0,700));});
try {
 const health=await context.request.get('http://127.0.0.1:3000/api/health');assert.equal(health.status(),200);
 await page.goto('http://127.0.0.1:3000/login');
 await page.getByRole('button',{name:'Enter Zytrex AI Finance'}).click();
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByText('₦28,450,250.00',{exact:true}).waitFor();
 await page.screenshot({path:'artifacts/desktop.png',fullPage:true});
 const command=page.getByRole('textbox',{name:'Finance command'});
 await command.fill('Pay Godwin Engineering 520k for LASCON');await command.press('Enter');
 const dialog=page.getByRole('dialog',{name:'Payment authorization'});
 await dialog.getByRole('button',{name:'Continue',exact:true}).click();
 await dialog.getByRole('button',{name:/Switch demo role/}).click();
 await dialog.getByRole('button',{name:'Approve payment',exact:true}).click();
 await dialog.getByRole('button',{name:'Authorize payment',exact:true}).click();
 for(const digit of '123456')await dialog.getByRole('button',{name:digit,exact:true}).click();
 await dialog.getByText('Payment sent',{exact:true}).waitFor();
 await page.screenshot({path:'artifacts/payment.png'});
 await dialog.getByRole('button',{name:'Done',exact:true}).click();
 await page.getByText('₦27,930,200.00',{exact:true}).waitFor();
 await page.reload();await page.getByText('₦27,930,200.00',{exact:true}).waitFor();
 for(const width of [390,320]){
   await page.setViewportSize({width,height:844});
   console.log('OVERFLOW',width,await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right})).slice(0,15)));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,`No page overflow at ${width}`);
   await page.getByText('Sandbox',{exact:true}).waitFor();
   await page.screenshot({path:`artifacts/mobile-${width}.png`,fullPage:true});
 }
 await command.fill('What is our balance?');await command.press('Enter');
 await page.getByRole('dialog',{name:'Command result'}).waitFor();
 await page.getByRole('dialog',{name:'Command result'}).getByRole('button',{name:'Close',exact:true}).click();
 // A second browser gets an independent scenario and identity.
 const second=await browser.newContext();const other=await second.newPage();await other.goto('http://127.0.0.1:3000/dashboard');await other.getByText('₦28,450,250.00',{exact:true}).waitFor();await second.close();
 assert.deepEqual(errors,[]);console.log('Desktop, payment, mobile and session-isolation checks passed.');
} catch(error) {await page.screenshot({path:'artifacts/failure.png',fullPage:true});fs.writeFileSync('artifacts/failure.txt',await page.locator('body').innerText());console.log('PAGE',await page.locator('body').innerText(),'ERRORS',errors);throw error;} finally {
 if(process.env.CI){for(const file of fs.readdirSync('artifacts').filter(f=>f.endsWith('.png'))){const preview=await browser.newPage();await preview.goto('file://'+process.cwd()+'/artifacts/'+file);const bytes=await preview.locator('img').screenshot({type:'jpeg',quality:65});console.log('VISUAL_'+file+'='+bytes.toString('base64'));await preview.close();}}
 await browser.close();}
