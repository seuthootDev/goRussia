const DATA_BASE = "data";

const roundLabel = document.getElementById("roundLabel");
const homeCard = document.getElementById("homeCard");
const studyCard = document.getElementById("studyCard");
const quizCard = document.getElementById("quizCard");
const resultCard = document.getElementById("resultCard");
const lessonFilter = document.getElementById("lessonFilter");
const tableGrid = document.getElementById("tableGrid");
const loadHint = document.getElementById("loadHint");
const studyTitle = document.getElementById("studyTitle");
const studyNote = document.getElementById("studyNote");
const studyLessonChip = document.getElementById("studyLessonChip");
const studyThead = document.getElementById("studyThead");
const studyTbody = document.getElementById("studyTbody");
const quizModeRow = document.getElementById("quizModeRow");
const backHomeBtn = document.getElementById("backHomeBtn");
const backStudyBtn = document.getElementById("backStudyBtn");
const quizModeChip = document.getElementById("quizModeChip");
const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");
const questionLabel = document.getElementById("questionLabel");
const promptText = document.getElementById("promptText");
const choicesEl = document.getElementById("choices");
const feedback = document.getElementById("feedback");
const feedbackStatus = document.getElementById("feedbackStatus");
const feedbackDetail = document.getElementById("feedbackDetail");
const resultTitle = document.getElementById("resultTitle");
const resultSummary = document.getElementById("resultSummary");
const wrongList = document.getElementById("wrongList");
const retryButton = document.getElementById("retryButton");
const resultHomeBtn = document.getElementById("resultHomeBtn");

let manifest = null;
let currentTable = null;
let currentMeta = null;
let currentMode = null;
let currentRound = 1;
let questions = [];
/** Full question set for the current mode — always used for MCQ distractors */
let choiceBank = [];
let wrongAnswers = [];
let currentIndex = 0;
let roundCorrectCount = 0;
let choiceLocked = false;

const tableCache = new Map();

function tableTitle(table) {
  return table?.titleEn || table?.titleKo || table?.id || "";
}

function colLabel(col) {
  return col.labelEn || col.labelKo || col.id;
}

function modeLabel(mode) {
  return mode.labelEn || mode.labelKo || mode.id;
}

function rowMeaning(row) {
  return cellText(row.en ?? row.ko);
}

function normalizeAnswer(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase()
    .replace(/ё/g, "е");
}

function splitVariants(value) {
  if (Array.isArray(value)) {
    return value.flatMap(splitVariants);
  }
  return String(value ?? "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function showOnly(card) {
  [homeCard, studyCard, quizCard, resultCard].forEach((el) => {
    el.classList.toggle("hidden", el !== card);
  });
}

function lessonTitle(n) {
  const found = manifest?.lessons?.find((lesson) => lesson.n === n);
  const name = found?.titleEn || found?.titleKo || "";
  return name ? `Lesson ${n} · ${name}` : `Lesson ${n}`;
}

function cellText(value) {
  if (Array.isArray(value)) return value.join(" / ");
  return value == null ? "" : String(value);
}

function buildQuestions(table, mode) {
  return table.rows.map((row, index) => {
    const promptParts = mode.promptColumns
      .map((col) => {
        if (col === "ko" || col === "en") return rowMeaning(row);
        return cellText(row[col]);
      })
      .filter(Boolean);
    const promptPronParts = mode.promptColumns
      .map((col) => cellText(row[`${col}Pron`]))
      .filter(Boolean);
    const answerCol = mode.answerColumn === "ko" ? "en" : mode.answerColumn;
    const answerRaw =
      mode.answerColumn === "ko" || mode.answerColumn === "en"
        ? row.en ?? row.ko
        : row[mode.answerColumn];
    const answers = splitVariants(answerRaw);
    return {
      id: `${table.id}-${mode.id}-${index}`,
      prompt: promptParts.join(" · "),
      promptPron: promptPronParts.join(" · "),
      answers,
      answerDisplay: cellText(answerRaw),
      answerPron: cellText(row[`${answerCol}Pron`] || row[`${mode.answerColumn}Pron`]),
      answerColumn: mode.answerColumn
    };
  });
}

function buildChoices(current, bank, size = 4) {
  const correct = current.answerDisplay;
  const pool = [
    ...new Set(
      bank
        .map((q) => q.answerDisplay)
        .filter((text) => text && normalizeAnswer(text) !== normalizeAnswer(correct))
    )
  ];
  const need = Math.max(0, size - 1);
  const distractors = shuffle(pool).slice(0, need);
  // Prefer a full set from the bank; only pad if the table itself is tiny
  while (distractors.length < need) {
    distractors.push(`— ${distractors.length + 1}`);
  }
  return shuffle([correct, ...distractors]);
}

function renderHome(filterLesson = "all") {
  tableGrid.innerHTML = "";
  const tables = manifest.tables.filter((item) => {
    if (filterLesson === "all") return true;
    return String(item.lesson) === String(filterLesson);
  });

  if (tables.length === 0) {
    loadHint.textContent = "No tables for this lesson.";
    loadHint.classList.remove("hidden");
    return;
  }

  loadHint.classList.add("hidden");

  tables.forEach((item) => {
    const cached = tableCache.get(item.id);
    const title = tableTitle(cached) || item.id;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "table-pick";
    btn.dataset.id = item.id;
    btn.innerHTML = `
      <span class="pick-lesson">LESSON ${item.lesson}</span>
      <span class="pick-title">${title}</span>
    `;
    btn.addEventListener("click", () => openTable(item));
    tableGrid.appendChild(btn);
  });
}

async function loadTable(meta) {
  if (tableCache.has(meta.id)) return tableCache.get(meta.id);
  const res = await fetch(`${DATA_BASE}/${meta.file}`);
  if (!res.ok) throw new Error(`Failed to load ${meta.file}`);
  const data = await res.json();
  tableCache.set(meta.id, data);
  return data;
}

async function openTable(meta) {
  try {
    loadHint.textContent = "Loading table…";
    loadHint.classList.remove("hidden");
    const table = await loadTable(meta);
    currentMeta = meta;
    currentTable = table;
    renderStudy(table, meta);
    showOnly(studyCard);
    roundLabel.textContent = `LESSON ${meta.lesson}`;
  } catch (err) {
    loadHint.textContent = "Could not load table. Open via a local server.";
    console.error(err);
  }
}

function renderStudy(table, meta) {
  studyLessonChip.textContent = lessonTitle(meta.lesson);
  studyTitle.textContent = tableTitle(table);
  studyNote.textContent = table.note || table.titleRu || "";

  const columns = table.columns || [];
  studyThead.innerHTML = `<tr>${columns
    .map((col) => `<th scope="col">${colLabel(col)}</th>`)
    .join("")}</tr>`;

  studyTbody.innerHTML = "";
  table.rows.forEach((row) => {
    const tr = document.createElement("tr");
    columns.forEach((col) => {
      const td = document.createElement("td");
      const fieldId = col.id === "ko" ? (row.en != null ? "en" : "ko") : col.id;
      const text =
        col.id === "ko" || col.id === "en" ? rowMeaning(row) : cellText(row[fieldId]);
      const pron = cellText(row[`${col.id}Pron`] || row[`${fieldId}Pron`]);
      td.textContent = text;
      if (pron) {
        td.classList.add("has-pron");
        td.title = pron;
        td.setAttribute("aria-label", `${text} (${pron})`);
      }
      tr.appendChild(td);
    });
    studyTbody.appendChild(tr);
  });

  quizModeRow.innerHTML = "";
  const modes = table.quiz?.modes || [];
  if (modes.length === 0) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "No quiz modes for this table yet.";
    quizModeRow.appendChild(p);
    return;
  }

  modes.forEach((mode) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mode-button";
    btn.textContent = `Quiz: ${modeLabel(mode)}`;
    btn.addEventListener("click", () => startQuiz(mode));
    quizModeRow.appendChild(btn);
  });
}

function startQuiz(mode) {
  currentMode = mode;
  currentRound = 1;
  choiceBank = buildQuestions(currentTable, mode);
  questions = shuffle([...choiceBank]);
  wrongAnswers = [];
  currentIndex = 0;
  roundCorrectCount = 0;

  quizModeChip.textContent = modeLabel(mode);
  roundLabel.textContent = `ROUND ${currentRound}`;
  showOnly(quizCard);
  renderQuestion();
}

function renderQuestion() {
  const current = questions[currentIndex];
  const problemNo = currentIndex + 1;
  choiceLocked = false;

  progressText.textContent = `Question ${problemNo} / ${questions.length}`;
  progressFill.style.width = `${(problemNo / questions.length) * 100}%`;
  questionLabel.textContent = modeLabel(currentMode) || "Pick the answer";
  promptText.textContent = current.prompt;
  promptText.title = current.promptPron || "";
  if (current.promptPron) {
    promptText.classList.add("has-pron");
  } else {
    promptText.classList.remove("has-pron");
  }

  feedbackStatus.textContent = "Ready";
  feedbackDetail.textContent = "Select an answer.";
  feedback.className = "feedback";

  const bank = choiceBank.length ? choiceBank : questions;
  const choiceCount = Math.min(4, Math.max(2, bank.length));
  // Fresh random distractors + order every time this question is shown
  const choices = buildChoices(current, bank, choiceCount);
  choicesEl.innerHTML = "";
  choices.forEach((choice) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice-button";
    btn.textContent = choice;
    if (normalizeAnswer(choice) === normalizeAnswer(current.answerDisplay) && current.answerPron) {
      btn.title = current.answerPron;
    } else {
      const donor = bank.find(
        (q) => normalizeAnswer(q.answerDisplay) === normalizeAnswer(choice)
      );
      if (donor?.answerPron) btn.title = donor.answerPron;
    }
    btn.addEventListener("click", () => onChoose(choice, btn));
    choicesEl.appendChild(btn);
  });
}

function onChoose(choice, btn) {
  if (choiceLocked) return;
  choiceLocked = true;

  const current = questions[currentIndex];
  const isCorrect = current.answers.some(
    (answer) => normalizeAnswer(answer) === normalizeAnswer(choice)
  ) || normalizeAnswer(choice) === normalizeAnswer(current.answerDisplay);

  [...choicesEl.children].forEach((el) => {
    el.disabled = true;
    if (normalizeAnswer(el.textContent) === normalizeAnswer(current.answerDisplay)) {
      el.classList.add("is-correct");
    }
  });

  if (isCorrect) {
    roundCorrectCount += 1;
    btn.classList.add("is-correct");
    feedbackStatus.textContent = "Correct";
    feedbackDetail.textContent = `Answer: ${current.answerDisplay}`;
    feedback.className = "feedback ok";
  } else {
    btn.classList.add("is-wrong");
    feedbackStatus.textContent = "Wrong";
    feedbackDetail.textContent = `Answer: ${current.answerDisplay} · Yours: ${choice}`;
    feedback.className = "feedback bad";
    wrongAnswers.push({ ...current, userAnswer: choice });
  }

  setTimeout(moveNext, 750);
}

function showRoundResult() {
  showOnly(resultCard);
  roundLabel.textContent = `ROUND ${currentRound}`;

  if (wrongAnswers.length === 0) {
    resultTitle.textContent = "Perfect — all correct";
    resultSummary.textContent = `You cleared all ${questions.length} questions in round ${currentRound}.`;
    wrongList.innerHTML = "";
    retryButton.textContent = "Run this mode again";
    retryButton.dataset.mode = "restart";
    return;
  }

  resultTitle.textContent = `Round ${currentRound} result`;
  resultSummary.textContent = `Correct ${roundCorrectCount} · Missed ${wrongAnswers.length}. Retry missed only.`;

  wrongList.innerHTML = "";
  wrongAnswers.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `${item.prompt} → ${item.answerDisplay} / yours: ${item.userAnswer || "(none)"}`;
    if (item.answerPron) li.title = item.answerPron;
    wrongList.appendChild(li);
  });

  retryButton.textContent = `Retry ${wrongAnswers.length} missed`;
  retryButton.dataset.mode = "retry";
}

function moveNext() {
  currentIndex += 1;
  if (currentIndex < questions.length) {
    renderQuestion();
    return;
  }
  showRoundResult();
}

retryButton.addEventListener("click", () => {
  const mode = retryButton.dataset.mode;
  if (mode === "restart") {
    currentRound = 1;
    choiceBank = buildQuestions(currentTable, currentMode);
    questions = shuffle([...choiceBank]);
  } else {
    currentRound += 1;
    // Keep choiceBank as the full mode set so distractors stay rich & reshuffled
    questions = shuffle(
      wrongAnswers.map(
        ({ id, prompt, promptPron, answers, answerDisplay, answerPron, answerColumn }) => ({
          id,
          prompt,
          promptPron,
          answers,
          answerDisplay,
          answerPron,
          answerColumn
        })
      )
    );
  }

  currentIndex = 0;
  roundCorrectCount = 0;
  wrongAnswers = [];
  roundLabel.textContent = `ROUND ${currentRound}`;
  showOnly(quizCard);
  renderQuestion();
});

backHomeBtn.addEventListener("click", () => {
  showOnly(homeCard);
  roundLabel.textContent = "УЧИТЬСЯ";
});

backStudyBtn.addEventListener("click", () => {
  showOnly(studyCard);
  roundLabel.textContent = currentMeta ? `LESSON ${currentMeta.lesson}` : "УЧИТЬСЯ";
});

resultHomeBtn.addEventListener("click", () => {
  showOnly(homeCard);
  roundLabel.textContent = "УЧИТЬСЯ";
});

lessonFilter.addEventListener("change", () => {
  renderHome(lessonFilter.value);
});

async function init() {
  try {
    const res = await fetch(`${DATA_BASE}/manifest.json`);
    if (!res.ok) throw new Error("manifest missing");
    manifest = await res.json();

    lessonFilter.innerHTML = `<option value="all">All lessons</option>`;
    manifest.lessons.forEach((lesson) => {
      const hasTable = manifest.tables.some((t) => t.lesson === lesson.n);
      if (!hasTable) return;
      const opt = document.createElement("option");
      opt.value = String(lesson.n);
      const name = lesson.titleEn || lesson.titleKo || "";
      opt.textContent = `Lesson ${lesson.n} · ${name}`;
      lessonFilter.appendChild(opt);
    });

    await Promise.all(
      manifest.tables.map(async (item) => {
        try {
          await loadTable(item);
        } catch {
          /* skip */
        }
      })
    );

    renderHome("all");
    loadHint.classList.add("hidden");
  } catch (err) {
    console.error(err);
    loadHint.textContent =
      "Failed to load data. From this folder run `npx --yes serve .` or `python -m http.server`.";
  }
}

init();
