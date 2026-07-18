(() => {
  const STORAGE_KEY = "englishLessonBankV1";
  const TYPES = {
    words: {label:"单词", hint:"孩子看到中文，并输入英文；也可以将题目设为听音题。"},
    phrases: {label:"短语", hint:"孩子看到中文短语，并输入对应英文。"},
    sentences: {label:"句子", hint:"孩子看到中文句子，并输入完整英文句子。"}
  };

  let bank = cloneBank(window.LESSON_BANK || {});
  let currentLessonId = Number(Object.keys(bank)[0] || 1);
  let currentType = "words";

  const el = id => document.getElementById(id);

  function cloneBank(value){
    return JSON.parse(JSON.stringify(value || {}));
  }

  function blankItem(){
    return {prompt:"", answer:"", audioText:"", mode:"chinese"};
  }

  function normalizeLesson(lessonId){
    if(!bank[lessonId]){
      bank[lessonId] = {
        title:`Lesson ${lessonId}`,
        words:Array.from({length:30}, blankItem),
        phrases:Array.from({length:30}, blankItem),
        sentences:Array.from({length:30}, blankItem)
      };
    }
    for(const type of Object.keys(TYPES)){
      if(!Array.isArray(bank[lessonId][type])) bank[lessonId][type] = [];
      bank[lessonId][type] = bank[lessonId][type].slice(0,30);
      while(bank[lessonId][type].length < 30) bank[lessonId][type].push(blankItem());
      bank[lessonId][type] = bank[lessonId][type].map(item => ({
        prompt:String(item?.prompt || ""),
        answer:String(item?.answer || ""),
        audioText:String(item?.audioText || item?.answer || ""),
        mode:item?.mode === "audio" ? "audio" : "chinese"
      }));
    }
  }

  function filledCount(type){
    normalizeLesson(currentLessonId);
    return bank[currentLessonId][type].filter(item => item.answer.trim()).length;
  }

  function saveLocal(showMessage=true){
    normalizeLesson(currentLessonId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bank));
    window.LESSON_BANK = bank;
    if(showMessage) showDialog("保存成功", "题库已经保存在当前设备中。孩子测试页面重新打开后会读取最新题库。");
  }

  function showDialog(title, html){
    el("messageTitle").textContent = title;
    el("messageBody").innerHTML = html;
    el("messageDialog").showModal();
  }

  function renderLessons(){
    const ids = Object.keys(bank).map(Number).sort((a,b)=>a-b);
    el("lessonCount").textContent = `${ids.length} Lessons`;
    const list = el("lessonList");
    list.innerHTML = "";

    ids.forEach(id => {
      normalizeLesson(id);
      const button = document.createElement("button");
      button.className = "lesson-item";
      if(id === currentLessonId) button.classList.add("active");
      button.innerHTML = `
        <strong>${escapeHtml(bank[id].title || `Lesson ${id}`)}</strong>
        <small>${countLessonFilled(id)} / 90 已填写</small>
      `;
      button.onclick = () => {
        currentLessonId = id;
        renderAll();
      };
      list.appendChild(button);
    });
  }

  function countLessonFilled(id){
    normalizeLesson(id);
    return ["words","phrases","sentences"]
      .reduce((sum,type)=>sum + bank[id][type].filter(item=>item.answer.trim()).length,0);
  }

  function renderSummary(){
    normalizeLesson(currentLessonId);
    el("lessonTitleInput").value = bank[currentLessonId].title || `Lesson ${currentLessonId}`;
    for(const type of Object.keys(TYPES)){
      const count = filledCount(type);
      el(`${type}Count`).textContent = `${count} / 30`;
      el(`${type}TabCount`).textContent = count;
    }
  }

  function renderTabs(){
    document.querySelectorAll(".admin-tab").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.type === currentType);
    });
    el("tableTitle").textContent = `${TYPES[currentType].label}（30题）`;
    el("tableHint").textContent = TYPES[currentType].hint;
  }

  function renderRows(){
    normalizeLesson(currentLessonId);
    const body = el("bankRows");
    body.innerHTML = "";

    bank[currentLessonId][currentType].forEach((item,index) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="number-cell">${index+1}</td>
        <td><input class="table-input chinese-input" placeholder="输入中文提示"></td>
        <td><input class="table-input english-input" placeholder="输入英文答案"></td>
        <td>
          <select class="mode-select">
            <option value="chinese">看中文</option>
            <option value="audio">听声音</option>
          </select>
        </td>
        <td><button type="button" class="play-row-btn" title="播放英文">🔊</button></td>
      `;

      const chinese = tr.querySelector(".chinese-input");
      const english = tr.querySelector(".english-input");
      const mode = tr.querySelector(".mode-select");
      const play = tr.querySelector(".play-row-btn");

      chinese.value = item.prompt;
      english.value = item.answer;
      mode.value = item.mode;

      chinese.addEventListener("input", () => {
        item.prompt = chinese.value;
        renderSummary();
      });
      english.addEventListener("input", () => {
        item.answer = english.value;
        item.audioText = english.value;
        renderSummary();
        renderLessons();
      });
      mode.addEventListener("change", () => {
        item.mode = mode.value;
      });
      play.onclick = () => playEnglish(item.audioText || item.answer);

      tr.classList.toggle("row-complete", Boolean(item.answer.trim()));
      english.addEventListener("input", () => {
        tr.classList.toggle("row-complete", Boolean(english.value.trim()));
      });

      body.appendChild(tr);
    });
  }

  function renderAll(){
    renderLessons();
    renderSummary();
    renderTabs();
    renderRows();
  }

  function escapeHtml(value){
    return String(value).replace(/[&<>"']/g, ch => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    })[ch]);
  }

  function playEnglish(text){
    const clean = String(text || "").trim();
    if(!clean){
      showDialog("没有英文内容", "请先填写这一题的英文答案。");
      return;
    }
    if(!("speechSynthesis" in window)){
      showDialog("无法播放", "当前浏览器不支持本机语音播放。");
      return;
    }
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = "en-US";
    utter.rate = 0.85;
    speechSynthesis.speak(utter);
  }

  function parseLine(line){
    const clean = line.trim();
    if(!clean) return null;

    let english = clean;
    let chinese = "";
    const separators = ["\t","|","｜","="];
    for(const separator of separators){
      if(clean.includes(separator)){
        const parts = clean.split(separator);
        english = parts.shift().trim();
        chinese = parts.join(separator).trim();
        break;
      }
    }

    english = english.replace(/^\d+[\s.)、-]*/, "").trim();
    if(!english) return null;

    const wordCount = english.split(/\s+/).filter(Boolean).length;
    const type = wordCount === 1 ? "words" : (wordCount <= 5 ? "phrases" : "sentences");
    return {
      type,
      item:{prompt:chinese, answer:english, audioText:english, mode:"chinese"}
    };
  }

  function importLines(text){
    normalizeLesson(currentLessonId);
    const parsed = String(text || "").split(/\r?\n/).map(parseLine).filter(Boolean);
    if(!parsed.length){
      showDialog("没有找到题目", "请确认每一行至少包含一个英文单词、短语或句子。");
      return;
    }

    const grouped = {words:[],phrases:[],sentences:[]};
    parsed.forEach(row => grouped[row.type].push(row.item));

    const report = [];
    for(const type of Object.keys(TYPES)){
      const items = grouped[type].slice(0,30);
      if(items.length){
        const existing = bank[currentLessonId][type];
        let insertAt = existing.findIndex(item => !item.answer.trim());
        if(insertAt < 0) insertAt = 0;
        let inserted = 0;
        for(const item of items){
          if(insertAt >= 30) break;
          existing[insertAt] = item;
          insertAt++;
          inserted++;
        }
        report.push(`${TYPES[type].label}：导入 ${inserted} 题`);
      }
    }

    saveLocal(false);
    renderAll();
    showDialog("导入完成", report.join("<br>") + "<br><br>分类规则：1个词为单词，2–5个词为短语，超过5个词为句子。");
  }

  document.querySelectorAll(".admin-tab").forEach(btn => {
    btn.onclick = () => {
      currentType = btn.dataset.type;
      renderTabs();
      renderRows();
    };
  });

  el("lessonTitleInput").addEventListener("input", () => {
    bank[currentLessonId].title = el("lessonTitleInput").value;
    renderLessons();
  });

  el("saveBankBtn").onclick = () => saveLocal(true);

  el("addLessonBtn").onclick = () => {
    const ids = Object.keys(bank).map(Number);
    const nextId = ids.length ? Math.max(...ids) + 1 : 1;
    normalizeLesson(nextId);
    currentLessonId = nextId;
    renderAll();
  };

  el("clearSectionBtn").onclick = () => {
    if(confirm(`确定清空当前 Lesson 的全部${TYPES[currentType].label}吗？`)){
      bank[currentLessonId][currentType] = Array.from({length:30}, blankItem);
      renderAll();
    }
  };

  el("openPasteBtn").onclick = () => {
    el("pasteText").value = "";
    el("pasteDialog").showModal();
  };

  el("importTextBtn").onclick = () => {
    el("pasteDialog").close();
    importLines(el("pasteText").value);
  };

  el("txtFile").addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if(!file) return;
    const text = await file.text();
    importLines(text);
    event.target.value = "";
  });

  el("autoChineseBtn").onclick = () => {
    const missing = Object.keys(TYPES).reduce((total,type) => {
      normalizeLesson(currentLessonId);
      return total + bank[currentLessonId][type].filter(item => item.answer.trim() && !item.prompt.trim()).length;
    },0);

    if(!missing){
      showDialog("不需要补充", "当前 Lesson 中已填写英文的题目，都已经有中文提示。");
      return;
    }
    showDialog(
      "自动补中文",
      `当前有 <b>${missing}</b> 道题缺少中文。<br><br>` +
      "这个按钮已经保留在家长后台中。正式连接翻译服务后，点击一次即可批量补充中文；目前为了避免产生错误翻译或额外费用，不会自动填写假的中文。"
    );
  };

  renderAll();
})(); 
