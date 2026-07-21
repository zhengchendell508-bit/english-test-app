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
  let submissionInProgress = false;

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
    const isSentenceSection = currentSection === "sentences";
    questions.classList.toggle("sentence-layout", isSentenceSection);
    // 直接写入布局，避免 iPad/PWA 仍读取旧 CSS 缓存时继续显示两列。
    questions.style.gridTemplateColumns = isSentenceSection ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))";

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
    if (currentSection === "sentences") {
      card.style.gridColumn = "1 / -1";
      card.style.width = "100%";
    }

    if (state[currentSection][index].trim()) card.classList.add("answered");
    if (index === currentQuestion) card.classList.add("current");

    const top = document.createElement("div");
    top.className = "question-top";

    const heading = document.createElement("strong");
    heading.textContent = `${index + 1}.`;
    top.appendChild(heading);

    // 单词、短语、句子测试时，中文默认隐藏。
    // 孩子只有在按住“提示”按钮期间才能看到中文，松开后立即隐藏。
    const prompt = document.createElement("span");
    prompt.className = "chinese-prompt hint-hidden";
    prompt.textContent = item.prompt || "暂无中文提示";
    prompt.setAttribute("aria-hidden", "true");
    top.appendChild(prompt);

    const hintButton = document.createElement("button");
    hintButton.type = "button";
    hintButton.className = "hint-hold-btn";
    hintButton.textContent = "按住提示";
    hintButton.setAttribute("aria-label", `按住查看${sectionLabel}第${index + 1}题的中文意思`);

    const showHint = event => {
      if (event) event.preventDefault();
      prompt.classList.remove("hint-hidden");
      prompt.classList.add("hint-visible");
      prompt.setAttribute("aria-hidden", "false");
      hintButton.classList.add("is-holding");
      hintButton.textContent = "松开隐藏";
    };

    const hideHint = event => {
      if (event) event.preventDefault();
      prompt.classList.remove("hint-visible");
      prompt.classList.add("hint-hidden");
      prompt.setAttribute("aria-hidden", "true");
      hintButton.classList.remove("is-holding");
      hintButton.textContent = "按住提示";
    };

    hintButton.addEventListener("pointerdown", event => {
      hintButton.setPointerCapture?.(event.pointerId);
      showHint(event);
    });
    hintButton.addEventListener("pointerup", hideHint);
    hintButton.addEventListener("pointercancel", hideHint);
    hintButton.addEventListener("lostpointercapture", hideHint);
    hintButton.addEventListener("contextmenu", event => event.preventDefault());
    hintButton.addEventListener("keydown", event => {
      if (event.key === " " || event.key === "Enter") showHint(event);
    });
    hintButton.addEventListener("keyup", event => {
      if (event.key === " " || event.key === "Enter") hideHint(event);
    });
    hintButton.addEventListener("blur", hideHint);

    // 交换按钮位置：听声按钮在左，按住提示按钮在右，
    // 让孩子按住右侧提示时，手指尽量不遮挡中文内容。
    const playableText = item.audioText || item.answer;
    if (playableText) {
      const audioButton = document.createElement("button");
      audioButton.type = "button";
      audioButton.className = item.mode === "audio" ? "audio-btn" : "small-audio";
      audioButton.textContent = item.mode === "audio" ? "🔊 听声音" : "🔊";
      audioButton.setAttribute("aria-label", "播放英文");
      audioButton.addEventListener("click", () => speak(playableText));
      top.appendChild(audioButton);
    }
    top.appendChild(hintButton);

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

  function finalizeLessonSubmission() {
    saveNow();

    const keys = getStorageKeys(currentLessonId);
    const submittedAt = Date.now();
    const submitted = {};

    SECTION_ORDER.forEach(sectionName => {
      submitted[sectionName] = {
        submittedAt,
        answered: completedCount(sectionName)
      };
    });

    localStorage.setItem(keys.submitted, JSON.stringify(submitted));
    finishLessonTimer();

    const randomPart = window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : Math.random().toString(16).slice(2);

    return {
      id: `${activeChild.id}-${currentLessonId}-${submittedAt}-${randomPart}`,
      childId: activeChild.id,
      childName: activeChild.name,
      lessonId: currentLessonId,
      lessonTitle: lesson.title || `Lesson ${currentLessonId}`,
      submittedAt,
      elapsedMs: currentElapsed(),
      sections: Object.fromEntries(SECTION_ORDER.map(sectionName => [
        sectionName,
        sections[sectionName].items.map((item, index) => ({
          number: index + 1,
          prompt: String(item.prompt || ""),
          studentAnswer: String(state[sectionName][index] || "").trim()
        }))
      ]))
    };
  }

  async function submitLesson() {
    if (submissionInProgress) return;

    const progress = SECTION_ORDER.map(sectionName => ({
      sectionName,
      label: sections[sectionName].label,
      answered: completedCount(sectionName)
    }));

    const incomplete = progress.filter(item => item.answered < QUESTION_COUNT);
    const forceSubmitBtn = $("forceSubmitBtn");

    if (incomplete.length) {
      const missingDetails = incomplete
        .map(item => `${item.label}还差 ${QUESTION_COUNT - item.answered} 题`)
        .join("、");

      $("resultTitle").textContent = "还有题目没有填写";
      $("resultBody").innerHTML = `
        <div class="result-summary">
          <strong>${escapeHtml(missingDetails)}</strong>
        </div>
        <p>这些题目可以先返回继续填写；如果确实不会，也可以点击“依然提交”。</p>
        <p class="muted">未填写的题目在 PDF 中会保留为空白。</p>
      `;
      forceSubmitBtn.hidden = false;
      $("resultDialog").showModal();
      return;
    }

    await completeSubmission();
  }

  function finishLessonTimer() {
    persistTimer();
    timerState.finished = true;

    const keys = getStorageKeys(currentLessonId);
    localStorage.setItem(keys.timer, JSON.stringify(timerState));

    stopTimer();
    renderTimer();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function completeSubmission() {
    if (submissionInProgress) return;
    submissionInProgress = true;

    const dialog = $("resultDialog");
    const forceSubmitBtn = $("forceSubmitBtn");
    const submitButtons = [$("submitTopBtn"), $("submitBottomBtn")];

    forceSubmitBtn.hidden = true;
    submitButtons.forEach(button => { button.disabled = true; });
    $("resultTitle").textContent = "正在提交作业";
    $("resultBody").innerHTML = "<p>正在把孩子的答案保存到云端，请稍候…</p>";
    if (!dialog.open) dialog.showModal();

    try {
      const submissionRecord = finalizeLessonSubmission();
      await window.saveSubmissionRecord(submissionRecord);

      $("resultTitle").textContent = "提交完成";
      $("resultBody").innerHTML = "<p><strong>本次作业已成功提交到云端。</strong></p><p>家长可以在电脑端进入“管理孩子 → 作业记录”下载 PDF。</p>";
    } catch (error) {
      console.error("作业提交到云端失败。", error);
      $("resultTitle").textContent = "提交失败";
      $("resultBody").innerHTML = `<p>${escapeHtml(error.message || "请检查网络后重新提交")}</p><p class="muted">云端尚未收到本次作业，请不要关闭页面，检查网络后再次点击提交。</p>`;
    } finally {
      submissionInProgress = false;
      submitButtons.forEach(button => { button.disabled = false; });
    }
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

    $("submitTopBtn").addEventListener("click", submitLesson);
    $("submitBottomBtn").addEventListener("click", submitLesson);
    $("forceSubmitBtn").addEventListener("click", async () => {
      $("resultDialog").close();
      await completeSubmission();
    });

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
