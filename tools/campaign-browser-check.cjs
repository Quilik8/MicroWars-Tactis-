const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
(async()=>{
 const dir=path.resolve('docs/evidence/campaign');fs.mkdirSync(dir,{recursive:true});
 const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
 const browser=await chromium.launch({executablePath,headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--no-sandbox']});
 try {
 const page=await browser.newPage({viewport:{width:1280,height:720},hasTouch:true}),errors=[];
 page.on('pageerror',e=>{errors.push(String(e));console.error('PAGE ERROR',String(e));});page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:5173');console.log('page loaded');
 await page.waitForFunction(()=>window.campaign?.visuals,null,{timeout:90000});
 console.log('runtime initialized');await page.click('#btnCampaign');await page.locator('.faction-card').first().click();await page.screenshot({path:path.join(dir,'faction-profiles.png')});await page.click('#btnConfirmFaction');
 await page.waitForSelector('#campaignScreen.active');
 assert.equal(await page.locator('.garden-cell').count(),300);console.log('atlas ready');
 await page.screenshot({path:path.join(dir,'garden-1280.png')});
 await page.setViewportSize({width:1920,height:1080});await page.screenshot({path:path.join(dir,'garden-1920.png')});
 assert.equal(await page.locator('#gardenContext').isVisible(),false);
 assert.equal(await page.locator('.garden-water>path').count(),6);
 const initialView=await page.locator('#gardenAtlas').getAttribute('viewBox');assert.ok(Number(initialView.split(' ')[2])>=1120);
 await page.click('[data-action="controls"]');assert.equal(await page.locator('.garden-header').isVisible(),false);await page.screenshot({path:path.join(dir,'garden-controls-hidden.png')});await page.click('[data-action="controls"]');assert.equal(await page.locator('.garden-header').isVisible(),true);
 await page.click('[data-action="fit"]');await page.screenshot({path:path.join(dir,'garden-overview.png')});
 await page.evaluate(()=>window.testLandPolygon=document.querySelector('.garden-cell polygon'));
 await page.click('[data-action="next"]');assert.equal(await page.locator('#gardenContext').isVisible(),true);
 await page.click('.garden-panel-close');assert.equal(await page.locator('#gardenContext').isVisible(),false);
 await page.click('[data-action="panel"]');assert.equal(await page.locator('#gardenContext').isVisible(),true);
 assert.equal(await page.evaluate(()=>window.testLandPolygon===document.querySelector('.garden-cell polygon')),true);assert.equal(await page.evaluate(()=>campaign.game.app.ticker.started),false);
 // Real drag/drop stages a saved order; only End turn executes it.
 const skirmishBefore=await page.evaluate(()=>localStorage.getItem('microwars_save'));
 const ids=await page.evaluate(()=>{const m=campaign.state.model,a=m.data.armies.find(a=>a.faction===m.data.playerFaction);a.trainingLevel=2;const target=m.node(a.territory).neighbors[0];m.node(target).owner='neutral';m.node(target).cleared=false;m.node(target).defended=true;m.node(target).type='ordinary';campaign.state.save();campaign.visuals.panelOpen=false;campaign.visuals.render();campaign.visuals.frame(a.territory);return {army:a.id,origin:a.territory,target};});
 const point=async id=>page.evaluate(id=>{const n=campaign.state.model.node(id),p=new DOMPoint(n.x,n.y).matrixTransform(document.querySelector('#gardenAtlas').getScreenCTM());return{x:p.x,y:p.y};},id);
 const dragTo=async id=>{const box=await page.locator(`[data-army-id="${ids.army}"] .army-hit`).boundingBox(),dest=await point(id);await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(dest.x,dest.y,{steps:12});await page.mouse.up();};
 await dragTo(ids.target);assert.equal(await page.evaluate(()=>campaign.state.data.plannedMoves.length),1);assert.equal(await page.evaluate(()=>campaign.state.data.armies[0].territory),ids.origin);assert.equal(await page.evaluate(()=>!!campaign.state.data.pending),false);
 await page.screenshot({path:path.join(dir,'drag-staged.png')});await dragTo(ids.origin);assert.equal(await page.evaluate(()=>campaign.state.data.plannedMoves.length),0);await dragTo(ids.target);
 await page.reload();await page.waitForFunction(()=>window.campaign?.visuals,null,{timeout:90000});await page.click('#btnCampaign');assert.equal(await page.evaluate(()=>campaign.state.data.plannedMoves.length),1);
 await page.evaluate(()=>campaign.visuals.fast=true);await page.click('[data-action=end]');assert.equal(await page.locator('[data-action=endConfirm]').count(),0);
 await page.waitForFunction(()=>!!campaign.state.data.resultNotice,null,{timeout:15000});assert.equal(await page.evaluate(()=>campaign.game.app.ticker.started),false);assert.equal(await page.locator('[data-action=move]').count(),0);
 await page.screenshot({path:path.join(dir,'automatic-result.png')});assert.ok(await page.evaluate(target=>campaign.state.data.armies.some(a=>a.territory===target&&!a.ready),ids.target));await page.click('[data-action=ack]');
 await page.waitForFunction(()=>campaign.state.data.turn>=2||!!campaign.state.data.resultNotice,null,{timeout:45000});while(await page.evaluate(()=>!!campaign.state.data.resultNotice)){await page.click('[data-action=ack]');await page.waitForFunction(()=>campaign.state.data.turn>=2||!!campaign.state.data.resultNotice,null,{timeout:45000});}
 assert.equal(await page.evaluate(()=>localStorage.getItem('microwars_save')),skirmishBefore);assert.ok(await page.evaluate(()=>campaign.state.data.turn>=2));
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('.garden-marker.capital circle:not(.marker-hit)').getBoundingClientRect().width>=24,null,{timeout:10000});
 
 const marker=await page.locator('.garden-marker.capital circle:not(.marker-hit)').first().boundingBox();assert.ok(marker.width>=24,JSON.stringify(marker));
 await page.screenshot({path:path.join(dir,'garden-mobile.png')});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('[data-action="next"]').click();await page.locator('#gardenAtlas').focus();await page.keyboard.press('ArrowRight');
 await page.screenshot({path:path.join(dir,'garden-mobile-selected.png')});
 // Actual mouse pan and wheel zoom cannot execute a strategic order.
 const beforeBox=await page.locator('#gardenAtlas').getAttribute('viewBox');
 const svgBox=await page.locator('#gardenAtlas').boundingBox();
 const panStart=await page.evaluate(()=>{for(const y of [160,210,260])for(const x of [30,80,130,180,230]){const e=document.elementFromPoint(x,y);if(e?.closest('#gardenAtlas')&&!e.closest('[data-map-marker]'))return{x,y};}throw Error('No empty map surface');});await page.mouse.move(panStart.x,panStart.y);await page.mouse.down();await page.mouse.move(panStart.x+45,panStart.y+30,{steps:5});await page.mouse.up();
 assert.notEqual(await page.locator('#gardenAtlas').getAttribute('viewBox'),beforeBox);
 await page.mouse.wheel(0,-180);await page.locator('[data-action="fit"]').click();
 const cdp=await page.context().newCDPSession(page);
 const pinchBefore=await page.locator('#gardenAtlas').getAttribute('viewBox');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:130,y:250},{x:230,y:250}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:90,y:250},{x:270,y:250}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.notEqual(await page.locator('#gardenAtlas').getAttribute('viewBox'),pinchBefore);
 // Persistent commander and army identities are independently editable.
 await page.evaluate(()=>{const m=campaign.state.model;campaign.visuals.select(m.data.armies.find(a=>a.faction===m.data.playerFaction).territory);});
 await page.locator('[data-army-name]').fill('Guardia del jardín');await page.locator('[data-army-name]').press('Tab');
 await page.locator('[data-commander-name]').fill('Ámbar');await page.locator('[data-commander-name]').press('Tab');
 await page.screenshot({path:path.join(dir,'army-identity-mobile.png')});
 assert.equal(await page.evaluate(()=>campaign.state.model.commander(campaign.state.data.armies.find(a=>a.faction===campaign.state.data.playerFaction)).name),'Ámbar');
 // Language changes use the existing app event.
 for(const language of ['en','pt-BR','zh-CN']){
  await page.evaluate(async language=>{const {setLanguage}=await import('/src/i18n/translations.js');setLanguage(language);campaign.visuals.render();},language);
  assert.ok(!(await page.locator('#campaignScreen').innerText()).includes('undefined'));
 }
 assert.deepEqual(errors,[]);const report={status:'PASS',territories:300,viewports:['1280x720','1920x1080','390x844'],scenarios:['v5 automatic campaign','independent army and commander naming','300 land territories','water geometry','optional panel','complete initial garden','overlay controls','collapsible controls','drag/drop staging','return to origin','draft reload','end turn commits orders','automatic outcome','RTS ticker remains stopped','save/load','rival turn','marker size','keyboard','pan','pinch','languages','separate skirmish progress'],errors,evidence:dir};fs.writeFileSync(path.join(dir,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
