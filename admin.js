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

const STORAGE_KEY = "englishAdminDemoLessonsV1";
let lessons = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || structuredClone(DEFAULT_LESSONS);
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

function lessonTotal(name){
  const l=lessons[name]; return l.words.length+l.phrases.length+l.sentences.length;
}

function renderLessons(){
  const nav=el("lessonList"); nav.innerHTML="";
  Object.keys(lessons).forEach(name=>{
    const b=document.createElement("button");
    b.className="lesson-item"+(name===currentLesson?" active":"");
    b.innerHTML=`<span>${escapeHtml(name)}</span><span>${lessonTotal(name)}</span>`;
    b.onclick=()=>{currentLesson=name; renderAll(); document.body.classList.remove("menu-open")};
    nav.appendChild(b);
  });
  const opts=Object.keys(lessons).map(n=>`<option>${escapeHtml(n)}</option>`).join("");
  el("importLesson").innerHTML=opts;
  el("importLesson").value=currentLesson;
}

function renderAll(){
  renderLessons();
  el("lessonTitle").textContent=currentLesson;
  el("breadcrumbLesson").textContent=currentLesson;
  const l=lessons[currentLesson];
  el("wordCount").textContent=l.words.length;
  el("phraseCount").textContent=l.phrases.length;
  el("sentenceCount").textContent=l.sentences.length;
  el("totalCount").textContent=lessonTotal(currentLesson);
  renderDocument();
}

function renderDocument(){
  const query=el("searchInput").value.trim().toLowerCase();
  const filter=el("filterSelect").value;
  const area=el("documentArea"); area.innerHTML="";
  ["words","phrases","sentences"].forEach(type=>{
    if(filter!=="all"&&filter!==type) return;
    const source=lessons[currentLesson][type];
    const matches=source.map((text,index)=>({text,index})).filter(x=>!query||x.text.toLowerCase().includes(query)||String(x.index+1)===query||labels[type].includes(query));
    const sec=document.createElement("section"); sec.className="doc-section"; sec.id=`section-${type}`;
    sec.innerHTML=`<div class="doc-header"><h2>${labels[type]}</h2><span class="count">显示 ${matches.length} / ${source.length}</span><button class="collapse">⌃</button></div><div class="doc-body"></div>`;
    const body=sec.querySelector(".doc-body");
    if(!matches.length){body.innerHTML='<div class="empty">没有找到符合条件的内容</div>'}
    matches.forEach(({text,index})=>body.appendChild(makeRow(type,index,text)));
    sec.querySelector(".doc-header").onclick=()=>{body.classList.toggle("collapsed"); sec.querySelector(".collapse").textContent=body.classList.contains("collapsed")?"⌄":"⌃"};
    area.appendChild(sec);
  });
}

function makeRow(type,index,text){
  const row=document.createElement("div"); row.className="item-row";
  row.innerHTML=`<div class="item-number">${index+1}.</div><div class="item-text"><input value="${escapeAttr(text)}" aria-label="${labels[type]}第${index+1}题"></div><div class="item-actions"><button class="mini-btn" title="试听">🔊</button><button class="mini-btn" title="向上移动">↑</button><button class="mini-btn" title="向下移动">↓</button><button class="mini-btn delete" title="删除">删</button></div>`;
  const input=row.querySelector("input");
  input.onchange=()=>{lessons[currentLesson][type][index]=input.value.trim(); saveLocal("内容已修改")};
  const btns=row.querySelectorAll("button");
  btns[0].onclick=()=>speak(text);
  btns[1].onclick=()=>moveItem(type,index,-1);
  btns[2].onclick=()=>moveItem(type,index,1);
  btns[3].onclick=()=>{if(confirm(`确定删除第 ${index+1} 条吗？`)){lessons[currentLesson][type].splice(index,1);saveLocal("已删除");renderAll()}};
  return row;
}

function moveItem(type,index,delta){
  const arr=lessons[currentLesson][type], next=index+delta;
  if(next<0||next>=arr.length) return;
  [arr[index],arr[next]]=[arr[next],arr[index]]; saveLocal("顺序已调整"); renderAll();
}

function speak(text){
  if(!("speechSynthesis" in window)){toast("此浏览器不支持本机试听");return}
  speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text); u.lang="en-US"; u.rate=.82; speechSynthesis.speak(u);
}

function classify(text){
  const clean=text.trim();
  const count=clean.split(/\s+/).filter(Boolean).length;
  if(/[.!?]$/.test(clean)) return "sentences";
  if(count<=1) return "words";
  if(count<=5) return "phrases";
  return "sentences";
}

el("importBtn").onclick=()=>el("txtInput").click();
el("txtInput").onchange=async e=>{
  const file=e.target.files[0]; if(!file)return;
  const lines=(await file.text()).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  importRows=lines.map((text,i)=>({text,type:classify(text),i}));
  renderImportPreview(); el("importDialog").showModal(); e.target.value="";
};

function renderImportPreview(){
  const counts={words:0,phrases:0,sentences:0}; importRows.forEach(r=>counts[r.type]++);
  el("importStats").textContent=`共 ${importRows.length} 条：单词 ${counts.words} · 短语 ${counts.phrases} · 句子 ${counts.sentences}`;
  const p=el("importPreview"); p.innerHTML="";
  importRows.forEach((r,i)=>{
    const row=document.createElement("div"); row.className="preview-row";
    row.innerHTML=`<strong>${i+1}</strong><select><option value="words">单词</option><option value="phrases">短语</option><option value="sentences">句子</option></select><input value="${escapeAttr(r.text)}">`;
    const s=row.querySelector("select"), input=row.querySelector("input"); s.value=r.type;
    s.onchange=()=>r.type=s.value; input.oninput=()=>r.text=input.value;
    p.appendChild(row);
  });
}

el("confirmImportBtn").onclick=()=>{
  const lesson=el("importLesson").value;
  importRows.forEach(r=>{if(r.text.trim()) lessons[lesson][r.type].push(r.text.trim())});
  currentLesson=lesson; saveLocal(`已导入 ${importRows.length} 条内容`); el("importDialog").close(); renderAll();
};

el("newLessonBtn").onclick=()=>{
  const name=prompt("请输入课程名称，例如 Lesson 11"); if(!name||!name.trim())return;
  const n=name.trim(); if(lessons[n]){toast("这个课程已经存在");return}
  lessons[n]={words:[],phrases:[],sentences:[]}; currentLesson=n; saveLocal("新课程已建立"); renderAll();
};

el("saveBtn").onclick=()=>saveLocal();
el("searchInput").oninput=renderDocument;
el("filterSelect").onchange=renderDocument;
el("menuBtn").onclick=()=>document.body.classList.toggle("menu-open");
document.querySelectorAll(".summary[data-jump]").forEach(b=>b.onclick=()=>document.getElementById(`section-${b.dataset.jump}`)?.scrollIntoView({behavior:"smooth"}));

el("exportBtn").onclick=()=>{
  const l=lessons[currentLesson];
  const text=[`# ${currentLesson}`,"","[单词]",...l.words,"","[短语]",...l.phrases,"","[句子]",...l.sentences].join("\n");
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([text],{type:"text/plain;charset=utf-8"})); a.download=`${currentLesson}.txt`; a.click(); URL.revokeObjectURL(a.href);
};

function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function escapeAttr(s){return escapeHtml(s)}
renderAll();
