(() => {
  const activeChild = getActiveChild();
  if(!activeChild){
    location.replace("children.html");
    return;
  }

  const LESSON_ID = 1;
  const PAGE_SIZE = 10;
  const lesson = window.LESSON_BANK?.[LESSON_ID];
  if(!lesson) throw new Error("没有找到 Lesson 题库");

  const sections = {
    words: {label:"单词", items:lesson.words},
    phrases: {label:"短语", items:lesson.phrases},
    sentences: {label:"句子", items:lesson.sentences}
  };

  for(const [key, sec] of Object.entries(sections)){
    if(!Array.isArray(sec.items) || sec.items.length !== 30){
      throw new Error(`${sec.label}必须正好是30题`);
    }
  }

  const storageBase = `englishExam:${activeChild.id}:lesson:${LESSON_ID}`;
  const stateKey = `${storageBase}:answers`;
  const sectionKey = `${storageBase}:section`;
  const pageKey = `${storageBase}:page`;
  const timerKey = `${storageBase}:timer`;
  const submittedKey = `${storageBase}:submitted`;

  let state;
  try { state = JSON.parse(localStorage.getItem(stateKey) || "{}"); }
  catch { state = {}; }

  for(const key of Object.keys(sections)){
    if(!Array.isArray(state[key])) state[key] = Array(30).fill("");
    state[key] = state[key].slice(0,30);
    while(state[key].length < 30) state[key].push("");
  }

  let currentSection = localStorage.getItem(sectionKey) || "words";
  if(!sections[currentSection]) currentSection = "words";
  let currentPage = Number(localStorage.getItem(pageKey) || 0);
  if(!Number.isInteger(currentPage) || currentPage < 0 || currentPage > 2) currentPage = 0;
  let currentQuestion = currentPage * PAGE_SIZE;

  const el = id => document.getElementById(id);
  el("activeChildName").textContent = activeChild.name;

  let timerState;
  try { timerState = JSON.parse(localStorage.getItem(timerKey) || "null"); }
  catch { timerState = null; }

  const now = Date.now();
  if(!timerState || timerState.finished){
    timerState = {
      accumulatedMs: 0,
      runningSince: now,
      sessionStartedAt: now,
      finished: false
    };
  }else{
    timerState.runningSince = now;
    timerState.sessionStartedAt = now;
  }
  localStorage.setItem(timerKey, JSON.stringify(timerState));

  function formatClock(ms){
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = String(Math.floor(total / 3600)).padStart(2,"0");
    const m = String(Math.floor((total % 3600) / 60)).padStart(2,"0");
    const s = String(total % 60).padStart(2,"0");
    return `${h}:${m}:${s}`;
  }
  function formatDateTime(ts){
    return new Date(ts).toLocaleString("zh-CN", {
      year:"numeric", month:"2-digit", day:"2-digit",
      hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false
    });
  }
  function currentElapsed(){
    return timerState.accumulatedMs + (timerState.finished ? 0 : Date.now() - timerState.runningSince);
  }
  function renderTimer(){
    el("elapsedTime").textContent = formatClock(currentElapsed());
  }
  el("startTime").textContent = formatDateTime(timerState.sessionStartedAt);
  renderTimer();
  const timerInterval = setInterval(renderTimer, 1000);

  function persistTimer(){
    if(timerState.finished) return;
    timerState.accumulatedMs = currentElapsed();
    timerState.runningSince = Date.now();
    localStorage.setItem(timerKey, JSON.stringify(timerState));
  }
  window.addEventListener("pagehide", persistTimer);
  document.addEventListener("visibilitychange", () => {
    if(document.hidden) persistTimer();
  });

  let saveTimer;
  function save(){
    localStorage.setItem(stateKey, JSON.stringify(state));
    localStorage.setItem(sectionKey, currentSection);
    localStorage.setItem(pageKey, String(currentPage));
    el("saveStatus").textContent = "✓ 已自动保存";
    el("saveStatus").classList.remove("saving");
  }
  function queueSave(){
    el("saveStatus").textContent = "正在保存…";
    el("saveStatus").classList.add("saving");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 180);
  }

  function completedCount(section){
    return state[section].filter(v => String(v).trim()).length;
  }
  function updateAllProgress(){
    for(const key of Object.keys(sections)){
      const count = completedCount(key);
      el(`${key}Progress`).textContent = `${count} / 30`;
      el(`${key}Bar`).style.width = `${count / 30 * 100}%`;
    }
    const count = completedCount(currentSection);
    el("progressText").textContent = `已完成 ${count} / 30 题`;
    el("longProgressBar").style.width = `${count / 30 * 100}%`;
    el("progressPercent").textContent = `${Math.round(count / 30 * 100)}%`;
  }

  function speak(text){
    if(!("speechSynthesis" in window)){
      alert("当前浏览器不支持语音播放");
      return;
    }
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";
    utter.rate = 0.86;
    speechSynthesis.speak(utter);
  }

  function renderQuestions(){
    document.querySelectorAll(".progress-tab").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.section === currentSection);
    });

    const sec = sections[currentSection];
    el("sectionTitle").textContent = `${lesson.title} - ${sec.label}`;
    const start = currentPage * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, 30);
    const box = el("questions");
    box.innerHTML = "";

    sec.items.slice(start,end).forEach((item, localIndex) => {
      const index = start + localIndex;
      const card = document.createElement("article");
      card.className = "question-card";
      if(state[currentSection][index].trim()) card.classList.add("answered");
      if(index === currentQuestion) card.classList.add("current");
      card.id = `question-${index+1}`;

      const top = document.createElement("div");
      top.className = "question-top";
      const heading = document.createElement("strong");
      heading.textContent = `${index+1}.`;
      top.appendChild(heading);

      if(item.mode === "audio"){
        const audioBtn = document.createElement("button");
        audioBtn.type = "button";
        audioBtn.className = "audio-btn";
        audioBtn.textContent = "🔊 听声音";
        audioBtn.onclick = () => speak(item.audioText || item.answer);
        top.appendChild(audioBtn);
      } else {
        const prompt = document.createElement("span");
        prompt.className = "chinese-prompt";
        prompt.textContent = item.prompt || "中文提示";
        top.appendChild(prompt);
        if(item.audioText){
          const smallAudio = document.createElement("button");
          smallAudio.type = "button";
          smallAudio.className = "small-audio";
          smallAudio.textContent = "🔊";
          smallAudio.onclick = () => speak(item.audioText);
          top.appendChild(smallAudio);
        }
      }

      const input = document.createElement(currentSection === "sentences" ? "textarea" : "input");
      if(input.tagName === "INPUT") input.type = "text";
      input.className = "english-answer";
      input.value = state[currentSection][index] || "";
      input.placeholder = "请输入英文";
      input.autocomplete = "off";
      input.autocapitalize = "sentences";
      input.spellcheck = false;
      input.setAttribute("aria-label", `${sec.label}第${index+1}题，输入英文答案`);
      input.addEventListener("focus", () => {
        currentQuestion = index;
        renderNumberGrid();
        document.querySelectorAll(".question-card").forEach(c => c.classList.remove("current"));
        card.classList.add("current");
      });
      input.addEventListener("input", () => {
        state[currentSection][index] = input.value;
        card.classList.toggle("answered", input.value.trim().length > 0);
        queueSave();
        updateAllProgress();
        renderNumberGrid();
      });

      card.append(top,input);
      box.appendChild(card);
    });

    el("pageInfo").textContent = `第 ${currentPage+1} / 3 页（${start+1}–${end}题）`;
    el("prevPageBtn").disabled = currentPage === 0;
    el("nextPageBtn").textContent = currentPage === 2 ? "已经是最后一页" : "下一页";
    el("nextPageBtn").disabled = currentPage === 2;
    el("bottomSubmitArea").classList.toggle("hidden", currentPage !== 2);
    renderNumberGrid();
    updateAllProgress();
  }

  function renderNumberGrid(){
    const grid = el("numberGrid");
    grid.innerHTML = "";
    for(let i=0;i<30;i++){
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = i+1;
      if(state[currentSection][i].trim()) btn.classList.add("done");
      if(i === currentQuestion) btn.classList.add("current");
      btn.onclick = () => goToQuestion(i);
      grid.appendChild(btn);
    }
  }

  function goToQuestion(index){
    currentQuestion = Math.max(0,Math.min(29,index));
    currentPage = Math.floor(currentQuestion / PAGE_SIZE);
    save();
    renderQuestions();
    requestAnimationFrame(() => {
      const card = document.getElementById(`question-${currentQuestion+1}`);
      const input = card?.querySelector(".english-answer");
      card?.scrollIntoView({behavior:"smooth",block:"center"});
      setTimeout(() => input?.focus(), 250);
    });
  }

  function switchSection(key){
    currentSection = key;
    currentPage = 0;
    currentQuestion = 0;
    save();
    renderQuestions();
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function normalize(v){
    return String(v || "")
      .trim()
      .toLowerCase()
      .replace(/[“”‘’']/g,"")
      .replace(/[.,!?;:，。！？；：]/g,"")
      .replace(/\s+/g," ");
  }

  function submitSection(){
    const sec = sections[currentSection];
    const answered = completedCount(currentSection);
    let correct = 0;
    const wrong = [];
    sec.items.forEach((item,i) => {
      if(normalize(state[currentSection][i]) === normalize(item.answer)) correct++;
      else if(state[currentSection][i].trim()) wrong.push(i+1);
    });
    localStorage.setItem(submittedKey, JSON.stringify({
      ...(JSON.parse(localStorage.getItem(submittedKey) || "{}")),
      [currentSection]: {submittedAt:Date.now(), answered, correct}
    }));

    el("resultTitle").textContent = `${sec.label}提交结果`;
    el("resultBody").innerHTML = `
      <div class="result-summary">
        <strong>已填写：${answered} / 30</strong>
        <strong>正确：${correct} / 30</strong>
        <strong>未填写：${30-answered}</strong>
      </div>
      ${wrong.length ? `<p>需要检查的题号：${wrong.join("、")}</p>` : "<p>本部分没有发现错误。</p>"}
      <p class="muted">计时器会继续累计，直到三个部分全部正式提交完成。</p>
    `;
    el("resultDialog").showModal();

    const submitted = JSON.parse(localStorage.getItem(submittedKey) || "{}");
    if(submitted.words && submitted.phrases && submitted.sentences){
      persistTimer();
      timerState.finished = true;
      localStorage.setItem(timerKey, JSON.stringify(timerState));
      clearInterval(timerInterval);
    }
  }

  document.querySelectorAll(".progress-tab").forEach(btn => {
    btn.onclick = () => switchSection(btn.dataset.section);
  });
  el("prevPageBtn").onclick = () => {
    if(currentPage > 0){ currentPage--; currentQuestion = currentPage*10; save(); renderQuestions(); }
  };
  el("nextPageBtn").onclick = () => {
    if(currentPage < 2){ currentPage++; currentQuestion = currentPage*10; save(); renderQuestions(); }
  };
  el("submitTopBtn").onclick = submitSection;
  el("submitBottomBtn").onclick = submitSection;

  el("jumpBtn").onclick = () => el("jumpDialog").showModal();
  el("jumpConfirm").onclick = () => {
    const n = Number(el("jumpInput").value);
    if(n >= 1 && n <= 30){
      el("jumpDialog").close();
      goToQuestion(n-1);
    }
  };

  renderQuestions();
})(); 
