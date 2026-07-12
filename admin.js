const DEFAULT_LESSONS = {
  "Lesson 1": {
    words: QUESTION_BANK.words.slice(0, 28),
    phrases: QUESTION_BANK.phrases.slice(0, 32),
    sentences: QUESTION_BANK.sentences.slice(0, 30)
  },
  "Lesson 2": {
    words: QUESTION_BANK.words.slice(28, 58),
    phrases: QUESTION_BANK.phrases.slice(32, 68),
    sentences: QUESTION_BANK.sentences.slice(30, 60)
  },
  "Lesson 3": {
    words: QUESTION_BANK.words.slice(58, 88),
    phrases: QUESTION_BANK.phrases.slice(68, 104),
    sentences: QUESTION_BANK.sentences.slice(60, 90)
  }
};

function toEntry(item){
  if(typeof item === "string") return {english:item, chinese:CHINESE_TRANSLATIONS[item] || ""};
  return {english:item.english || "", chinese:item.chinese || CHINESE_TRANSLATIONS[item.english] || ""};
}
function normalizeLessons(raw){
  const result={};
  Object.entries(raw).forEach(([lesson, groups])=>{
    result[lesson]={
      words:(groups.words||[]).map(toEntry),
      phrases:(groups.phrases||[]).map(toEntry),
      sentences:(groups.sentences||[]).map(toEntry)
    };
  });
  return result;
}

const STORAGE_KEY = "englishAdminChineseDemoV1";
let lessons = normalizeLessons(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || structuredClone(DEFAULT_LESSONS));
let currentLesson = Object.keys(lessons)[0];
let importRows = [];
const labels = { words: "单词", phrases: "短语", sentences: "句子" };
const el = id => document.getElementById(id);

function saveLocal(message="已保存到本机演示数据"){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lessons));
  el("saveState").textContent = "刚刚保存";
  toast(message);
}
function toast(text){
  const t=el("toast"); t.textContent=text; t.classList.add("show");
  clearTimeout(window.__toastTimer); window.__toastTimer=setTimeout(()=>t.classList.remove("show"),1800);
}
function lessonTotal(name){ const l=lessons[name]; return l.words.length+l.phrases.length+l.sentences.length; }
function renderLessons(){
  const nav=el("lessonList"); nav.innerHTML="";
  Object.keys(lessons).forEach(name=>{
    const b=document.createElement("button");
    b.className="lesson-item"+(name===currentLesson?" active":"");
    b.innerHTML=`<span>${escapeHtml(name)}</span><span>${lessonTotal(name)}</span>`;
    b.onclick=()=>{currentLesson=name; renderAll(); document.body.classList.remove("menu-open")}; nav.appendChild(b);
  });
  el("importLesson").innerHTML=Object.keys(lessons).map(n=>`<option>${escapeHtml(n)}</option>`).join("");
  el("importLesson").value=currentLesson;
}
function renderAll(){
  renderLessons(); el("lessonTitle").textContent=currentLesson; el("breadcrumbLesson").textContent=currentLesson;
  const l=lessons[currentLesson]; el("wordCount").textContent=l.words.length; el("phraseCount").textContent=l.phrases.length;
  el("sentenceCount").textContent=l.sentences.length; el("totalCount").textContent=lessonTotal(currentLesson); renderDocument();
}
function renderDocument(){
  const query=el("searchInput").value.trim().toLowerCase(), filter=el("filterSelect").value, area=el("documentArea"); area.innerHTML="";
  ["words","phrases","sentences"].forEach(type=>{
    if(filter!=="all"&&filter!==type) return;
    const source=lessons[currentLesson][type];
    const matches=source.map((entry,index)=>({entry,index})).filter(x=>!query||x.entry.english.toLowerCase().includes(query)||x.entry.chinese.includes(query)||String(x.index+1)===query||labels[type].includes(query));
    const sec=document.createElement("section"); sec.className="doc-section"; sec.id=`section-${type}`;
    sec.innerHTML=`<div class="doc-header"><h2>${labels[type]}</h2><span class="count">显示 ${matches.length} / ${source.length}</span><button class="collapse">⌃</button></div><div class="column-head"><span>题号</span><span>英文内容</span><span>中文意思</span><span>操作</span></div><div class="doc-body"></div>`;
    const body=sec.querySelector(".doc-body"); if(!matches.length) body.innerHTML='<div class="empty">没有找到符合条件的内容</div>';
    matches.forEach(({entry,index})=>body.appendChild(makeRow(type,index,entry)));
    sec.querySelector(".doc-header").onclick=()=>{body.classList.toggle("collapsed");sec.querySelector(".column-head").classList.toggle("collapsed");sec.querySelector(".collapse").textContent=body.classList.contains("collapsed")?"⌄":"⌃"}; area.appendChild(sec);
  });
}
function makeRow(type,index,entry){
  const row=document.createElement("div"); row.className="item-row";
  row.innerHTML=`<div class="item-number">${index+1}.</div><div class="item-text english"><input value="${escapeAttr(entry.english)}" aria-label="英文"></div><div class="item-text chinese"><input value="${escapeAttr(entry.chinese)}" placeholder="中文意思" aria-label="中文"></div><div class="item-actions"><button class="mini-btn" title="试听">🔊</button><button class="mini-btn" title="向上移动">↑</button><button class="mini-btn" title="向下移动">↓</button><button class="mini-btn delete" title="删除">删</button></div>`;
  const inputs=row.querySelectorAll("input");
  inputs[0].onchange=()=>{entry.english=inputs[0].value.trim(); if(!entry.chinese&&CHINESE_TRANSLATIONS[entry.english]){entry.chinese=CHINESE_TRANSLATIONS[entry.english];inputs[1].value=entry.chinese} saveLocal("英文内容已修改")};
  inputs[1].onchange=()=>{entry.chinese=inputs[1].value.trim();saveLocal("中文意思已修改")};
  const btns=row.querySelectorAll("button"); btns[0].onclick=()=>speak(entry.english); btns[1].onclick=()=>moveItem(type,index,-1); btns[2].onclick=()=>moveItem(type,index,1);
  btns[3].onclick=()=>{if(confirm(`确定删除第 ${index+1} 条吗？`)){lessons[currentLesson][type].splice(index,1);saveLocal("已删除");renderAll()}}; return row;
}
function moveItem(type,index,delta){ const arr=lessons[currentLesson][type], next=index+delta; if(next<0||next>=arr.length)return; [arr[index],arr[next]]=[arr[next],arr[index]];saveLocal("顺序已调整");renderAll(); }
function speak(text){ if(!("speechSynthesis" in window)){toast("此浏览器不支持本机试听");return} speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang="en-US";u.rate=.82;speechSynthesis.speak(u); }
function classify(text){ const clean=text.trim(), count=clean.split(/\s+/).filter(Boolean).length; if(/[.!?]$/.test(clean))return "sentences";if(count<=1)return "words";if(count<=5)return "phrases";return "sentences"; }
el("importBtn").onclick=()=>el("txtInput").click();
el("txtInput").onchange=async e=>{const file=e.target.files[0];if(!file)return;const lines=(await file.text()).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);importRows=lines.map((english,i)=>({english,chinese:CHINESE_TRANSLATIONS[english]||"",type:classify(english),i}));renderImportPreview();el("importDialog").showModal();e.target.value=""};
function renderImportPreview(){
  const counts={words:0,phrases:0,sentences:0};importRows.forEach(r=>counts[r.type]++);el("importStats").textContent=`共 ${importRows.length} 条：单词 ${counts.words} · 短语 ${counts.phrases} · 句子 ${counts.sentences}`;
  const p=el("importPreview");p.innerHTML="";importRows.forEach((r,i)=>{const row=document.createElement("div");row.className="preview-row";row.innerHTML=`<strong>${i+1}</strong><select><option value="words">单词</option><option value="phrases">短语</option><option value="sentences">句子</option></select><input value="${escapeAttr(r.english)}" aria-label="英文"><input value="${escapeAttr(r.chinese)}" placeholder="自动补中文" aria-label="中文">`;const [s,en,zh]=row.querySelectorAll("select,input");s.value=r.type;s.onchange=()=>r.type=s.value;en.oninput=()=>{r.english=en.value;if(!zh.value&&CHINESE_TRANSLATIONS[r.english]){r.chinese=CHINESE_TRANSLATIONS[r.english];zh.value=r.chinese}};zh.oninput=()=>r.chinese=zh.value;p.appendChild(row)});
}
el("confirmImportBtn").onclick=()=>{const lesson=el("importLesson").value;importRows.forEach(r=>{if(r.english.trim())lessons[lesson][r.type].push({english:r.english.trim(),chinese:r.chinese.trim()})});currentLesson=lesson;saveLocal(`已导入 ${importRows.length} 条内容`);el("importDialog").close();renderAll()};
const fillChineseNow=()=>{let filled=0;Object.values(lessons).forEach(groups=>Object.values(groups).forEach(items=>items.forEach(entry=>{if(!entry.chinese&&CHINESE_TRANSLATIONS[entry.english]){entry.chinese=CHINESE_TRANSLATIONS[entry.english];filled++}})));saveLocal(filled?`已自动补上 ${filled} 条中文`:'现有资料的中文已经全部补齐');renderAll()};
el("fillChineseBtn").onclick=fillChineseNow;
el("fillChineseBtnBanner").onclick=fillChineseNow;
el("newLessonBtn").onclick=()=>{const name=prompt("请输入课程名称，例如 Lesson 11");if(!name||!name.trim())return;const n=name.trim();if(lessons[n]){toast("这个课程已经存在");return}lessons[n]={words:[],phrases:[],sentences:[]};currentLesson=n;saveLocal("新课程已建立");renderAll()};
el("saveBtn").onclick=()=>saveLocal();el("searchInput").oninput=renderDocument;el("filterSelect").onchange=renderDocument;el("menuBtn").onclick=()=>document.body.classList.toggle("menu-open");document.querySelectorAll(".summary[data-jump]").forEach(b=>b.onclick=()=>document.getElementById(`section-${b.dataset.jump}`)?.scrollIntoView({behavior:"smooth"}));
el("exportBtn").onclick=()=>{const l=lessons[currentLesson];const lines=[`# ${currentLesson}`,""];for(const type of ["words","phrases","sentences"]){lines.push(`[${labels[type]}]`);l[type].forEach((x,i)=>lines.push(`${i+1}. ${x.english}\t${x.chinese}`));lines.push("")}const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([lines.join("\n")],{type:"text/plain;charset=utf-8"}));a.download=`${currentLesson}-中英题库.txt`;a.click();URL.revokeObjectURL(a.href)};
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}function escapeAttr(s){return escapeHtml(s)}renderAll();
