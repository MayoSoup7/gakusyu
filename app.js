const DB='eigomimi-v3',VER=1;let db;
const $=id=>document.getElementById(id);
let state={lesson:1,mode:1,book:false,current:null,queue:[],idx:-1,repeat:false,gap:0,A:null,B:null,ab:false,editing:null,recording:null};
const audio=new Audio(); audio.preload='metadata';
function req(r){return new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function tx(store,mode='readonly'){return db.transaction(store,mode).objectStore(store)}
async function all(store){return req(tx(store).getAll())}
async function get(store,key){return req(tx(store).get(key))}
async function put(store,v){return req(tx(store,'readwrite').put(v))}
async function del(store,key){return req(tx(store,'readwrite').delete(key))}
function uid(){return crypto.randomUUID()}
function fmt(s){if(!isFinite(s))return'0:00';s=Math.max(0,s);return Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0')}
function blobUrl(blob){return URL.createObjectURL(blob)}
function openDB(){return new Promise((res,rej)=>{let r=indexedDB.open(DB,VER);r.onupgradeneeded=e=>{let d=e.target.result;for(const s of ['lessons','pages','audios','practices','recordings'])if(!d.objectStoreNames.contains(s))d.createObjectStore(s,{keyPath:'id'});};r.onsuccess=()=>{db=r.result;res()};r.onerror=()=>rej(r.error)})}
async function seed(){for(let i=1;i<=26;i++){if(!await get('lessons','L'+i))await put('lessons',{id:'L'+i,num:i,title:`Lesson ${String(i).padStart(2,'0')}`,name:''})}}
function lessonLabel(n){return`Lesson ${String(n).padStart(2,'0')}`}
async function init(){await openDB();await seed();fillLessons();await renderLesson();setup()}
function fillLessons(){ $('lessonSelect').innerHTML=Array.from({length:26},(_,i)=>`<option value="${i+1}">${lessonLabel(i+1)}</option>`).join('');$('lessonSelect').value=state.lesson}
async function renderLesson(){state.book=false;$('bookView').hidden=true;$('pages').hidden=false;let lesson=await get('lessons','L'+state.lesson);$('lessonTitle').innerHTML=`<h2>${lessonLabel(state.lesson)}${lesson.name?'：'+esc(lesson.name):''}</h2>`;let pages=(await all('pages')).filter(p=>p.lesson===state.lesson).sort((a,b)=>a.order-b.order);$('pages').className=state.mode===2?'two':'';$('modeBtn').textContent=state.mode===1?'1ページ':'2ページ';$('pages').innerHTML=pages.map(p=>pageHTML(p)).join('')||`<div class="page"><p>このLessonにはまだページがありません。</p><p>「＋ページ画像」からiPhoneの画像を追加できます。</p></div>`}
function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function pageHTML(p){let url=blobUrl(p.blob);let prs=[]; // practice records loaded asynchronously below
return`<article class="page ${p.visible===false?'hiddenPage':''}" data-page="${p.id}"><div class="pageHead"><span class="pageNum">P.${p.pageNo||'—'}</span><div><button onclick="togglePage('${p.id}')">${p.visible===false?'👁 表示':'🙈 隠す'}</button><button onclick="addPractice('${p.id}')">＋Practice</button></div></div>${p.blob?`<img src="${url}" alt="">`:''}<div id="prs-${p.id}"></div></article>`}
async function loadPractices(){let prs=await all('practices');for(const p of prs){let el=document.querySelector(`#prs-${p.pageId}`);if(!el)continue;let au=p.audioId?await get('audios',p.audioId):null;el.insertAdjacentHTML('beforeend',`<div class="practice"><div class="practiceTop"><span class="practiceName">${esc(p.name)}</span><div class="practiceBtns"><button onclick="playPractice('${p.id}')">▶️</button><button onclick="editPractice('${p.id}')">編集</button><button onclick="recordPractice('${p.id}')">🎙️</button></div></div><div class="audioChip">${au?esc(au.name):'音声未登録'}</div></div>`)}}
async function rerender(){await renderLesson();await loadPractices()}
async function togglePage(id){let p=await get('pages',id);p.visible=p.visible===false?true:false;await put('pages',p);await rerender()}
async function addPractice(pageId){let p={id:uid(),pageId,lesson:state.lesson,name:'Practice',audioId:null};await put('practices',p);await rerender();await editPractice(p.id)}
async function editPractice(id){state.editing=id;let p=await get('practices',id);$('practiceName').value=p.name;$('audioSelect').innerHTML='<option value="">音声なし</option>'+((await all('audios')).filter(a=>a.lesson===state.lesson).sort((a,b)=>a.order-b.order).map(a=>`<option value="${a.id}" ${a.id===p.audioId?'selected':''}>${esc(a.name)}</option>`).join(''));$('editDialog').showModal()}
async function savePractice(){let p=await get('practices',state.editing);p.name=$('practiceName').value||'Practice';p.audioId=$('audioSelect').value||null;await put('practices',p);await rerender()}
async function addPages(files){let existing=(await all('pages')).filter(p=>p.lesson===state.lesson);let order=existing.length;for(const f of files){await put('pages',{id:uid(),lesson:state.lesson,order:order++,pageNo:guessPageNo(f.name,order),visible:true,blob:f,name:f.name})}await rerender()}
function guessPageNo(name,n){let m=name.match(/(?:P|p|page|ページ)[ _-]?(\d+)/);return m?m[1]:n}
async function addAudios(files){let existing=(await all('audios')).filter(a=>a.lesson===state.lesson);let order=existing.length;for(const f of files){await put('audios',{id:uid(),lesson:state.lesson,order:order++,name:f.name,blob:f})}await rerender()}
async function playPractice(id){let p=await get('practices',id);if(!p.audioId)return alert('このPracticeには音声が登録されていません。編集から音声を選んでください。');let a=await get('audios',p.audioId);await startAudio(a, p.name)}
async function startAudio(a,label){state.current=a;state.queue=[a];state.idx=0;audio.src=blobUrl(a.blob);audio.playbackRate=Number($('speed').value);audio.currentTime=0;$('now').textContent=label||a.name;state.A=null;state.B=null;state.ab=false;updateAB();await audio.play()}
function playQueueIndex(i){if(!state.queue[i])return;state.idx=i;let a=state.queue[i];audio.src=blobUrl(a.blob);audio.currentTime=0;audio.playbackRate=Number($('speed').value);$('now').textContent=a.name;audio.play()}
audio.ontimeupdate=()=>{$('cur').textContent=fmt(audio.currentTime);$('dur').textContent=fmt(audio.duration);$('seek').value=audio.duration?(audio.currentTime/audio.duration*1000):0;if(state.ab&&state.B!==null&&audio.currentTime>=state.B){audio.currentTime=state.A||0;audio.play()}};
audio.onended=async()=>{if(state.ab)return;if(state.repeat){audio.currentTime=state.A||0;await audio.play();return}let gap=Number($('gap').value)||0;if(gap)await new Promise(r=>setTimeout(r,gap*1000));if(state.idx+1<state.queue.length)playQueueIndex(state.idx+1)};
$('play').onclick=()=>audio.paused?audio.play():audio.pause();
audio.onplay=()=>$('play').textContent='⏸';audio.onpause=()=>$('play').textContent='▶️';
$('seek').oninput=()=>{if(audio.duration)audio.currentTime=Number($('seek').value)/1000*audio.duration};
$('restart').onclick=()=>{audio.currentTime=state.A||0;audio.play()};$('prev').onclick=()=>playQueueIndex(Math.max(0,state.idx-1));$('next').onclick=()=>playQueueIndex(Math.min(state.queue.length-1,state.idx+1));$('repeat').onclick=()=>{state.repeat=!state.repeat;$('repeat').style.background=state.repeat?'#ffd2ea':''};
$('speed').onchange=()=>audio.playbackRate=Number($('speed').value);
$('setA').onclick=()=>{state.A=audio.currentTime;updateAB()};$('setB').onclick=()=>{state.B=audio.currentTime;updateAB()};$('ab').onclick=()=>{state.ab=!state.ab;if(state.ab&&state.A===null)state.A=audio.currentTime;if(state.ab&&state.B===null)state.B=audio.duration;updateAB()};
function updateAB(){$('markA').textContent='A:'+(state.A===null?'—':fmt(state.A));$('markB').textContent='B:'+(state.B===null?'—':fmt(state.B));$('ab').textContent=state.ab?'A-B ON':'A-B OFF'}
async function recordPractice(id){state.recording=id;let p=await get('practices',id);$('recordTarget').textContent=p.name;$('recordDialog').showModal();let rs=(await all('recordings')).filter(r=>r.practiceId===id).sort((a,b)=>b.created-b.created)[0];if(rs){$('ownAudio').src=blobUrl(rs.blob);$('ownAudio').hidden=false;$('deleteRecording').hidden=false}else{$('ownAudio').hidden=true;$('deleteRecording').hidden=true}}
let rec, chunks=[];
$('recordStart').onclick=async()=>{try{let stream=await navigator.mediaDevices.getUserMedia({audio:true});rec=new MediaRecorder(stream);chunks=[];rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};rec.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());let blob=new Blob(chunks,{type:rec.mimeType||'audio/webm'});await put('recordings',{id:uid(),practiceId:state.recording,created:Date.now(),blob});$('ownAudio').src=blobUrl(blob);$('ownAudio').hidden=false;$('deleteRecording').hidden=false;$('recordState').textContent='保存しました';};rec.start();$('recordStart').disabled=true;$('recordStop').disabled=false;$('recordState').textContent='録音中…';let p=await get('practices',state.recording);if(p.audioId){let a=await get('audios',p.audioId);audio.src=blobUrl(a.blob);audio.currentTime=0;audio.play()}}catch(e){alert('マイクを許可できませんでした。iPhoneではHTTPSのページでマイクを許可してください。')}};
$('recordStop').onclick=()=>{if(rec&&rec.state!=='inactive')rec.stop();$('recordStart').disabled=false;$('recordStop').disabled=true};
$('refOnly').onclick=()=>{audio.play()};$('ownOnly').onclick=()=>{if($('ownAudio').src)$('ownAudio').play()};$('bothPlay').onclick=()=>{audio.play();$('ownAudio').play()};
$('deleteRecording').onclick=async()=>{let rs=(await all('recordings')).filter(r=>r.practiceId===state.recording);for(const r of rs)await del('recordings',r.id);$('ownAudio').hidden=true;$('deleteRecording').hidden=true};
$('closeRecord').onclick=()=>{$('recordDialog').close()};
$('addPageBtn').onclick=()=>$('pageFiles').click();$('pageFiles').onchange=e=>addPages(e.target.files);
$('addAudioBtn').onclick=()=>$('audioFiles').click();$('audioFiles').onchange=e=>addAudios(e.target.files);
$('lessonSelect').onchange=async e=>{state.lesson=Number(e.target.value);await rerender()};
$('modeBtn').onclick=async()=>{state.mode=state.mode===1?2:1;await rerender()};
$('bookBtn').onclick=async()=>{state.book=true;$('pages').hidden=true;$('lessonTitle').innerHTML='';$('bookView').hidden=false;let pages=(await all('pages')).filter(p=>p.visible!==false).sort((a,b)=>a.lesson-b.lesson||a.order-b.order);let last=0;$('bookView').innerHTML=pages.map(p=>{let h=p.lesson!==last?`<div class="lessonHeader">${lessonLabel(p.lesson)}</div>`:'';last=p.lesson;return h+pageHTML(p)}).join('')||'<div class="page">ページがありません。</div>';await loadPracticesBook()};
async function loadPracticesBook(){let prs=await all('practices');for(const p of prs){let el=document.querySelector(`#prs-${p.pageId}`);if(!el)continue;let au=p.audioId?await get('audios',p.audioId):null;el.innerHTML+=`<div class="practice"><div class="practiceTop"><span class="practiceName">${esc(p.name)}</span><div class="practiceBtns"><button onclick="playPractice('${p.id}')">▶️</button><button onclick="recordPractice('${p.id}')">🎙️</button></div></div><div class="audioChip">${au?esc(au.name):'音声未登録'}</div></div>`}}
function setup(){$('savePractice').onclick=e=>{e.preventDefault();savePractice();$('editDialog').close()}}
window.togglePage=togglePage;window.addPractice=addPractice;window.editPractice=editPractice;window.playPractice=playPractice;window.recordPractice=recordPractice;
init();