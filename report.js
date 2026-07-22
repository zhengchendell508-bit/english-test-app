(() => {
  "use strict";

  const QUESTION_COUNT = 30;
  const EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  function safeFilename(value) {
    return String(value || "")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ") || "英语测试答案";
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

  function toAnswerRows(record) {
    const blankToNull = value => value === "" ? null : value;
    return [
      ...record.words.map(item => ["单词", item.number, blankToNull(item.prompt), blankToNull(item.studentAnswer), null, null]),
      ...record.phrases.map(item => ["短语", item.number, blankToNull(item.prompt), blankToNull(item.studentAnswer), null, null]),
      ...record.sentences.map(item => ["句子", item.number, blankToNull(item.prompt), blankToNull(item.studentAnswer), null, null])
    ];
  }

  function setMetadataCell(cell, isLabel) {
    cell.font = {
      name: "Microsoft YaHei",
      size: 11,
      bold: Boolean(isLabel),
      color: { argb: isLabel ? "FF1F2937" : "FF172033" }
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: isLabel ? "FFE8EEF8" : "FFFFFFFF" }
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: isLabel ? "center" : "left",
      wrapText: true
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFCFD8E6" } },
      left: { style: "thin", color: { argb: "FFCFD8E6" } },
      bottom: { style: "thin", color: { argb: "FFCFD8E6" } },
      right: { style: "thin", color: { argb: "FFCFD8E6" } }
    };
  }

  function buildWorkbook(recordInput) {
    if (!window.ExcelJS?.Workbook) {
      throw new Error("Excel 组件没有加载完成，请刷新页面后再试。");
    }

    const record = normalizeRecord(recordInput);
    const workbook = new window.ExcelJS.Workbook();
    workbook.creator = "英语测试 APP";
    workbook.lastModifiedBy = "英语测试 APP";
    workbook.created = new Date(record.submittedAt);
    workbook.modified = new Date();

    const sheet = workbook.addWorksheet("英语测试答案", {
      properties: { defaultRowHeight: 22 },
      views: [{ state: "frozen", ySplit: 5, activeCell: "A6", showGridLines: false }]
    });

    sheet.columns = [
      { key: "section", width: 11 },
      { key: "number", width: 9 },
      { key: "prompt", width: 42 },
      { key: "studentAnswer", width: 52 },
      { key: "result", width: 18 },
      { key: "feedback", width: 42 }
    ];

    sheet.mergeCells("A1:F1");
    const title = sheet.getCell("A1");
    title.value = "新概念英语测试答案";
    title.font = { name: "Microsoft YaHei", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
    title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2868E8" } };
    title.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 34;

    const lessonTitle = record.lessonTitle || "Lesson";
    sheet.getCell("A2").value = "孩子姓名";
    sheet.getCell("B2").value = record.childName;
    sheet.getCell("C2").value = "Lesson";
    sheet.getCell("D2").value = lessonTitle;
    sheet.getCell("E2").value = "总用时";
    sheet.getCell("F2").value = formatClock(record.elapsedMs);

    sheet.getCell("A3").value = "提交时间";
    sheet.mergeCells("B3:F3");
    sheet.getCell("B3").value = new Date(record.submittedAt);
    sheet.getCell("B3").numFmt = "yyyy-mm-dd hh:mm:ss";

    ["A2", "C2", "E2", "A3"].forEach(address => setMetadataCell(sheet.getCell(address), true));
    ["B2", "D2", "F2", "B3"].forEach(address => setMetadataCell(sheet.getCell(address), false));
    sheet.getRow(2).height = 26;
    sheet.getRow(3).height = 26;

    sheet.mergeCells("A4:F4");
    const note = sheet.getCell("A4");
    note.value = "本表不自动判分；“批改结果”和“正确答案 / 修改建议”两列留给 ChatGPT 批改。";
    note.font = { name: "Microsoft YaHei", size: 10, color: { argb: "FF5B6473" } };
    note.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F7FB" } };
    note.alignment = { vertical: "middle", horizontal: "left" };
    sheet.getRow(4).height = 24;

    sheet.addTable({
      name: "EnglishTestAnswers",
      ref: "A5",
      headerRow: true,
      totalsRow: false,
      style: { theme: "TableStyleMedium2", showRowStripes: true },
      columns: [
        { name: "分类" },
        { name: "题号" },
        { name: "中文题目" },
        { name: "孩子英文答案" },
        { name: "批改结果" },
        { name: "正确答案 / 修改建议" }
      ],
      rows: toAnswerRows(record)
    });

    const header = sheet.getRow(5);
    header.height = 28;
    header.eachCell(cell => {
      cell.font = { name: "Microsoft YaHei", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    });

    for (let rowNumber = 6; rowNumber <= 95; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const isSentence = rowNumber >= 66;
      row.height = isSentence ? 42 : 28;

      row.eachCell({ includeEmpty: true }, cell => {
        cell.font = { name: "Microsoft YaHei", size: 11, color: { argb: "FF172033" } };
        cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      });
      row.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
      row.getCell(2).alignment = { vertical: "middle", horizontal: "center" };
      row.getCell(5).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    }

    sheet.pageSetup = {
      orientation: "landscape",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }
    };
    sheet.headerFooter.oddFooter = `&L${record.childName}  ${lessonTitle}&R第 &P / &N 页`;

    return { workbook, record };
  }

  async function createExcel(recordInput) {
    const { workbook, record } = buildWorkbook(recordInput);
    const buffer = await workbook.xlsx.writeBuffer();
    return {
      blob: new Blob([buffer], { type: EXCEL_MIME }),
      filename: `${safeFilename(record.childName)}_${safeFilename(record.lessonTitle)}_英语测试答案.xlsx`
    };
  }

  async function downloadExcel(recordInput) {
    const result = await createExcel(recordInput);
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
    buildWorkbook,
    createExcel,
    downloadExcel,
    formatClock
  };
})();
