/* PewnySzlak — film preferencji → trasa turystyczna (PL).
 * Deterministyczny zegar: seek i nagranie dają tę samą klatkę.
 */
'use strict';
const $ = id => document.getElementById(id);
const clamp = (x, lo=0, hi=1) => Math.max(lo, Math.min(hi,x));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
const out=x=>1-Math.pow(1-clamp(x),4);
const between=(t,a,b)=>clamp((t-a)/(b-a));
const chapters=[0,11,22,36,50];
const names=['Preferencje','Parametry','Trasa','Jazda','Idea'];
const captions=[
  'NAJPIERW PREFERENCJE. POTEM TRASA.',
  'NACHYLENIE, SCHODY, NAWIERZCHNIA — TWOJE LIMITY.',
  'NA PODSTAWIE TEGO: FAJNA TRASA DLA TURYSTY.',
  'JEDZIESZ PO TRASIE, KTÓRA JUŻ SPEŁNIA LIMITY.',
  'PREFERENCJE STERUJĄ TRASĄ. NIE LOS.'
];
let time=0, playing=false, speed=1, last=0, chapter=-1, raf=0;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
function seeded(seed){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}}
const random=seeded(28419);

const map=$('city-map');
let content=`<defs><linearGradient id="water" x2="1" y2="1"><stop stop-color="#557c71"/><stop offset="1" stop-color="#33594e"/></linearGradient><filter id="route-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter><radialGradient id="rider-halo"><stop stop-color="#d5f89b" stop-opacity=".35"/><stop offset="1" stop-color="#d5f89b" stop-opacity="0"/></radialGradient></defs><rect x="-150" y="-100" width="1900" height="1450" rx="100" fill="#2d4031"/>`;
for(let i=0;i<16;i++){const x=random()*1600,y=random()*1250;content+=`<ellipse cx="${x}" cy="${y}" rx="${70+random()*140}" ry="${50+random()*80}" fill="#4c6139" opacity=".4"/>`}
for(let x=80;x<1600;x+=125)content+=`<path d="M${x} -100V1350" stroke="#23352a" stroke-width="32"/><path d="M${x} -100V1350" stroke="#718065" stroke-opacity=".33" stroke-width="24"/>`;
for(let y=60;y<1250;y+=110)content+=`<path d="M-100 ${y}H1700" stroke="#23352a" stroke-width="28"/><path d="M-100 ${y}H1700" stroke="#718065" stroke-opacity=".35" stroke-width="20"/>`;
content+='<path d="M-30 1070 520 545 1180 -40M600 1300 1450 390 1650 180" stroke="#273b2e" stroke-width="43"/><path d="M-30 1070 520 545 1180 -40M600 1300 1450 390 1650 180" stroke="#768669" stroke-width="30"/>';
for(let x=100;x<1570;x+=125){for(let y=80;y<1200;y+=110){if(random()<.13)continue;for(let j=0;j<3;j++){const bx=x+(j%2)*46,by=y+Math.floor(j/2)*39,w=22+random()*16,h=18+random()*14,z=6+random()*20;const roof=['#89917a','#9b9f86','#788971','#a7ab90'][Math.floor(random()*4)];content+=`<path d="M${bx+4} ${by+4}h${w+7}v${h+9}h-${w+7}Z" fill="#0e251b" opacity=".35"/><path d="M${bx} ${by}h${w}v${h}l-${z*.4} ${z*.8}h-${w}Z" fill="#52644b"/><path d="m${bx+w} ${by} ${z*.4} -${z*.8}v${h}l-${z*.4} ${z*.8}Z" fill="#455b42"/><rect x="${bx}" y="${by-z*.8}" width="${w}" height="${h}" rx="1" fill="${roof}"/>`}}}
const river='M-150 760C130 560 220 660 430 800S710 1070 870 780 1210 380 1750 540';
content+=`<path d="${river}" fill="none" stroke="#789070" stroke-width="142"/><path d="${river}" fill="none" stroke="#425d48" stroke-width="128"/><path d="${river}" fill="none" stroke="url(#water)" stroke-width="106"/>`;
for(let i=0;i<120;i++){const x=random()*1600,y=random()*1250;if(y>650&&y<950)continue;content+=`<circle cx="${x}" cy="${y}" r="${4+random()*5}" fill="${i%2?'#738955':'#607e49'}"/>`}
content+='<g font-family="Arial,sans-serif" font-size="11" letter-spacing="5" fill="#c1cfab" opacity=".6"><text x="663" y="370">STARE MIASTO</text><text x="1180" y="710">PODGÓRZE</text><text x="680" y="1090">ZAKRZÓWEK</text><text x="138" y="375">BŁONIA</text></g>';
const routeD='M830 505C780 468 709 447 660 452L530 459Q494 462 471 511L417 615Q404 644 446 670C548 731 625 850 710 867Q759 876 790 816L881 651Q936 560 1050 548L1203 551Q1272 552 1280 498L1277 416Q1272 385 1235 382L1003 387Q962 389 941 417L876 498Q857 521 830 505Z';
content+=`<g id="route-layer"><path d="${routeD}" fill="none" stroke="#091e13" stroke-width="20" stroke-linecap="round"/><path d="${routeD}" fill="none" stroke="#d5f89b" opacity=".2" stroke-width="22" filter="url(#route-glow)"/><path id="route-base" d="${routeD}" fill="none" stroke="#75945d" stroke-width="8" stroke-linecap="round"/><path id="route-line" d="${routeD}" fill="none" stroke="#d5f89b" stroke-width="8" stroke-linecap="round"/><path id="ride-line" d="${routeD}" fill="none" stroke="#f3ffc9" stroke-width="9" stroke-linecap="round"/><circle cx="830" cy="505" r="14" fill="#203d25" stroke="#d5f89b" stroke-width="4"/><circle cx="830" cy="505" r="4" fill="#d5f89b"/></g><g id="map-rider"><circle r="59" fill="url(#rider-halo)"/><circle id="rider-pulse" r="28" stroke="#d5f89b" stroke-opacity=".4" fill="none" stroke-width="1.5"/><circle r="17" fill="#f1ffd8" stroke="#274b2d" stroke-width="5"/><path d="m-7 5 7-17 7 17-7-4Z" fill="#365b34"/></g>`;
map.innerHTML=content;
const path=$('route-base'), length=path.getTotalLength();
for(const id of ['route-line','ride-line']){$(id).style.strokeDasharray=length;}

function show(id,amount,y=0,x=0,scale=1,rotate=0){const el=$(id);if(!el)return;el.style.opacity=clamp(amount);el.style.transform=`translate3d(${x}px,${y}px,0) scale(${scale}) rotate(${rotate}deg)`;}
function envelope(t,start,end,enter=.9,exit=.65){return out((t-start)/enter)*(1-smooth((t-(end-exit))/exit));}
function shot(id,t,start,end,y=26){const v=envelope(t,start,end);show(id,v,(1-out((t-start)/1.1))*y-(smooth((t-(end-.7))/.7))*18);return v;}
function lit(id,on){const el=$(id);if(!el)return;el.classList.toggle('lit',on);el.classList.toggle('dim',!on);}

function render(t){
 t=clamp(t,0,60);time=t;
 const c=t<11?0:t<22?1:t<36?2:t<50?3:4;
 if(c!==chapter){
  chapter=c;
  document.querySelectorAll('.chapters button').forEach((b,i)=>{b.classList.toggle('active',i===c);if(i===c)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current')});
  $('chapter-announcement').textContent=`Rozdział ${c+1}: ${names[c]}`;
  $('scene-number').textContent=`0${c+1}`;
  $('scene-caption').textContent=captions[c];
 }

 // Copy shots
 shot('copy-intro',t,-1,11.2);
 shot('copy-params',t,11,16.5); // krótko — potem plansza parametrów jest bohaterem
 shot('copy-route',t,22,36.2);
 shot('copy-ride',t,36,50.2);
 shot('copy-outro-text',t,50,55.2);

 const rideIn=smooth(between(t,34.5,37.5));
 const end=smooth(between(t,54.5,56.5));
 $('map-space').style.opacity=mix(.28,.98,rideIn)*(1-end*.55);
 $('map-vignette').style.opacity=mix(1,.55,rideIn);
 const travel=smooth(between(t,37,50));
 const zoom=mix(.85,1.2,rideIn);
 $('map-plane').style.transform=`translate3d(${mix(210,-40,rideIn)-travel*70}px,${mix(80,-60,rideIn)+travel*80}px,0) rotateX(${mix(48,37,rideIn)}deg) rotateZ(${mix(-23,-33,rideIn)+travel*8}deg) scale(${zoom})`;
 $('map-plane').style.filter=`saturate(${mix(.5,1,rideIn)})`;

 // Phone
 const phoneIn=out((t+.4)/2);
 const phoneOut=smooth(between(t,34.2,36.6));
 show('phone-wrap',phoneIn*(1-phoneOut),mix(35,0,phoneIn)-phoneOut*100+Math.sin(t*.65)*4,phoneOut*210,1-phoneOut*.1);
 $('phone').style.transform=`rotateY(${-7+Math.sin(t*.25)*3}deg) rotateZ(${4-Math.sin(t*.35)*1.2}deg)`;

 // Mode select ~4s
 const selected=t>=4.2;
 $('bicycle-mode').classList.toggle('selected',selected);
 $('bicycle-mode').style.transform=`scale(${1+.055*Math.sin(clamp((t-4.2)/.6)*Math.PI)})`;
 const tap=t>=3.9&&t<=5.1;
 show('tap-ring',tap?1-between(t,4.1,5.1):0,0,0,mix(.4,2.1,between(t,3.9,5.1)));
 shot('mode-pill',t,4.6,11.5);

 // Preference values timeline
 // Start: bike defaults maxIncline 12, then effort → easy → 6%, surface on, kerb/width tighten
 let incline=12, effort='Normalnie', stepsOn=true, surfaceOn=false, kerb=12, width=60;
 if(t>=12.2){ // dial incline down with "Lekko"
  incline=Math.round(mix(12,6,out(between(t,12.2,15.8))));
  effort=t>=13.5?'Lekko':'Normalnie';
 }
 if(t>=16.2) surfaceOn=true;
 if(t>=17.5){kerb=Math.round(mix(12,6,out(between(t,17.5,19.2))));}
 if(t>=18.8){width=Math.round(mix(60,80,out(between(t,18.8,20.4))));}

 $('incline-value').textContent=String(incline);
 $('phone-incline').textContent=`${incline}%`;
 $('note-incline').textContent=`${incline}%`;
 const barPct=mix(40,18,out(between(t,12.2,15.8))); // pasek maleje gdy zaostrzasz limit
 $('incline-fill').style.width=`${barPct}%`;
 $('phone-incline-bar').style.width=`${barPct}%`;
 $('phone-incline-knob').style.left=`${barPct}%`;
 $('effort-value').textContent=effort;
 $('phone-effort').textContent=effort;
 $('effort-chip-normal').classList.toggle('on',effort==='Normalnie');
 $('effort-chip-easy').classList.toggle('on',effort==='Lekko');
 $('effort-chip-hard').classList.toggle('on',false);
 $('toggle-steps').classList.toggle('on',stepsOn);
 $('toggle-surface').classList.toggle('on',surfaceOn);
 $('steps-value').textContent=stepsOn?'Omijaj':'Dozwolone';
 $('surface-value').textContent=surfaceOn?'Bez złej':'Dowolna';
 $('steps-badge').textContent=stepsOn?'WŁ':'WYŁ';
 $('surface-badge').textContent=surfaceOn?'WŁ':'WYŁ';
 $('kerb-value').textContent=String(kerb);
 $('width-value').textContent=String(width);

 // Params board visibility — hero of chapters 1-2
 const boardIn=out(between(t,5.5,7));
 const boardOut=smooth(between(t,21.5,23.2));
 show('params-board',boardIn*(1-boardOut),(1-boardIn)*40);
 lit('param-incline',t>=12);
 lit('param-effort',t>=13.5);
 lit('param-steps',t>=6);
 lit('param-surface',surfaceOn);
 lit('param-kerb',t>=17.5);
 lit('param-width',t>=18.8);
 lit('param-mode',selected);

 // Planner page
 const planning=smooth(between(t,22.2,23.4));
 show('phone-preferences',1-planning,0,-planning*80);
 show('phone-planner',planning,0,(1-planning)*80);

 const typed=t<24.2?'':t<24.8?'5':'50';
 $('typed-distance').textContent=typed;
 $('distance-large').textContent=t<24.8?String(Math.round(mix(0,50,out(between(t,22.5,25))))):'50';
 $('distance-slider-fill').style.width=`${44.4*out(between(t,24.2,25.6))}%`;
 $('distance-knob').style.left=`${44.4*out(between(t,24.2,25.6))}%`;
 document.querySelector('.caret').style.opacity=t>26?0:Math.sin(t*5)>0?1:.2;

 $('generate-label').textContent=t<27?'Wyznacz trasę':t<29.5?'Dobieram trasę pod limity…':'Trasa gotowa';
 $('generate-button').style.transform=`scale(${1-.04*Math.sin(between(t,26.8,27.4)*Math.PI)})`;
 document.querySelector('.generated').style.opacity=out(between(t,29.5,30.2));

 shot('route-ready',t,29.8,36.5);
 shot('match-strip',t,30.5,36.8);

 const routeVisibility=out(between(t,28,31));
 $('route-layer').style.opacity=routeVisibility;
 $('route-line').style.strokeDashoffset=length*(1-routeVisibility);

 const ride=.02+between(t,36.2,50)*.7;
 const pt=path.getPointAtLength(length*ride);
 const ahead=path.getPointAtLength(length*Math.min(ride+.003,1));
 const angle=Math.atan2(ahead.y-pt.y,ahead.x-pt.x)*180/Math.PI+90;
 $('map-rider').style.opacity=rideIn*(1-end);
 $('map-rider').setAttribute('transform',`translate(${pt.x} ${pt.y}) rotate(${angle})`);
 $('rider-pulse').setAttribute('r',String(23+(t%2)*12));
 $('rider-pulse').style.opacity=1-(t%2)/2;
 $('ride-line').style.strokeDashoffset=length*(1-ride);
 $('ride-line').style.opacity=rideIn;

 shot('nav-hud',t,36.5,50.5);
 shot('ride-progress',t,37,50.8);
 shot('river-label',t,37.5,50.5);

 $('turn-distance').textContent=String(Math.round(mix(240,40,between(t,37,49))/10)*10);
 const ridden=mix(12.4,22.8,between(t,37,50));
 $('ridden-distance').textContent=ridden.toFixed(1).replace('.',',');
 $('ride-track-fill').style.width=`${mix(24.8,45,between(t,37,50))}%`;
 // live grade stays gentle under the 6% cap
 const grade=mix(2.1,4.6,0.5+0.5*Math.sin(t*1.3));
 $('live-grade').textContent=grade.toFixed(1).replace('.',',');

 show('outro',out(between(t,54.8,56.6)),mix(25,0,out(between(t,54.8,56.6))));
 $('scene-number').style.opacity=(1-end)*(1-envelope(t,36,50.5));
 $('scene-caption').style.opacity=1-end;

 $('seek').value=String(t);
 $('seek').style.setProperty('--progress',`${t/60*100}%`);
 $('time').innerHTML=`00:${String(Math.floor(t)%60).padStart(2,'0')} <i>/ 01:00</i>`;
 if(t===60)$('time').innerHTML='01:00 <i>/ 01:00</i>';
 $('stage').dataset.chapter=String(c+1);
 $('stage').dataset.time=t.toFixed(2);
}

function resize(){
 const rect=$('cinema').getBoundingClientRect();
 const scale=Math.min(rect.width/1600,rect.height/900);
 $('stage').style.transform=`scale(${scale})`;
 if(document.fullscreenElement){
  $('stage').style.position='absolute';
  $('stage').style.left=`${(rect.width-1600*scale)/2}px`;
  $('stage').style.top=`${(rect.height-900*scale)/2}px`;
 }else{$('stage').style.left='0';$('stage').style.top='0';}
}
function setPlaying(value){
 playing=value;last=0;
 $('play').setAttribute('aria-label',playing?'Pauza':'Odtwórz film');
 $('play').innerHTML=`<svg><use href="#i-${playing?'pause':'play'}"/></svg>`;
 if(playing&&!raf)raf=requestAnimationFrame(tick);
}
function tick(now){
 raf=0;if(!playing)return;
 if(last)render(time+(now-last)/1000*speed);
 last=now;
 if(time>=60){setPlaying(false);return}
 raf=requestAnimationFrame(tick);
}
function seek(t){last=0;render(t);}
function toggle(){if(time>=60)seek(0);setPlaying(!playing);}
function capture(value){document.body.classList.toggle('capture',value);resize();}

$('play').addEventListener('click',toggle);
$('restart').addEventListener('click',()=>{seek(0);setPlaying(true)});
$('seek').addEventListener('input',e=>seek(Number(e.target.value)));
$('speed').addEventListener('click',()=>{speed=speed===1?1.5:speed===1.5?.5:1;$('speed').textContent=`${speed}×`;last=0;});
$('capture').addEventListener('click',()=>capture(true));
$('exit-capture').addEventListener('click',()=>capture(false));
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('cinema').requestFullscreen();}catch{capture(true)}});
for(const b of document.querySelectorAll('[data-time]'))b.addEventListener('click',()=>seek(Number(b.dataset.time)+.9));
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'){capture(false);return}
 if(e.target instanceof HTMLInputElement)return;
 if(!document.body.classList.contains('capture')&&(e.target instanceof HTMLButtonElement||e.target instanceof HTMLAnchorElement))return;
 if(e.code==='Space'){e.preventDefault();toggle()}
 if(e.code==='ArrowRight'){e.preventDefault();seek(Math.min(60,time+5))}
 if(e.code==='ArrowLeft'){e.preventDefault();seek(Math.max(0,time-5))}
 if(e.key.toLowerCase()==='c')capture(!document.body.classList.contains('capture'));
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)setPlaying(false)});
reduced.addEventListener('change',()=>{if(reduced.matches)setPlaying(false)});
document.addEventListener('fullscreenchange',resize);
new ResizeObserver(resize).observe($('cinema'));
const params=new URLSearchParams(location.search);
render(clamp(Number(params.get('t'))||0,0,60));
resize();
if(params.get('clean')==='1')capture(true);
if(params.get('autoplay')==='1'&&!reduced.matches)setPlaying(true);
window.launchFilm=Object.freeze({seek,play:()=>setPlaying(true),pause:()=>setPlaying(false),get time(){return time},get playing(){return playing},duration:60});
