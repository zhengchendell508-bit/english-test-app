(() => {
  "use strict";

  const PAGE_WIDTH = 794;
  const PAGE_HEIGHT = 1123;
  const QUESTION_COUNT = 30;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeFilename(value) {
    return String(value || "")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ") || "英语测试报告";
  }

  function formatClock(milliseconds) {
    const total = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
    const hours = String(Math.floor(total / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
    const seconds = String(total % 60).padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  }

  function normalizeSection(section) {
    const items = Array.isArray(section) ? section.slice(0, QUESTION_COUNT) : [];
    while (items.length < QUESTION_COUNT) items.push({});
    return items.map((item, index) => ({
      number: index + 1,
      prompt: String(item?.prompt || ""),
      studentAnswer: String(item?.studentAnswer || item?.answer || "")
    }));
  }

  function normalizeRecord(record) {
    const source = record && typeof record === "object" ? record : {};
    return {
      id: String(source.id || ""),
      childName: String(source.childName || "孩子"),
      lessonTitle: String(source.lessonTitle || `Lesson ${source.lessonId || ""}`).trim(),
      submittedAt: Number(source.submittedAt) || Date.now(),
      elapsedMs: Number(source.elapsedMs) || 0,
      words: normalizeSection(source.sections?.words || source.words),
      phrases: normalizeSection(source.sections?.phrases || source.phrases),
      sentences: normalizeSection(source.sections?.sentences || source.sentences)
    };
  }

  function reportStyles() {
    return `
      *{box-sizing:border-box}
      .english-pdf-page{
        position:relative;width:${PAGE_WIDTH}px;height:${PAGE_HEIGHT}px;
        overflow:hidden;background:#fff;color:#111;
        font-family:"Noto Sans CJK SC","Source Han Sans SC","PingFang SC","Microsoft YaHei","SimSun",sans-serif;
        font-size:14.667px;font-weight:400;line-height:1.24;
      }
      .english-pdf-title{position:absolute;left:68px;top:44px;margin:0;font-size:26.667px;line-height:1.1;font-weight:700}
      .english-pdf-meta{position:absolute;left:68px;top:87px;display:flex;align-items:center;gap:42px;white-space:nowrap}
      .english-pdf-section{position:absolute;left:68px;top:119px;margin:0;font-size:14.667px;line-height:1.2;font-weight:700}
      .english-pdf-table{position:absolute;left:68px;top:144px;border-collapse:collapse;table-layout:fixed;margin:0;font-size:14.667px;line-height:1.2}
      .english-pdf-table th,.english-pdf-table td{border:1px solid #111;padding:4px 7px;vertical-align:middle;overflow:hidden;word-break:break-word;overflow-wrap:anywhere}
      .english-pdf-table th{height:38px;background:#e7edf6;text-align:center;font-weight:700}
      .english-pdf-table td.number{text-align:center;padding-left:2px;padding-right:2px;white-space:nowrap}
      .english-pdf-table td.answer{white-space:pre-wrap}
      .english-pdf-table.words{width:711px}
      .english-pdf-table.words tbody tr{height:38px}
      .english-pdf-table.phrases,.english-pdf-table.sentences{width:726px}
      .english-pdf-table.phrases tbody tr{height:38px}
      .english-pdf-table.sentences tbody tr{height:76px}
    `;
  }

  function pageHeader(record, sectionTitle) {
    const lessonDisplay = record.lessonTitle.replace(/^Lesson\s*/i, "").trim() || record.lessonTitle;
    return `
      <h1 class="english-pdf-title">英语测试报告</h1>
      <div class="english-pdf-meta">
        <span>孩子姓名：${escapeHtml(record.childName)}</span>
        <span>Lesson：${escapeHtml(lessonDisplay)}</span>
        <span>用时：${escapeHtml(formatClock(record.elapsedMs))}</span>
      </div>
      <h2 class="english-pdf-section">${escapeHtml(sectionTitle)}</h2>
    `;
  }

  function createPage(record, sectionTitle, tableHtml) {
    const page = document.createElement("section");
    page.className = "english-pdf-page";
    page.innerHTML = `${pageHeader(record, sectionTitle)}${tableHtml}`;
    return page;
  }

  function wordRows(items) {
    return Array.from({ length: 15 }, (_, index) => {
      const left = items[index];
      const right = items[index + 15];
      return `
        <tr>
          <td class="number">${left.number}</td>
          <td>${escapeHtml(left.prompt)}</td>
          <td class="answer">${escapeHtml(left.studentAnswer)}</td>
          <td class="number">${right.number}</td>
          <td>${escapeHtml(right.prompt)}</td>
          <td class="answer">${escapeHtml(right.studentAnswer)}</td>
        </tr>`;
    }).join("");
  }

  function wordPage(record) {
    return createPage(record, "第一部分：单词（30题）", `
      <table class="english-pdf-table words">
        <colgroup>
          <col style="width:45px"><col style="width:185px"><col style="width:125px">
          <col style="width:45px"><col style="width:185px"><col style="width:126px">
        </colgroup>
        <thead><tr>
          <th>题号</th><th>中文翻译</th><th>英文答案</th>
          <th>题号</th><th>中文翻译</th><th>英文答案</th>
        </tr></thead>
        <tbody>${wordRows(record.words)}</tbody>
      </table>`);
  }

  function standardRows(items, startIndex, endIndex) {
    return items.slice(startIndex, endIndex).map(item => `
      <tr>
        <td class="number">${item.number}</td>
        <td>${escapeHtml(item.prompt)}</td>
        <td class="answer">${escapeHtml(item.studentAnswer)}</td>
      </tr>`).join("");
  }

  function phrasePage(record, startIndex, endIndex, continued) {
    const title = continued ? "第二部分：短语（续）" : "第二部分：短语（30题）";
    return createPage(record, title, `
      <table class="english-pdf-table phrases">
        <colgroup><col style="width:53px"><col style="width:336.5px"><col style="width:336.5px"></colgroup>
        <thead><tr><th>题号</th><th>中文翻译</th><th>英文答案</th></tr></thead>
        <tbody>${standardRows(record.phrases, startIndex, endIndex)}</tbody>
      </table>`);
  }

  function sentencePage(record, startIndex, endIndex, continued) {
    const title = continued ? "第三部分：句子（续）" : "第三部分：句子（30题）";
    return createPage(record, title, `
      <table class="english-pdf-table sentences">
        <colgroup><col style="width:53px"><col style="width:235.5px"><col style="width:437.5px"></colgroup>
        <thead><tr><th>题号</th><th>中文</th><th>英文</th></tr></thead>
        <tbody>${standardRows(record.sentences, startIndex, endIndex)}</tbody>
      </table>`);
  }

  function buildPages(recordInput) {
    const record = normalizeRecord(recordInput);
    return [
      wordPage(record),
      phrasePage(record, 0, 24, false),
      phrasePage(record, 24, 30, true),
      sentencePage(record, 0, 10, false),
      sentencePage(record, 10, 20, true),
      sentencePage(record, 20, 30, true)
    ];
  }

  function buildRenderRoot(recordInput) {
    const root = document.createElement("div");
    root.setAttribute("aria-hidden", "true");
    root.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;background:#fff;z-index:-1;pointer-events:none;";

    const style = document.createElement("style");
    style.textContent = reportStyles();
    root.appendChild(style);
    buildPages(recordInput).forEach(page => root.appendChild(page));
    document.body.appendChild(root);
    return root;
  }

  async function createPdf(recordInput, onProgress) {
    if (typeof window.html2canvas !== "function" || !window.jspdf?.jsPDF) {
      throw new Error("PDF 组件没有加载完成，请刷新页面后再试。");
    }

    const record = normalizeRecord(recordInput);
    const root = buildRenderRoot(record);
    const pages = Array.from(root.querySelectorAll(".english-pdf-page"));
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });

    try {
      if (document.fonts?.ready) await document.fonts.ready;
      pages.forEach(page => { page.style.display = "none"; });

      for (let index = 0; index < pages.length; index += 1) {
        onProgress?.(index + 1, pages.length);
        pages[index].style.display = "block";
        const canvas = await window.html2canvas(pages[index], {
          backgroundColor: "#ffffff",
          logging: false,
          scale: 2,
          useCORS: true,
          width: PAGE_WIDTH,
          height: PAGE_HEIGHT,
          windowWidth: PAGE_WIDTH,
          windowHeight: PAGE_HEIGHT
        });
        if (index > 0) pdf.addPage("a4", "portrait");
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, 210, 297, undefined, "FAST");
        canvas.width = 1;
        canvas.height = 1;
        pages[index].style.display = "none";
      }

      return {
        blob: pdf.output("blob"),
        filename: `${safeFilename(record.childName)}_${safeFilename(record.lessonTitle)}_英语测试报告.pdf`
      };
    } finally {
      root.remove();
    }
  }

  async function downloadPdf(recordInput, onProgress) {
    const result = await createPdf(recordInput, onProgress);
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = result.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return result;
  }

  window.EnglishTestReport = {
    buildPages,
    buildRenderRoot,
    createPdf,
    downloadPdf,
    formatClock
  };
})();
