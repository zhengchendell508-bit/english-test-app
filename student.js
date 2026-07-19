(async () => {
  "use strict";

  const PAGE_SIZE = 10;
  const QUESTION_COUNT = 30;
  const SECTION_ORDER = ["words", "phrases", "sentences"];
  const SECTION_LABELS = {
    words: "单词",
    phrases: "短语",
    sentences: "句子"
  };

  const activeChild = getActiveChild();
  if (!activeChild) {
    location.replace("children.html");
    return;
  }

  const sectionTitleElement = document.getElementById("sectionTitle");
  if (sectionTitleElement) sectionTitleElement.textContent = "正在同步云端题库…";

  const bank = await window.LessonDataService.loadBank();
  const lessonIds = Object.keys(bank)
    .map(Number)
    .filter(id => Number.isInteger(id) && bank[id])
    .sort((a, b) => a - b);

  if (!lessonIds.length) {
    alert("目前没有可测试的 Lesson，请先由家长导入题库。");
    location.replace("children.html");
    return;
  }

  const $ = id => document.getElementById(id);

  let currentLessonId = resolveInitialLessonId();
  let lesson = null;
  let sections = null;
  let state = null;
  let currentSection = "words";
  let currentPage = 0;
  let currentQuestion = 0;
  let timerState = null;
  let timerInterval = null;
  let saveDebounce = null;

  $("activeChildName").textContent = activeChild.name;
  buildLessonSelector();
  bindStaticEvents();
  loadLesson(currentLessonId, { firstLoad: true });

  function resolveInitialLessonId() {
    const fromUrl = Number(new URLSearchParams(location.search).get("lesson"));
    return lessonIds.includes(fromUrl) ? fromUrl : lessonIds[0];
  }

  function buildLessonSelector() {
    const select = $("lessonSelect");
    select.innerHTML = "";

    lessonIds.forEach(id => {
      const option = document.createElement("option");
      option.value = String(id);
      option.textContent = bank[id]?.title || `Lesson ${id}`;
      select.appendChild(option);
    });

    select.value = String(currentLessonId);
  }

  function normalizeItems(items) {
    const normalized = Array.isArray(items) ? items.slice(0, QUESTION_COUNT) : [];

    while (normalized.length < QUESTION_COUNT) {
      normalized.push({
        prompt: "",
        answer: "",
        audioText: "",
        mode: "chinese"
      });
    }

    return normalized.map(item => ({
      prompt: String(item?.prompt || ""),
      answer: String(item?.answer || ""),
      audioText: String(item?.audioText || item?.answer || ""),
      mode: item?.mode === "audio" ? "audio" : "chinese"
    }));
  }

  function getStorageKeys(lessonId) {
    const base = `englishExam:${activeChild.id}:lesson:${lessonId}`;
    return {
      answers: `${base}:answers`,
      section: `${base}:section`,
      page: `${base}:page`,
      timer: `${base}:timer`,
      submitted: `${base}:submitted`
    };
  }

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function loadLesson(lessonId, { firstLoad = false } = {}) {
    if (!lessonIds.includes(lessonId)) return;

    if (!firstLoad) {
      saveNow();
      persistTimer();
      stopTimer();
    }

    currentLessonId = lessonId;
    lesson = bank[currentLessonId];
    sections = {
      words: {
        label: SECTION_LABELS.words,
        items: normalizeItems(lesson.words)
      },
      phrases: {
        label: SECTION_LABELS.phrases,
        items: normalizeItems(lesson.phrases)
      },
      sentences: {
        label: SECTION_LABELS.sentences,
        items: normalizeItems(lesson.sentences)
      }
    };

    loadLessonProgress();
    startLessonTimer();

    $("lessonSelect").value = String(currentLessonId);
    updateUrlLesson(currentLessonId);
    renderQuestions();
  }

  function loadLessonProgress() {
    const keys = getStorageKeys(currentLessonId);
    const savedState = readJson(keys.answers, {});

    state = {};
    SECTION_ORDER.forEach(section => {
      const answers = Array.isArray(savedState[section])
        ? savedState[section].slice(0, QUESTION_COUNT)
        : [];

      while (answers.length < QUESTION_COUNT) answers.push("");
      state[section] = answers.map(value => String(value || ""));
    });

    const savedSection = localStorage.getItem(keys.section);
    currentSection = SECTION_ORDER.includes(savedSection) ? savedSection : "words";

    const savedPage = Number(localStorage.getItem(keys.page));
    currentPage = Number.isInteger(savedPage) && savedPage >= 0 && savedPage <= 2
      ? savedPage
      : 0;

    currentQuestion = currentPage * PAGE_SIZE;
  }

  function updateUrlLesson(lessonId) {
    const url = new URL(location.href);
    url.searchParams.set("lesson", String(lessonId));
    history.replaceState(null, "", url);
  }

  function startLessonTimer() {
    const keys = getStorageKeys(currentLessonId);
    const saved = readJson(keys.timer, null);
    const now = Date.now();

    if (!saved) {
      timerState = {
        accumulatedMs: 0,
        runningSince: now,
        sessionStartedAt: now,
        finished: false
      };
    } else {
      timerState = {
        accumulatedMs: Number(saved.accumulatedMs) || 0,
        runningSince: now,
        sessionStartedAt: now,
        finished: Boolean(saved.finished)
      };
    }

    localStorage.setItem(keys.timer, JSON.stringify(timerState));
    $("startTime").textContent = formatDateTime(timerState.sessionStartedAt);
    renderTimer();

    stopTimer();
    if (!timerState.finished) {
      timerInterval = setInterval(renderTimer, 1000);
    }
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function currentElapsed() {
    if (!timerState) return 0;
    return timerState.accumulatedMs +
      (timerState.finished ? 0 : Date.now() - timerState.runningSince);
  }

  function persistTimer() {
    if (!timerState || timerState.finished) return;

    timerState.accumulatedMs = currentElapsed();
    timerState.runningSince = Date.now();

    const keys = getStorageKeys(currentLessonId);
    localStorage.setItem(keys.timer, JSON.stringify(timerState));
  }

  function renderTimer() {
    $("elapsedTime").textContent = formatClock(currentElapsed());
  }

  function formatClock(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const hours = String(Math.floor(total / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
    const seconds = String(total % 60).padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  }

  function formatDateTime(timestamp) {
    return new Date(timestamp).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
  }

  function saveNow() {
    if (!state) return;

    clearTimeout(saveDebounce);
    const keys = getStorageKeys(currentLessonId);

    localStorage.setItem(keys.answers, JSON.stringify(state));
    localStorage.setItem(keys.section, currentSection);
    localStorage.setItem(keys.page, String(currentPage));

    $("saveStatus").textContent = "✓ 已自动保存";
    $("saveStatus").classList.remove("saving");
  }

  function queueSave() {
    $("saveStatus").textContent = "正在保存…";
    $("saveStatus").classList.add("saving");

    clearTimeout(saveDebounce);
    saveDebounce = setTimeout(saveNow, 180);
  }

  function completedCount(section) {
    return state[section].filter(value => value.trim()).length;
  }

  function updateAllProgress() {
    SECTION_ORDER.forEach(section => {
      const count = completedCount(section);
      $(`${section}Progress`).textContent = `${count} / ${QUESTION_COUNT}`;
      $(`${section}Bar`).style.width = `${count / QUESTION_COUNT * 100}%`;
    });

    const currentCount = completedCount(currentSection);
    $("progressText").textContent = `已完成 ${currentCount} / ${QUESTION_COUNT} 题`;
    $("longProgressBar").style.width = `${currentCount / QUESTION_COUNT * 100}%`;
    $("progressPercent").textContent =
      `${Math.round(currentCount / QUESTION_COUNT * 100)}%`;
  }

  function renderQuestions() {
    document.querySelectorAll(".progress-tab").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.section === currentSection
      );
    });

    const section = sections[currentSection];
    $("sectionTitle").textContent =
      `${lesson.title || `Lesson ${currentLessonId}`} - ${section.label}`;

    const start = currentPage * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, QUESTION_COUNT);
    const questions = $("questions");
    questions.innerHTML = "";

    section.items.slice(start, end).forEach((item, localIndex) => {
      const questionIndex = start + localIndex;
      questions.appendChild(
        createQuestionCard(item, questionIndex, section.label)
      );
    });

    $("pageInfo").textContent =
      `第 ${currentPage + 1} / 3 页（${start + 1}–${end}题）`;
    $("prevPageBtn").disabled = currentPage === 0;
    $("nextPageBtn").disabled = currentPage === 2;
    $("nextPageBtn").textContent =
      currentPage === 2 ? "已经是最后一页" : "下一页";
    $("bottomSubmitArea").classList.toggle("hidden", currentPage !== 2);

    renderNumberGrid();
    updateAllProgress();
  }

  function createQuestionCard(item, index, sectionLabel) {
    const card = document.createElement("article");
    card.className = "question-card";
    card.id = `question-${index + 1}`;

    if (state[currentSection][index].trim()) card.classList.add("answered");
    if (index === currentQuestion) card.classList.add("current");

    const top = document.createElement("div");
    top.className = "question-top";

    const heading = document.createElement("strong");
    heading.textContent = `${index + 1}.`;
    top.appendChild(heading);

    if (item.mode === "audio") {
      const audioButton = document.createElement("button");
      audioButton.type = "button";
      audioButton.className = "audio-btn";
      audioButton.textContent = "🔊 听声音";
      audioButton.addEventListener("click", () => {
        speak(item.audioText || item.answer);
      });
      top.appendChild(audioButton);
    } else {
      const prompt = document.createElement("span");
      prompt.className = "chinese-prompt";
      prompt.textContent = item.prompt || "中文提示";
      top.appendChild(prompt);

      const playableText = item.audioText || item.answer;
      if (playableText) {
        const smallAudio = document.createElement("button");
        smallAudio.type = "button";
        smallAudio.className = "small-audio";
        smallAudio.textContent = "🔊";
        smallAudio.setAttribute("aria-label", "播放英文");
        smallAudio.addEventListener("click", () => speak(playableText));
        top.appendChild(smallAudio);
      }
    }

    const input = document.createElement(
      currentSection === "sentences" ? "textarea" : "input"
    );

    if (input.tagName === "INPUT") input.type = "text";
    input.className = "english-answer";
    input.value = state[currentSection][index];
    input.placeholder = "请输入英文";
    input.autocomplete = "off";
    input.autocapitalize = "sentences";
    input.spellcheck = false;
    input.setAttribute(
      "aria-label",
      `${sectionLabel}第${index + 1}题，输入英文答案`
    );

    input.addEventListener("focus", () => {
      currentQuestion = index;
      document.querySelectorAll(".question-card").forEach(element => {
        element.classList.remove("current");
      });
      card.classList.add("current");
      renderNumberGrid();
    });

    input.addEventListener("input", () => {
      state[currentSection][index] = input.value;
      card.classList.toggle("answered", Boolean(input.value.trim()));
      queueSave();
      updateAllProgress();
      renderNumberGrid();
    });

    card.append(top, input);
    return card;
  }

  function renderNumberGrid() {
    const grid = $("numberGrid");
    grid.innerHTML = "";

    for (let index = 0; index < QUESTION_COUNT; index += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = String(index + 1);

      if (state[currentSection][index].trim()) button.classList.add("done");
      if (index === currentQuestion) button.classList.add("current");

      button.addEventListener("click", () => goToQuestion(index));
      grid.appendChild(button);
    }
  }

  function goToQuestion(index) {
    currentQuestion = Math.max(0, Math.min(QUESTION_COUNT - 1, index));
    currentPage = Math.floor(currentQuestion / PAGE_SIZE);

    saveNow();
    renderQuestions();

    requestAnimationFrame(() => {
      const card = document.getElementById(`question-${currentQuestion + 1}`);
      const input = card?.querySelector(".english-answer");
      card?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => input?.focus(), 250);
    });
  }

  function switchSection(section) {
    if (!SECTION_ORDER.includes(section) || section === currentSection) return;

    currentSection = section;
    currentPage = 0;
    currentQuestion = 0;

    saveNow();
    renderQuestions();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function normalizeAnswer(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[“”‘’']/g, "")
      .replace(/[.,!?;:，。！？；：]/g, "")
      .replace(/\s+/g, " ");
  }

  function submitSection() {
    const section = sections[currentSection];
    const answered = completedCount(currentSection);
    let correct = 0;
    const wrong = [];

    section.items.forEach((item, index) => {
      const studentAnswer = normalizeAnswer(state[currentSection][index]);
      const correctAnswer = normalizeAnswer(item.answer);

      if (studentAnswer && studentAnswer === correctAnswer) {
        correct += 1;
      } else if (studentAnswer) {
        wrong.push(index + 1);
      }
    });

    const keys = getStorageKeys(currentLessonId);
    const submitted = readJson(keys.submitted, {});
    submitted[currentSection] = {
      submittedAt: Date.now(),
      answered,
      correct
    };
    localStorage.setItem(keys.submitted, JSON.stringify(submitted));

    $("resultTitle").textContent = `${section.label}提交结果`;
    $("resultBody").innerHTML = `
      <div class="result-summary">
        <strong>已填写：${answered} / ${QUESTION_COUNT}</strong>
        <strong>正确：${correct} / ${QUESTION_COUNT}</strong>
        <strong>未填写：${QUESTION_COUNT - answered}</strong>
      </div>
      ${
        wrong.length
          ? `<p>需要检查的题号：${wrong.join("、")}</p>`
          : "<p>本部分没有发现错误。</p>"
      }
      <p class="muted">计时器会继续累计，直到三个部分全部正式提交完成。</p>
    `;
    $("resultDialog").showModal();

    const allSubmitted = SECTION_ORDER.every(sectionName => submitted[sectionName]);
    if (allSubmitted) finishLessonTimer();
  }

  function finishLessonTimer() {
    persistTimer();
    timerState.finished = true;

    const keys = getStorageKeys(currentLessonId);
    localStorage.setItem(keys.timer, JSON.stringify(timerState));

    stopTimer();
    renderTimer();
  }

  function speak(text) {
    if (!text.trim()) {
      alert("这道题目前没有英文内容");
      return;
    }

    if (!("speechSynthesis" in window)) {
      alert("当前浏览器不支持语音播放");
      return;
    }

    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.86;
    speechSynthesis.speak(utterance);
  }

  function bindStaticEvents() {
    $("lessonSelect").addEventListener("change", event => {
      const nextLessonId = Number(event.target.value);
      if (nextLessonId !== currentLessonId) {
        loadLesson(nextLessonId);
      }
    });

    document.querySelectorAll(".progress-tab").forEach(button => {
      button.addEventListener("click", () => {
        switchSection(button.dataset.section);
      });
    });

    $("prevPageBtn").addEventListener("click", () => {
      if (currentPage > 0) {
        currentPage -= 1;
        currentQuestion = currentPage * PAGE_SIZE;
        saveNow();
        renderQuestions();
      }
    });

    $("nextPageBtn").addEventListener("click", () => {
      if (currentPage < 2) {
        currentPage += 1;
        currentQuestion = currentPage * PAGE_SIZE;
        saveNow();
        renderQuestions();
      }
    });

    $("submitTopBtn").addEventListener("click", submitSection);
    $("submitBottomBtn").addEventListener("click", submitSection);

    $("jumpBtn").addEventListener("click", () => {
      $("jumpDialog").showModal();
    });

    $("jumpConfirm").addEventListener("click", () => {
      const number = Number($("jumpInput").value);
      if (number >= 1 && number <= QUESTION_COUNT) {
        $("jumpDialog").close();
        goToQuestion(number - 1);
      }
    });

    window.addEventListener("pagehide", () => {
      saveNow();
      persistTimer();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        saveNow();
        persistTimer();
      }
    });
  }
})();
