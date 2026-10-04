import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Presentation, PresentationFile, FileBlob } from '@oai/artifact-tool';
process.env.RUNTIME_NODE_MODULES='/home/ubuntter/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const ROOT='/home/ubuntter/Projects/PewnySzlak';
const SKILL='/home/ubuntter/.codex/plugins/cache/openai-primary-runtime/presentations/26.905.11957/skills/presentations';
const TMP=path.join(ROOT,'docs/pitch/.build');
const OUT=path.join(ROOT,'docs/pitch/output');
const {resolvePresentationFont, applyPresentationChartFont, finalizePresentation}=await import(pathToFileURL(path.join(SKILL,'container_tools/artifact_tool_utils.mjs')));
const font=resolvePresentationFont({fontFamily:'Lato'});
const C={cream:'#F6F5EE',ink:'#182B23',lime:'#D1F28E',green:'#315A43',muted:'#66766A',light:'#B6C5B4',red:'#CA5D48',grey:'#C9D4C5'};
const p=Presentation.create({slideSize:{width:1280,height:720}});
let n=0;
function text(s,value,x,y,w,h,size=28,color=C.ink,bold=false){const o=s.shapes.add({geometry:'textbox',name:value.slice(0,60),position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});o.text=value;o.text.style={typeface:font,fontSize:size,color,bold,autoFit:'none',wrap:'square',verticalAlignment:'top',insets:{top:0,right:0,bottom:0,left:0}};return o;}
function base(topic,dark=false){const s=p.slides.add();n++;s.background.fill=dark?C.ink:C.cream;text(s,'pewnyszlak.',64,36,350,36,25,dark?C.lime:C.green,true);text(s,topic.toUpperCase(),64,103,1090,30,16,dark?C.light:C.muted,true);text(s,`${String(n).padStart(2,'0')} / 10`,1196,678,78,22,13,dark?C.light:C.muted);return s;}
function title(s,v,dark=false,w=1100){text(s,v,64,151,w,130,51,dark?C.cream:C.ink,true);}
function note(s,v,sources=''){s.speakerNotes.textFrame.setText(v+(sources?'\n\nŹródła i status:\n'+sources:''));}
async function pic(s,file,x,y,w,h){s.images.add({blob:new Uint8Array(await fs.readFile(path.join(ROOT,'docs/pitch/assets',file))),contentType:'image/png',alt:`Zrzut ekranu działającej aplikacji PewnySzlak: ${file}`,fit:'contain',position:{left:x,top:y,width:w,height:h}});}
// 01 — cover
{
 const s=base('HackYeah 2026 · Kraków bez barier',true);
 text(s,'Kraków\nw Twoim tempie',64,211,730,235,79,C.cream,true);
 text(s,'Trasy według Twoich potrzeb.\nInformacje o barierach przed wyjściem.',69,477,705,95,29,C.light);
 text(s,'Aplikacja mobilna i webowa',69,602,670,33,21,C.lime);
 await pic(s,'01-home.png',866,91,270,585);
 note(s,'Wyobraźcie sobie zwiedzanie Krakowa, podczas którego dopiero pod schodami dowiadujecie się, że trasa nie jest dla was. PewnySzlak pomaga ocenić dojście przed wyjściem. W demonstracji konkursowej skupiamy się na osobie poruszającej się na wózku.', 'prd.md; krakow.pdf. Screen z aktualnej aplikacji, nie z filmu reklamowego.');
}
// 02 — problem
{
 const s=base('Problem');
 title(s,'Cel jest blisko.\nDojście kończy się schodami.');
 text(s,'Dla osoby na wózku jeden trudny odcinek\nmoże zmienić całą podróż.',65,295,1070,84,31,C.green);
 const items=[['Parametry zamiast etykiety','„Dostępne” nie mówi o szerokości, krawężniku ani nachyleniu.'],['Miasto zmienia się codziennie','Remont lub przeszkoda mogą zamknąć wcześniej znane dojście.'],['Braki danych utrudniają decyzję','Użytkownik musi wiedzieć, czego mapa jeszcze nie potwierdza.']];
 items.forEach(([h,b],i)=>{text(s,h,64,425+i*72,430,40,25,C.ink,true);text(s,b,517,425+i*72,677,60,24,C.muted)});
 note(s,'Problemem nie jest tylko znalezienie celu. Trzeba ocenić całą drogę i konkretne przeszkody. Binarny status dostępności nie odpowiada na pytanie, czy przejedzie konkretny użytkownik z konkretnym sprzętem.', 'krakow.pdf, sekcje 1–3. To opis problemu z wyzwania, a nie badanie konkurencyjnych aplikacji.');
}
// 03 — solution
{
 const s=base('Rozwiązanie');
 title(s,'Trasa dopasowana\ndo Twoich limitów',false,775);
 text(s,'Ustawiasz preferencje. Silnik odrzuca\nznane bariery, które je przekraczają.',64,315,733,94,30,C.green);
 const values=[['6%','nachylenie'],['2 cm','krawężnik'],['90 cm','szerokość']];
 values.forEach(([v,l],i)=>{text(s,v,64+i*242,445,225,81,51,C.ink,true);text(s,l,64+i*242,525,225,35,23,C.muted)});
 text(s,'Przykładowy profil wózka. Limity można zmienić.\nBez konta i bez pytań o stan zdrowia.',64,595,744,64,22,C.muted);
 await pic(s,'02-limits.png',897,86,271,588);
 note(s,'Wybieramy profil wózka, a następnie własne limity nachylenia, krawężnika i szerokości. Znane przekroczenia eliminują odcinek z routingu. Dla brakujących danych użytkownik wybiera ostrzeżenie albo wykluczenie. Nie zbieramy diagnoz ani historii GPS.', 'packages/domain/src/index.ts; apps/api/src/graph/cost.ts; apps/mobile/app/index.tsx. Liczby to edytowalny przykład preferencji, a nie uniwersalna norma dostępności.');
}
// 04 — product demo
{
 const s=base('Demo produktu');
 title(s,'Rynek Główny\nWawel',false,500);
 text(s,'Przed wyjściem',64,297,446,45,30,C.green,true);
 text(s,'Przebieg trasy w 3D i podgląd\nnajtrudniejszych etapów.\n\nOdcinki z brakami danych\notrzymują osobne oznaczenia.',64,359,489,209,27,C.muted);
 text(s,'W scenariuszu demo aktywna\nblokada Grodzkiej wymusza objazd.',64,585,492,66,23,C.green);
 await pic(s,'03-route.png',587,84,266,577);
 await pic(s,'05-text.png',910,84,266,577);
 note(s,'Najpierw pokażemy rzeczywistą trasę na grafie Krakowa, a następnie wariant demonstracyjny z blokadą Grodzkiej. Użytkownik może obejrzeć przebieg na mapie, przejrzeć etapy i przełączyć się na pełny opis tekstowy. Przykładowe utrudnienie pochodzi z oddzielnego zestawu demo.', 'apps/mobile/app/route/index.tsx; apps/mobile/app/route/text.tsx; apps/api/src/demo/seed.ts. Screeny pokazują bieżącą aplikację. Blokada Grodzkiej jest symulowana i działa tylko w trybie demo.');
}
// 05 — use cases
{
 const s=base('Scenariusze użycia');
 title(s,'Jedno miasto, różne potrzeby',false,1190);
 const stories=[['Osoba na wózku','Dojazd bez znanych schodów i z opisem niepewności.'],['Rodzic lub turysta z bagażem','Ocena nawierzchni przed wybraniem drogi.'],['Rowerzysta','Trasa dopasowana do poziomu wysiłku.'],['Przystanek w podróży','Asystent proponuje cel, silnik oblicza dojście.']];
 stories.forEach(([h,b],i)=>{text(s,h,64,284+i*91,760,33,26,C.ink,true);text(s,b,64,322+i*91,770,62,23,C.muted)});
 await pic(s,'06-assistant.png',931,95,262,569);
 note(s,'Scenariusz konkursowy to osoba na wózku. Ten sam model preferencji może wspierać kolejne potrzeby. Asystent potrafi zaproponować placówkę albo miejsce na przerwę, a trasę liczy backend. Lokale burgerowe widoczne na screenie to propozycje demonstracyjne, a nie sprawdzenie ich dostępności.', 'prd.md, grupy docelowe; apps/api/src/graph/explore.ts; apps/api/src/assistant/service.ts; apps/api/src/assistant/tools.ts. Scenariusz rodzica i bagażu to zastosowanie obecnych ustawień, nie osobne dedykowane profile.');
}
// 06 — SAR concept; ambiguous designation retained as requested, without fake integration.
{
 const s=base('SAR-1 · demonstracja warstwy radarowej',true);
 title(s,'Sygnał zmiany wskazuje,\ngdzie warto sprawdzić trasę',true);
 text(s,'RADAR',64,333,392,72,53,C.lime,true);
 text(s,'Obserwacje tego samego obszaru\nw różnych terminach mogą wskazać\nzmianę wymagającą kontroli.',64,421,507,132,27,C.light);
 const rows=[['01','Porównanie obserwacji','Zmiana obrazu obszaru'],['02','Sygnał na mapie','Miejsce do sprawdzenia'],['03','Kontrola źródeł i terenu','Dopiero potem status bariery']];
 rows.forEach(([num,h,b],i)=>{text(s,num,703,311+i*106,63,43,30,C.lime,true);text(s,h,791,309+i*106,432,40,27,C.cream,true);text(s,b,791,351+i*106,430,43,23,C.light)});
 text(s,'W pitchu pokazujemy symulowane sygnały SAR-1.\nRadar nie mierzy krawężników ani nie potwierdza przejezdności.',64,595,1100,67,23,C.lime);
 note(s,'Warstwa nazwana SAR-1 pokazuje, jak chcemy kierować uwagę na miejsca, w których zaszła zmiana. Sam sygnał radarowy nie jest barierą ani pomiarem chodnika. Zespół musi dopasować go do lokalizacji, zweryfikować i dopiero wtedy nadać status. W repozytorium nie znaleziono klienta SAR-1, dlatego slajd opisuje demonstrację koncepcji, nie wdrożoną integrację.', 'Nazwa SAR-1 zgodnie z prośbą użytkownika. Dostawca / misja niepotwierdzone. Ogólna możliwość detekcji zmian SAR: https://algorithm-catalogue.apex.esa.int/apps/sentinel1_changedetection . Nie utożsamiamy SAR-1 z Sentinel-1 bez potwierdzenia zespołu.');
}
// 07 — mocked elevation profile, native editable chart
{
 const s=base('LiDAR · mock dokładniejszego profilu terenu');
 title(s,'Wysokość terenu\nzmienia wybór odcinka',false,1120);
 text(s,'PRZYKŁAD SYMULOWANY',64,291,736,31,16,C.muted,true);
 const chart=s.charts.add('line',{
  position:{left:60,top:338,width:712,height:288},categories:['0','5','10','15','20','25','30'],
  series:[{name:'Odcinek stromy',values:[200,200.5,201,201.5,202,202.5,203],line:{fill:C.red,width:4},marker:{symbol:'none'}},{name:'Wariant łagodniejszy',values:[200,200.2,200.4,200.6,200.8,201,201.2],line:{fill:C.green,width:4},marker:{symbol:'none'}}],
  hasLegend:true,legend:{position:'bottom',textStyle:{typeface:font,fontSize:18,fill:C.muted}},
  xAxis:{title:{text:'Długość odcinka [m]',textStyle:{typeface:font,fontSize:18,fill:C.muted}},textStyle:{typeface:font,fontSize:17,fill:C.muted},line:{fill:C.grey,width:1}},
  yAxis:{title:{text:'Wysokość [m]',textStyle:{typeface:font,fontSize:18,fill:C.muted}},min:200,max:203,majorUnit:1,numberFormatCode:'0.0',textStyle:{typeface:font,fontSize:17,fill:C.muted},majorGridlines:{fill:'#DEE3D8',width:1}},
  chartFill:C.cream,plotAreaFill:C.cream,chartLine:{fill:'none',width:0},plotAreaLine:{fill:'none',width:0}
 });applyPresentationChartFont(chart,{fontFamily:font});
 text(s,'10%',858,333,300,76,63,C.red,true);text(s,'3 m wzniosu na 30 m\nPowyżej przykładowego limitu 6%.',862,417,337,89,24,C.muted);
 text(s,'4%',858,518,300,76,63,C.green,true);text(s,'1,2 m wzniosu na 30 m\nŁagodniejszy wariant w symulacji.',862,599,348,68,22,C.muted);
 text(s,'Prototyp ma klienta NMT GUGiK. Surowy LiDAR i jego wpływ na routing pokazujemy jako mock.',64,652,1030,31,17,C.muted);
 note(s,'To mock pokazujący wartość dokładniejszych danych wysokościowych. Na odcinku 30 metrów wznios 3 metry daje 10%, a 1,2 metra daje 4%. Przy limicie 6% drugi wariant lepiej odpowiada preferencji. W kodzie mamy klienta NMT, który opisuje powierzchnię gruntu. Nie zrealizowaliśmy pomiaru surowej chmury LiDAR ani walidacji podjazdów. NMT nie rozstrzyga o schodach, mostach, krawężnikach czy windach i nie zmienia routingu.', 'Wszystkie wartości wykresu są syntetyczne. Obliczenie: wznios / długość pozioma × 100%. apps/api/src/terrain/nmt.ts. Źródła technologii: https://www.geoportal.gov.pl/pl/dane/dane-pomiarowe-lidar-lidar/ ; https://www.geoportal.gov.pl/pl/dane/numeryczny-model-terenu-nmt/ .');
}
// 08 — implementation and trust
{
 const s=base('Technologia i wiarygodność');
 title(s,'Każda informacja\nma źródło i status',false,794);
 const rows=[['React Native + Expo','Wspólna aplikacja mobilna i webowa.'],['A* + PostgreSQL / PostGIS','Routing na lokalnym grafie OSM Krakowa.'],['MCP + NFZ + zgłoszenia','Dane publiczne i oddzielna warstwa barier.'],['Źródło, daty, niepewność','Informacja w źródle i kontrola w terenie to różne daty.']];
 rows.forEach(([h,b],i)=>{text(s,h,64,299+i*81,749,36,26,C.ink,true);text(s,b,64,339+i*81,748,41,23,C.muted)});
 text(s,'Brak danych pozostaje widoczny.\nAsystent nie nadaje formalnego potwierdzenia dostępności.',64,622,752,61,22,C.green);
 await pic(s,'07-sources.png',917,92,263,570);
 note(s,'Warstwy są rozdzielone: synchronizacja danych, graf i silnik tras, API oraz interfejs. OSM daje topologię, MCP z-dykty daje sygnały z przetargów, NFZ dane placówek, a społeczność aktualizuje bariery. Przetarg nie oznacza trwającego remontu. Sprzeczne i stare obserwacje pozostają widoczne. System nie potrzebuje wewnętrznych systemów miasta.', 'apps/api/src/sync; apps/api/src/graph; apps/api/src/sources/status.ts; docs/licencje-danych.md. MCP: https://z-dykty.pl/dla-programistow . NFZ: https://apinfz.nfz.gov.pl/app-itl-api-pcus/index.html .');
}
// 09 — business and next steps
{
 const s=base('Wdrożenie i model biznesowy');
 title(s,'Pilotaż w Krakowie,\npotem kolejne miasta');
 text(s,'DLA UŻYTKOWNIKA',64,315,560,32,16,C.muted,true);
 text(s,'Bezpłatne planowanie trasy\ni dostęp do informacji o barierach.',64,362,552,100,29,C.green);
 text(s,'DLA PARTNERÓW',701,315,511,32,16,C.muted,true);
 text(s,'Widget dla hotelu lub wydarzenia.\nPłatne API tras i panel aktualizacji.',701,362,510,100,29,C.green);
 text(s,'Najbliższy krok',64,504,573,42,28,C.ink,true);
 text(s,'Testy terenowe z osobami na wózkach.\nPorównanie danych z rzeczywistym dojściem.',64,553,568,85,24,C.muted);
 text(s,'Rozwój po hackathonie',701,504,513,42,28,C.ink,true);
 text(s,'Walidacja SAR i LiDAR, kolejne obszary.\nPilotaż z partnerem i test gotowości do płacenia.',701,553,509,87,24,C.muted);
 note(s,'Użytkownik powinien mieć bezpłatny dostęp do podstawowych informacji. Hipoteza biznesowa to narzędzie dla hoteli, organizatorów wydarzeń i dostawców aplikacji: widget dojścia, API i panel aktualizacji. Najpierw sprawdzamy użyteczność w terenie i zainteresowanie partnerów, potem model opłat. Nie deklarujemy podpisanych umów ani przychodów.', 'Model i plan to propozycja zespołu, nie wyniki pilotażu. krakow.pdf, potencjał wdrożenia i komercjalizacji.');
}
// 10 — close and live demo
{
 const s=base('Prototyp gotowy do pokazania',true);
 title(s,'Sprawdź drogę,\nzanim ruszysz',true,730);
 text(s,'344 284',64,331,720,110,80,C.lime,true);
 text(s,'krawędzie zaimportowanego grafu OSM Krakowa',68,434,734,60,25,C.light);
 text(s,'W demo: preferencje wózka, trasa Rynek – Wawel,\nźródła danych i prowadzenie krok po kroku.',68,534,732,90,27,C.cream);
 text(s,'pewnyszlak.',68,634,666,35,28,C.lime,true);
 await pic(s,'04-flythrough.png',918,89,265,575);
 note(s,'Przechodzimy do aplikacji. Ustawiamy potrzeby osoby na wózku, wybieramy start i cel, pokazujemy etapy trasy oraz źródła. Zakończenie: użytkownik wie, co wynika z danych i czego nadal trzeba się dowiedzieć. Liczba krawędzi opisuje zaimportowany graf, nie liczbę sprawdzonych chodników.', 'GET /v1/health: version osm-20261003T130058Z, nodes 281817, edges 344284, stan odczytany podczas przygotowania prezentacji. To pokrycie dostępnej sieci OSM, nie gwarancja pełnych danych o dostępności.');
}
await fs.mkdir(OUT,{recursive:true});
await (await PresentationFile.exportPptx(p)).save(path.join(TMP,'candidate.pptx'));
const FINAL=path.join(OUT,'PewnySzlak-Pitch-PL.pptx');
const result=await finalizePresentation({workspaceDir:ROOT,candidatePath:path.join(TMP,'candidate.pptx'),finalPath:FINAL,pythonExecutable:'/home/ubuntter/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',integrityValidatorPath:path.join(SKILL,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(SKILL,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit'],explicitTotalSlideCount:10,requiredNativeChartOwnerSlides:[7],materializeLiteralChartWorkbooks:true,fontPolicy:{basis:'design',families:[font]},verifyArtifactToolImport:true,receiptPath:path.join(TMP,'validation-final.json')});
console.log(JSON.stringify(result));
const finalDeck=await PresentationFile.importPptx(await FileBlob.load(FINAL));
for(let i=0;i<10;i++){const slide=finalDeck.slides.getItem(i);const image=await finalDeck.export({slide,format:'png',scale:1.5});await fs.writeFile(path.join(TMP,`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await image.arrayBuffer()));}
const montage=await finalDeck.export({format:'webp',montage:true,scale:.6});await fs.writeFile(path.join(TMP,'montage.webp'),new Uint8Array(await montage.arrayBuffer()));
console.log('Final deck and previews exported.');
