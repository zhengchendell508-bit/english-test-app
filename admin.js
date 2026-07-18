(() => {
  const STORAGE_KEY = "englishLessonBankV2";
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

  function cleanItem(item){
    return {
      prompt:String(item?.prompt || "").trim(),
      answer:String(item?.answer || "").trim(),
      audioText:String(item?.audioText || item?.answer || "").trim(),
      mode:item?.mode === "audio" ? "audio" : "chinese"
    };
  }

  function normalizeLesson(lessonId){
    if(!bank[lessonId]){
      bank[lessonId] = {
        title:`Lesson ${lessonId}`,
        words:[],
        phrases:[],
        sentences:[]
      };
    }

    bank[lessonId].title = String(bank[lessonId].title || `Lesson ${lessonId}`);

    for(const type of Object.keys(TYPES)){
      const original = Array.isArray(bank[lessonId][type]) ? bank[lessonId][type] : [];
      bank[lessonId][type] = original.slice(0,30).map(cleanItem);
      while(bank[lessonId][type].length < 30){
        bank[lessonId][type].push(blankItem());
      }
    }
  }

  function normalizeAll(){
    const ids = Object.keys(bank).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
    if(!ids.length){
      bank = {};
      normalizeLesson(1);
      currentLessonId = 1;
      return;
    }
    ids.forEach(normalizeLesson);
  }

  function flattenBank(){
    normalizeAll();
    const pools = {words:[], phrases:[], sentences:[]};

    for(const id of Object.keys(bank).map(Number).sort((a,b)=>a-b)){
      for(const type of Object.keys(TYPES)){
        for(const raw of bank[id][type]){
          const item = cleanItem(raw);
          if(item.answer) pools[type].push(item);
        }
      }
    }
    return pools;
  }

  function uniqueByEnglish(items){
    const seen = new Set();
    const output = [];
    for(const raw of items){
      const item = cleanItem(raw);
      const key = item.answer.toLocaleLowerCase().replace(/\s+/g," ").trim();
      if(!key || seen.has(key)) continue;
      seen.add(key);
      output.push(item);
    }
    return output;
  }

  function rebuildLessons(pools){
    const cleaned = {
      words: uniqueByEnglish(pools.words || []),
      phrases: uniqueByEnglish(pools.phrases || []),
      sentences: uniqueByEnglish(pools.sentences || [])
    };

    // 分课规则：
    // 单词、短语、句子三类中，只要任何一类进入下一个 30 条区间，
    // 就生成对应的新 Lesson。其他不足的类别保持空白。
    const wordLessons = Math.ceil(cleaned.words.length / 30);
    const phraseLessons = Math.ceil(cleaned.phrases.length / 30);
    const sentenceLessons = Math.ceil(cleaned.sentences.length / 30);
    const lessonTotal = Math.max(1, wordLessons, phraseLessons, sentenceLessons);

    const newBank = {};
    for(let lessonId=1; lessonId<=lessonTotal; lessonId++){
      newBank[lessonId] = {title:`Lesson ${lessonId}`};
      for(const type of Object.keys(TYPES)){
        const start = (lessonId - 1) * 30;
        const items = cleaned[type].slice(start, start + 30).map(cleanItem);
        while(items.length < 30) items.push(blankItem());
        newBank[lessonId][type] = items;
      }
    }

    bank = newBank;
    currentLessonId = Math.min(currentLessonId, lessonTotal);
    if(!bank[currentLessonId]) currentLessonId = 1;
    return cleaned;
  }

  function filledCount(type, lessonId=currentLessonId){
    normalizeLesson(lessonId);
    return bank[lessonId][type].filter(item => item.answer.trim()).length;
  }

  function countAll(){
    const pools = flattenBank();
    return {
      words: uniqueByEnglish(pools.words).length,
      phrases: uniqueByEnglish(pools.phrases).length,
      sentences: uniqueByEnglish(pools.sentences).length,
      lessons: Object.keys(bank).length
    };
  }

  function saveLocal(showMessage=true){
    normalizeAll();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bank));
    window.LESSON_BANK = bank;
    if(showMessage){
      showDialog("保存成功", "题库已经保存在当前设备中。孩子测试页面重新打开后会读取最新题库。");
    }
  }

  function showDialog(title, html){
    el("messageTitle").textContent = title;
    el("messageBody").innerHTML = html;
    el("messageDialog").showModal();
  }

  function escapeHtml(value){
    return String(value).replace(/[&<>"']/g, ch => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    })[ch]);
  }

  function renderLessons(){
    normalizeAll();
    const ids = Object.keys(bank).map(Number).sort((a,b)=>a-b);
    el("lessonCount").textContent = `${ids.length} Lessons`;
    const list = el("lessonList");
    list.innerHTML = "";

    ids.forEach(id => {
      const button = document.createElement("button");
      button.className = "lesson-item";
      if(id === currentLessonId) button.classList.add("active");
      button.innerHTML = `
        <strong>${escapeHtml(bank[id].title || `Lesson ${id}`)}</strong>
        <small>
          单 ${filledCount("words",id)}/30 ·
          短 ${filledCount("phrases",id)}/30 ·
          句 ${filledCount("sentences",id)}/30
        </small>
      `;
      button.onclick = () => {
        currentLessonId = id;
        renderAll();
      };
      list.appendChild(button);
    });
  }

  function renderGlobalCounts(){
    const totals = countAll();
    el("totalWords").textContent = totals.words;
    el("totalPhrases").textContent = totals.phrases;
    el("totalSentences").textContent = totals.sentences;
    el("totalLessons").textContent = totals.lessons;
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

  function updateBatchSelectionState(){
    const boxes = [...document.querySelectorAll(".row-select")];
    const selected = boxes.filter(box => box.checked);
    el("selectedRowsCount").textContent = `已选择 ${selected.length} 题`;

    const selectAll = el("selectAllRows");
    selectAll.checked = boxes.length > 0 && selected.length === boxes.length;
    selectAll.indeterminate = selected.length > 0 && selected.length < boxes.length;
  }

  function selectedRowIndexes(){
    return [...document.querySelectorAll(".row-select:checked")]
      .map(box => Number(box.dataset.index))
      .filter(Number.isInteger);
  }

  function applyModeToSelected(mode){
    const indexes = selectedRowIndexes();
    if(!indexes.length){
      showDialog("还没有选择题目", "请先勾选需要修改的题目，或者点击“全选本页”。");
      return;
    }

    indexes.forEach(index => {
      const item = bank[currentLessonId][currentType][index];
      if(item) item.mode = mode;
    });

    document.querySelectorAll(".bank-table tbody tr").forEach((row,index) => {
      if(indexes.includes(index)){
        const select = row.querySelector(".mode-select");
        if(select) select.value = mode;
      }
    });

    saveLocal(false);
    showDialog(
      "批量设置完成",
      `已将 <b>${indexes.length}</b> 道题设置为“${mode === "audio" ? "播放声音" : "显示中文"}”。`
    );
  }

  function renderRows(){
    normalizeLesson(currentLessonId);
    const body = el("bankRows");
    body.innerHTML = "";
    el("selectAllRows").checked = false;
    el("selectAllRows").indeterminate = false;

    bank[currentLessonId][currentType].forEach((item,index) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="select-cell"><input class="row-select" type="checkbox" data-index="${index}" aria-label="选择第 ${index+1} 题"></td>
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

      const rowSelect = tr.querySelector(".row-select");
      const chinese = tr.querySelector(".chinese-input");
      const english = tr.querySelector(".english-input");
      const mode = tr.querySelector(".mode-select");
      const play = tr.querySelector(".play-row-btn");

      chinese.value = item.prompt;
      english.value = item.answer;
      mode.value = item.mode;

      rowSelect.addEventListener("change", updateBatchSelectionState);

      chinese.addEventListener("input", () => {
        item.prompt = chinese.value;
      });

      english.addEventListener("input", () => {
        item.answer = english.value;
        item.audioText = english.value;
        tr.classList.toggle("row-complete", Boolean(english.value.trim()));
        renderSummary();
        renderGlobalCounts();
        renderLessons();
      });

      mode.addEventListener("change", () => {
        item.mode = mode.value;
      });

      play.onclick = () => playEnglish(item.audioText || item.answer);
      tr.classList.toggle("row-complete", Boolean(item.answer.trim()));
      body.appendChild(tr);
    });

    updateBatchSelectionState();
  }

  function renderAll(){
    renderLessons();
    renderGlobalCounts();
    renderSummary();
    renderTabs();
    renderRows();
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

  function classifyEnglish(english){
    const text = String(english || "").trim();
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if(wordCount <= 1) return "words";
    if(wordCount <= 5) return "phrases";
    return "sentences";
  }

  function parseTxtLine(line){
    const clean = String(line || "").trim();
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

    return {
      type: classifyEnglish(english),
      item: {prompt:chinese, answer:english, audioText:english, mode:"chinese"}
    };
  }

  function parseTxt(text){
    return String(text || "")
      .split(/\r?\n/)
      .map(parseTxtLine)
      .filter(Boolean);
  }

  function parseJsTranslations(text){
    const source = String(text || "").replace(/^\uFEFF/, "");
    const assignmentMatch = source.match(
      /(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*({[\s\S]*})\s*;?\s*$/
    );

    if(!assignmentMatch){
      throw new Error("没有找到 JS 翻译对象。文件应类似：const CHINESE_TRANSLATIONS = { \"apple\": \"苹果\" };");
    }

    let objectText = assignmentMatch[1].trim();
    objectText = objectText.replace(/,\s*}/g, "}");

    let translations;
    try{
      translations = JSON.parse(objectText);
    }catch{
      throw new Error("JS 文件中的对象必须使用双引号，例如：\"apple\": \"苹果\"。");
    }

    if(!translations || Array.isArray(translations) || typeof translations !== "object"){
      throw new Error("JS 文件中没有有效的英文—中文对照表。");
    }

    return Object.entries(translations)
      .map(([english,chinese]) => ({
        type: classifyEnglish(english),
        item: {
          prompt:String(chinese ?? "").trim(),
          answer:String(english ?? "").trim(),
          audioText:String(english ?? "").trim(),
          mode:"chinese"
        }
      }))
      .filter(row => row.item.answer);
  }

  function mergeImportedRows(rows, sourceLabel){
    if(!rows.length){
      showDialog("没有找到题目", "文件中没有可以导入的英文题目。");
      return;
    }

    const existing = flattenBank();
    const before = {
      words: uniqueByEnglish(existing.words).length,
      phrases: uniqueByEnglish(existing.phrases).length,
      sentences: uniqueByEnglish(existing.sentences).length
    };

    const imported = {words:[], phrases:[], sentences:[]};
    rows.forEach(row => imported[row.type].push(cleanItem(row.item)));

    const combined = {
      words: [...existing.words, ...imported.words],
      phrases: [...existing.phrases, ...imported.phrases],
      sentences: [...existing.sentences, ...imported.sentences]
    };

    const cleaned = rebuildLessons(combined);
    const added = {
      words: cleaned.words.length - before.words,
      phrases: cleaned.phrases.length - before.phrases,
      sentences: cleaned.sentences.length - before.sentences
    };

    saveLocal(false);
    renderAll();

    const duplicates = rows.length - added.words - added.phrases - added.sentences;
    const latestId = Object.keys(bank).map(Number).sort((a,b)=>b-a)[0] || 1;
    const latest = bank[latestId];

    showDialog(
      "导入并自动生成完成",
      `<b>来源：</b>${escapeHtml(sourceLabel)}<br><br>` +
      `新增单词：${added.words}<br>` +
      `新增短语：${added.phrases}<br>` +
      `新增句子：${added.sentences}<br>` +
      `跳过重复：${Math.max(0,duplicates)}<br><br>` +
      `现在共有 ${Object.keys(bank).length} 个 Lesson。<br>` +
      `最后一课：单词 ${filledCount("words",latestId)}/30、` +
      `短语 ${filledCount("phrases",latestId)}/30、` +
      `句子 ${filledCount("sentences",latestId)}/30。`
    );
  }

  async function importFile(file){
    const text = await file.text();
    const lowerName = file.name.toLowerCase();

    try{
      if(lowerName.endsWith(".js")){
        mergeImportedRows(parseJsTranslations(text), file.name);
      }else if(lowerName.endsWith(".txt")){
        mergeImportedRows(parseTxt(text), file.name);
      }else{
        showDialog("不支持的文件", "请选择 .txt 或 .js 文件。");
      }
    }catch(error){
      showDialog("导入失败", escapeHtml(error.message || "文件无法读取。"));
    }
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

  el("questionFile").addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if(file) await importFile(file);
    event.target.value = "";
  });

  el("openPasteBtn").onclick = () => {
    el("pasteText").value = "";
    el("pasteDialog").showModal();
  };

  el("importTextBtn").onclick = () => {
    el("pasteDialog").close();
    mergeImportedRows(parseTxt(el("pasteText").value), "粘贴的 TXT 内容");
  };

  el("selectAllRows").addEventListener("change", event => {
    document.querySelectorAll(".row-select").forEach(box => {
      box.checked = event.target.checked;
    });
    updateBatchSelectionState();
  });

  el("selectAllBtn").onclick = () => {
    document.querySelectorAll(".row-select").forEach(box => {
      box.checked = true;
    });
    updateBatchSelectionState();
  };

  el("clearSelectionBtn").onclick = () => {
    document.querySelectorAll(".row-select").forEach(box => {
      box.checked = false;
    });
    updateBatchSelectionState();
  };

  el("batchChineseBtn").onclick = () => applyModeToSelected("chinese");
  el("batchAudioBtn").onclick = () => applyModeToSelected("audio");

  el("clearSectionBtn").onclick = () => {
    if(!confirm(`确定清空当前 Lesson 的全部${TYPES[currentType].label}吗？`)) return;
    bank[currentLessonId][currentType] = Array.from({length:30}, blankItem);
    saveLocal(false);
    renderAll();
  };

  el("clearAllBtn").onclick = () => {
    const confirmed = confirm("确定清空全部 Lesson 和全部题目吗？此操作不能撤销。");
    if(!confirmed) return;
    bank = {};
    normalizeLesson(1);
    currentLessonId = 1;
    saveLocal(false);
    renderAll();
    showDialog("已经清空", "题库已经恢复为空白 Lesson 1，可以重新上传 TXT 或 JS 文件。");
  };

  el("autoChineseBtn").onclick = () => {
    const pools = flattenBank();
    let missing = 0;
    for(const type of Object.keys(TYPES)){
      missing += pools[type].filter(item => item.answer && !item.prompt).length;
    }

    if(!missing){
      showDialog("中文资料完整", "所有已经填写英文的题目都带有中文提示。");
      return;
    }

    showDialog(
      "缺少中文提示",
      `目前有 <b>${missing}</b> 道题缺少中文。<br><br>` +
      "你可以上传包含“英文 | 中文”的 TXT，或者上传 CHINESE_TRANSLATIONS 格式的 JS 文件。"
    );
  };

  normalizeAll();
  renderAll();
})(); 
