const STORAGE_KEY = "goodplate-meals-v1";
const GOALS_STORAGE_KEY = "goodplate-goals-v1";
const THEME_STORAGE_KEY = "goodplate-theme-v1";
const DEFAULT_GOALS = { calories: 2000, protein: 150, carbs: 220, fat: 67 };
let goals = loadGoals();
let theme = loadTheme();
document.documentElement.dataset.theme = theme;

const mealList = document.querySelector("#meal-list-items");
const mealForm = document.querySelector("#meal-form");
const mealDescription = document.querySelector("#meal-description");
const cameraInput = document.querySelector("#meal-camera");
const photoInput = document.querySelector("#meal-photo");
const assistantResult = document.querySelector("#assistant-result");
const mealDialog = document.querySelector("#meal-dialog");
const deleteDialog = document.querySelector("#delete-confirmation-dialog");
const mealEntryScreen = document.querySelector("#meal-entry-screen");
const loadingScreen = document.querySelector("#estimate-loading");
const errorScreen = document.querySelector("#estimate-error");
const mealEditDialog = document.querySelector("#meal-edit-dialog");
const mealEditForm = document.querySelector("#meal-edit-form");
const toast = document.querySelector("#toast");
let meals = loadMeals();
let toastTimer;
let selectedPhoto = null;
let photoPreviewUrl = null;
let historyRange = "week";
let historyOffset = 0;
let insightsRange = "month";
let insightsOffset = 0;
let insightsMetric = "calories";
let estimateTimer;
let pendingDeleteMealId = null;
let editingMealId = null;

const METRICS = {
  calories: { label: "Calories", unit: "kcal", goal: "calories" },
  protein: { label: "Protein", unit: "g", goal: "protein" },
  carbs: { label: "Carbs", unit: "g", goal: "carbs" },
  fat: { label: "Fat", unit: "g", goal: "fat" }
};

function loadTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "dark" ? "dark" : "light";
  } catch (error) {
    console.error("Could not load the saved theme.", error);
    return "light";
  }
}

function saveTheme(nextTheme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  } catch (error) {
    console.error("Could not save the selected theme.", error);
    showToast("Could not save your theme. Check your browser storage settings.");
  }
}

function loadGoals() {
  try {
    const stored = localStorage.getItem(GOALS_STORAGE_KEY);
    if (!stored) return { ...DEFAULT_GOALS };
    const parsed = JSON.parse(stored);
    if (!parsed || !Object.keys(DEFAULT_GOALS).every((key) =>
      Number.isFinite(parsed[key]) && parsed[key] > 0
    )) throw new Error("Saved nutrition goals are invalid.");
    return parsed;
  } catch (error) {
    console.error("Could not load saved nutrition goals.", error);
    return { ...DEFAULT_GOALS };
  }
}

function loadMeals() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new Error("Saved meals are not a list.");
    const validMeals = parsed.filter(isValidMeal);
    const normalizedMeals = validMeals.map((meal) => ({
      ...meal,
      dateKey: isValidDateKey(meal.dateKey) ? meal.dateKey : localDateKey()
    }));
    if (normalizedMeals.some((meal, index) => meal.dateKey !== validMeals[index].dateKey)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedMeals));
    }
    return normalizedMeals;
  } catch (error) {
    console.error("Could not load saved meals.", error);
    return [];
  }
}

function isValidMeal(meal) {
  return meal && typeof meal.id === "string" &&
    typeof meal.name === "string" &&
    ["calories", "protein", "carbs", "fat"].every((key) =>
      Number.isFinite(meal[key]) && meal[key] >= 0
    );
}

function saveMeals() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(meals));
  } catch (error) {
    console.error("Could not save meals.", error);
    showToast("Could not save your diary. Check your browser storage settings.");
  }
}

function formatNumber(value) {
  return Math.round(value).toLocaleString();
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00`);
  return !Number.isNaN(parsed.getTime()) && localDateKey(parsed) === value;
}

function getMealsForDate(date) {
  const key = typeof date === "string" ? date : localDateKey(date);
  return meals.filter((meal) => meal.dateKey === key);
}

function getTodayMeals() {
  return getMealsForDate(new Date());
}

function getTotals(mealItems = getTodayMeals()) {
  return mealItems.reduce((sum, meal) => ({
    calories: sum.calories + meal.calories,
    protein: sum.protein + meal.protein,
    carbs: sum.carbs + meal.carbs,
    fat: sum.fat + meal.fat
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

function renderProgress(id, consumed, goal) {
  const progress = document.querySelector(`#${id}`);
  const percentage = Math.min((consumed / goal) * 100, 100);
  if (id === "calorie-progress") progress.style.setProperty("--progress", `${percentage}%`);
  else progress.style.width = `${percentage}%`;
  progress.setAttribute("aria-valuemax", String(goal));
  progress.setAttribute("aria-valuenow", String(Math.min(Math.round(consumed), goal)));
}

function render() {
  document.querySelector("#theme-toggle").checked = theme === "dark";
  const totals = getTotals();

  document.querySelector("#calories-consumed").textContent = formatNumber(totals.calories);
  document.querySelector("#calories-goal").textContent = formatNumber(goals.calories);
  document.querySelector("#calories-remaining").textContent = formatNumber(Math.max(goals.calories - totals.calories, 0));
  document.querySelector("#protein-consumed").textContent = formatNumber(totals.protein);
  document.querySelector("#carbs-consumed").textContent = formatNumber(totals.carbs);
  document.querySelector("#fat-consumed").textContent = formatNumber(totals.fat);
  renderProgress("calorie-progress", totals.calories, goals.calories);
  renderProgress("protein-progress", totals.protein, goals.protein);
  renderProgress("carbs-progress", totals.carbs, goals.carbs);
  renderProgress("fat-progress", totals.fat, goals.fat);
  renderMeals(mealList, getTodayMeals(), "today");
  renderDestinations();
}

function renderMeals(target = mealList, mealItems = getTodayMeals(), emptyMessage = "today") {
  target.replaceChildren();
  if (mealItems.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `<div class="empty-plate" aria-hidden="true">◉</div><p class="empty-title">No meals logged ${emptyMessage}.</p><p class="empty-copy">Meals you add will appear here.</p>`;
    target.append(empty);
    return;
  }

  mealItems.forEach((meal) => target.append(createMealEntry(meal)));
}

function createMealEntry(meal) {
  const entry = document.createElement("article");
  entry.className = "meal-entry";
  const emoji = document.createElement("div");
  emoji.className = "meal-emoji";
  emoji.setAttribute("aria-hidden", "true");
  emoji.textContent = meal.emoji || "🥗";
  const details = document.createElement("div");
  details.className = "meal-details";
  const name = document.createElement("div");
  name.className = "meal-name";
  name.textContent = meal.name;
  const macros = document.createElement("div");
  macros.className = "meal-macros";
  macros.textContent = `P ${formatNumber(meal.protein)}g  ·  C ${formatNumber(meal.carbs)}g  ·  F ${formatNumber(meal.fat)}g`;
  details.append(name, macros);
  const calories = document.createElement("div");
  calories.className = "meal-calories";
  calories.textContent = formatNumber(meal.calories);
  const calorieUnit = document.createElement("small");
  calorieUnit.textContent = " kcal";
  calories.append(calorieUnit);
  const remove = document.createElement("button");
  remove.className = "remove-meal";
  remove.type = "button";
  remove.setAttribute("aria-label", `Remove ${meal.name}`);
  remove.textContent = "×";
  remove.addEventListener("click", () => requestMealDeletion(meal));
  const actions = document.createElement("div");
  actions.className = "meal-actions";
  const edit = document.createElement("button");
  edit.className = "edit-meal";
  edit.type = "button";
  edit.setAttribute("aria-label", `Edit ${meal.name}`);
  edit.textContent = "Edit";
  edit.addEventListener("click", () => openMealEditor(meal));
  actions.append(edit, remove);
  entry.append(emoji, details, calories, actions);
  return entry;
}

function renderDestinations() {
  renderHistory();
  renderInsights();
  for (const key of Object.keys(DEFAULT_GOALS)) {
    document.querySelector(`#goal-${key}`).value = String(goals[key]);
  }
}

function getPeriodRange(range, offset) {
  const start = new Date();
  if (range === "month") {
    start.setDate(1);
    start.setMonth(start.getMonth() + offset);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    return { start, end };
  }
  const dayFromMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dayFromMonday + offset * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

function getDatesInRange(start, end) {
  const dates = [];
  const date = new Date(start);
  while (date <= end) {
    dates.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return dates;
}

function formatPeriodLabel(range, start, end) {
  const monthFormatter = new Intl.DateTimeFormat(undefined, { month: "short" });
  const fullFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
  if (range === "month") {
    return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(start);
  }
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${monthFormatter.format(start)} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${fullFormatter.format(start)} – ${fullFormatter.format(end)}`;
}

function setRangeControls(selector, activeRange, rangeAttribute) {
  document.querySelectorAll(selector).forEach((button) => {
    const active = button.dataset[rangeAttribute] === activeRange;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderHistory() {
  const { start, end } = getPeriodRange(historyRange, historyOffset);
  const startKey = localDateKey(start);
  const endKey = localDateKey(end);
  const periodMeals = meals
    .filter((meal) => meal.dateKey >= startKey && meal.dateKey <= endKey)
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey) ||
      String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const totals = getTotals(periodMeals);

  setRangeControls("[data-history-range]", historyRange, "historyRange");
  document.querySelector("#history-range-label").textContent = formatPeriodLabel(historyRange, start, end);
  document.querySelector("#history-next").disabled = historyOffset >= 0;
  document.querySelector("#history-meal-count").textContent = String(periodMeals.length);
  document.querySelector("#history-calories").textContent = formatNumber(totals.calories);
  document.querySelector("#history-protein").textContent = `${formatNumber(totals.protein)}g`;
  document.querySelector("#history-carbs").textContent = `${formatNumber(totals.carbs)}g`;
  document.querySelector("#history-fat").textContent = `${formatNumber(totals.fat)}g`;

  const list = document.querySelector("#history-meal-list");
  list.replaceChildren();
  if (periodMeals.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = '<div class="empty-plate" aria-hidden="true">◷</div><p class="empty-title">No meals in this period.</p><p class="empty-copy">Try another date range or log a meal.</p>';
    list.append(empty);
    return;
  }

  const mealsByDate = new Map();
  for (const meal of periodMeals) {
    if (!mealsByDate.has(meal.dateKey)) mealsByDate.set(meal.dateKey, []);
    mealsByDate.get(meal.dateKey).push(meal);
  }
  for (const [dateKey, dateMeals] of mealsByDate) {
    const group = document.createElement("section");
    group.className = "history-day";
    const heading = document.createElement("div");
    heading.className = "history-day-heading";
    const title = document.createElement("h3");
    title.textContent = new Intl.DateTimeFormat(undefined, {
      weekday: "long", month: "long", day: "numeric"
    }).format(new Date(`${dateKey}T12:00:00`));
    const dayCalories = document.createElement("span");
    dayCalories.textContent = `${formatNumber(getTotals(dateMeals).calories)} kcal`;
    heading.append(title, dayCalories);
    group.append(heading);
    dateMeals.forEach((meal) => group.append(createMealEntry(meal)));
    list.append(group);
  }
}

function renderInsights() {
  const { start, end } = getPeriodRange(insightsRange, insightsOffset);
  const dates = getDatesInRange(start, end);
  const metric = METRICS[insightsMetric];
  const dailyValues = dates.map((date) => {
    const dateMeals = getMealsForDate(date);
    return { date, value: getTotals(dateMeals)[insightsMetric], hasMeals: dateMeals.length > 0 };
  });
  const total = dailyValues.reduce((sum, day) => sum + day.value, 0);
  const daysLogged = dailyValues.filter((day) => day.hasMeals).length;
  const daysAtGoal = dailyValues.filter((day) => day.value >= goals[metric.goal]).length;
  const loggedDayAverage = daysLogged ? total / daysLogged : 0;

  setRangeControls("[data-insights-range]", insightsRange, "insightsRange");
  document.querySelectorAll("[data-metric]").forEach((button) => {
    const active = button.dataset.metric === insightsMetric;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelector("#insights-range-label").textContent = formatPeriodLabel(insightsRange, start, end);
  document.querySelector("#insights-next").disabled = insightsOffset >= 0;
  document.querySelector("#chart-logged-label").textContent = `Average on logged days · ${metric.label.toLowerCase()}`;
  document.querySelector("#chart-logged-average").textContent =
    `${formatNumber(loggedDayAverage)} ${metric.unit}`;
  document.querySelector("#chart-metric-label").textContent = `Calendar-day average · ${metric.label.toLowerCase()}`;
  document.querySelector("#chart-average").textContent = `${formatNumber(total / dailyValues.length)} ${metric.unit}`;
  document.querySelector("#chart-total-label").textContent = `Total ${metric.label.toLowerCase()} this period`;
  document.querySelector("#chart-total").textContent = `${formatNumber(total)} ${metric.unit}`;
  document.querySelector("#chart-days-logged").textContent = `${daysLogged} / ${dailyValues.length}`;
  document.querySelector("#chart-days-at-goal").textContent = `${daysAtGoal}`;
  drawInsightsChart(dailyValues, metric);
}

function drawInsightsChart(dailyValues, metric) {
  const svg = document.querySelector("#insights-chart");
  const namespace = "http://www.w3.org/2000/svg";
  const width = 800;
  const height = 280;
  const plot = { left: 52, right: 16, top: 24, bottom: 42 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const goal = goals[metric.goal];
  const maximum = Math.max(goal, ...dailyValues.map((day) => day.value), 1) * 1.15;
  const slot = plotWidth / dailyValues.length;
  const barWidth = Math.max(4, Math.min(24, slot * 0.58));
  const makeElement = (name, attributes, text) => {
    const element = document.createElementNS(namespace, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    if (text) element.textContent = text;
    return element;
  };
  const formatAxisValue = (value) => metric.unit === "kcal"
    ? formatNumber(value)
    : `${formatNumber(value)}${metric.unit}`;

  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("aria-label", `${metric.label} per day from ${formatPeriodLabel(insightsRange, dailyValues[0].date, dailyValues.at(-1).date)}`);

  for (let tick = 0; tick <= 2; tick += 1) {
    const value = maximum * tick / 2;
    const y = plot.top + plotHeight * (1 - tick / 2);
    svg.append(
      makeElement("line", { x1: plot.left, x2: width - plot.right, y1: y, y2: y, class: "chart-gridline" }),
      makeElement("text", { x: plot.left - 9, y: y + 4, "text-anchor": "end", class: "chart-axis-label" }, formatAxisValue(value))
    );
  }

  if (goal < maximum) {
    const goalY = plot.top + plotHeight * (1 - goal / maximum);
    svg.append(
      makeElement("line", { x1: plot.left, x2: width - plot.right, y1: goalY, y2: goalY, class: "chart-goal-line" }),
      makeElement("text", { x: width - plot.right - 2, y: goalY - 6, "text-anchor": "end", class: "chart-goal-label" }, `Goal ${formatAxisValue(goal)}`)
    );
  }

  dailyValues.forEach((day, index) => {
    const barHeight = Math.max(0, day.value / maximum * plotHeight);
    const x = plot.left + slot * index + (slot - barWidth) / 2;
    const y = plot.top + plotHeight - barHeight;
    const label = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(day.date);
    const bar = makeElement("rect", {
      x, y, width: barWidth, height: barHeight,
      rx: Math.min(5, barWidth / 2),
      class: day.value >= goal ? "chart-bar chart-bar-goal" : "chart-bar"
    });
    bar.append(makeElement("title", {}, `${label}: ${formatAxisValue(day.value)}`));
    svg.append(bar);

    const labelStep = dailyValues.length <= 7 ? 1 : 5;
    if (index % labelStep === 0 || index === dailyValues.length - 1) {
      svg.append(makeElement("text", {
        x: plot.left + slot * index + slot / 2,
        y: height - 14,
        "text-anchor": "middle",
        class: "chart-axis-label"
      }, insightsRange === "month"
        ? String(day.date.getDate())
        : new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(day.date)));
    }
  });
}

function addMeal(meal) {
  meals.unshift({ ...meal, id: crypto.randomUUID(), dateKey: localDateKey(), createdAt: new Date().toISOString() });
  saveMeals();
  render();
}

function removeMeal(id) {
  meals = meals.filter((meal) => meal.id !== id);
  saveMeals();
  render();
  showToast("Meal removed from your diary.");
}

function openMealEditor(meal) {
  editingMealId = meal.id;
  document.querySelector("#edit-meal-name").value = meal.name;
  document.querySelector("#edit-meal-calories").value = String(meal.calories);
  document.querySelector("#edit-meal-protein").value = String(meal.protein);
  document.querySelector("#edit-meal-carbs").value = String(meal.carbs);
  document.querySelector("#edit-meal-fat").value = String(meal.fat);
  if (typeof mealEditDialog.showModal === "function") mealEditDialog.showModal();
  else mealEditDialog.setAttribute("open", "");
  document.querySelector("#edit-meal-name").focus({ preventScroll: true });
}

mealEditForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!editingMealId || !mealEditForm.reportValidity()) return;

  const values = {
    name: document.querySelector("#edit-meal-name").value.trim(),
    calories: Number(document.querySelector("#edit-meal-calories").value),
    protein: Number(document.querySelector("#edit-meal-protein").value),
    carbs: Number(document.querySelector("#edit-meal-carbs").value),
    fat: Number(document.querySelector("#edit-meal-fat").value)
  };
  const mealExists = meals.some((meal) => meal.id === editingMealId);
  if (!mealExists) {
    mealEditDialog.close();
    showToast("That meal is no longer in your diary.");
    return;
  }
  if (!values.name || !Object.values(values).slice(1).every(Number.isFinite)) {
    showToast("Enter a meal name and valid nutrition values.");
    return;
  }

  meals = meals.map((meal) => meal.id === editingMealId ? { ...meal, ...values } : meal);
  saveMeals();
  render();
  mealEditDialog.close();
  showToast("Meal details updated.");
});

document.querySelector("#cancel-meal-edit").addEventListener("click", () => mealEditDialog.close());
mealEditDialog.addEventListener("close", () => { editingMealId = null; });

function requestMealDeletion(meal) {
  pendingDeleteMealId = meal.id;
  document.querySelector("#delete-meal-name").textContent = meal.name;
  if (typeof deleteDialog.showModal === "function") deleteDialog.showModal();
  else deleteDialog.setAttribute("open", "");
}

document.querySelector("#confirm-delete-meal").addEventListener("click", () => {
  if (!pendingDeleteMealId) return;
  const mealExists = meals.some((meal) => meal.id === pendingDeleteMealId);
  if (!mealExists) {
    pendingDeleteMealId = null;
    deleteDialog.close();
    showToast("That meal is no longer in your diary.");
    return;
  }
  const id = pendingDeleteMealId;
  pendingDeleteMealId = null;
  deleteDialog.close();
  removeMeal(id);
});

deleteDialog.addEventListener("close", () => {
  pendingDeleteMealId = null;
});

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3200);
}

function estimateMeal(description) {
  const text = description.toLowerCase();
  if (/salmon|fish|tuna/.test(text)) {
    return { name: description.trim(), calories: 480, protein: 36, carbs: 42, fat: 18, emoji: "🐟" };
  }
  if (/salad|greens|lettuce/.test(text)) {
    return { name: description.trim(), calories: 340, protein: 20, carbs: 28, fat: 16, emoji: "🥗" };
  }
  if (/oat|porridge/.test(text)) {
    return { name: description.trim(), calories: 320, protein: 12, carbs: 52, fat: 8, emoji: "🥣" };
  }
  if (/egg|omelet|omelette/.test(text)) {
    return { name: description.trim(), calories: 310, protein: 20, carbs: 22, fat: 15, emoji: "🍳" };
  }
  if (/pizza/.test(text)) {
    return { name: description.trim(), calories: 560, protein: 24, carbs: 62, fat: 23, emoji: "🍕" };
  }
  if (/smoothie|shake/.test(text)) {
    return { name: description.trim(), calories: 290, protein: 18, carbs: 38, fat: 7, emoji: "🥤" };
  }
  if (/chicken|turkey/.test(text)) {
    return { name: description.trim(), calories: 520, protein: 38, carbs: 48, fat: 17, emoji: "🍗" };
  }
  return { name: description.trim(), calories: 420, protein: 24, carbs: 46, fat: 14, emoji: "🥗" };
}

function showEstimate(estimate) {
  mealEntryScreen.hidden = false;
  loadingScreen.hidden = true;
  errorScreen.hidden = true;
  assistantResult.replaceChildren();
  assistantResult.hidden = false;
  document.querySelector(".dialog-copy").hidden = true;
  mealForm.hidden = true;
  const header = document.createElement("div");
  header.className = "result-title-row";
  const label = document.createElement("span");
  label.className = "result-label";
  label.textContent = "MEAL ESTIMATE";
  const badge = document.createElement("span");
  badge.className = "demo-badge";
  badge.textContent = "DEMO";
  header.append(label, badge);
  const name = document.createElement("div");
  name.className = "suggestion-name";
  name.textContent = estimate.name;
  const fields = [
    ["calories", "Calories", estimate.calories],
    ["protein", "Protein (g)", estimate.protein],
    ["carbs", "Carbs (g)", estimate.carbs],
    ["fat", "Fat (g)", estimate.fat]
  ];
  const inputs = document.createElement("div");
  inputs.className = "result-inputs";
  for (const [key, labelText, value] of fields) {
    const wrapper = document.createElement("div");
    const labelElement = document.createElement("label");
    labelElement.textContent = labelText;
    labelElement.htmlFor = `estimate-${key}`;
    const input = document.createElement("input");
    input.id = `estimate-${key}`;
    input.type = "number";
    input.min = "0";
    input.max = key === "calories" ? "10000" : "1000";
    input.step = "1";
    input.value = String(value);
    input.required = true;
    wrapper.append(labelElement, input);
    inputs.append(wrapper);
  }
  const actions = document.createElement("div");
  actions.className = "result-actions";
  const add = document.createElement("button");
  add.type = "button";
  add.className = "primary-button";
  add.textContent = "Add to diary";
  add.addEventListener("click", () => {
    const values = Object.fromEntries(fields.map(([key]) => {
      const input = assistantResult.querySelector(`#estimate-${key}`);
      return [key, Number(input.value)];
    }));
    if (!Object.values(values).every((value) => Number.isFinite(value) && value >= 0)) {
      showToast("Enter valid, non-negative nutrition values.");
      return;
    }
    addMeal({ ...estimate, ...values });
    mealDialog.close();
    showToast("Meal added to today's diary.");
  });
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "secondary-button";
  dismiss.textContent = "Edit meal";
  dismiss.addEventListener("click", showMealEntry);
  actions.append(add, dismiss);
  assistantResult.append(header, name, inputs, actions);
}

function showMealEntry() {
  estimateTimer = undefined;
  mealEntryScreen.hidden = false;
  loadingScreen.hidden = true;
  errorScreen.hidden = true;
  assistantResult.hidden = true;
  document.querySelector(".dialog-copy").hidden = false;
  mealForm.hidden = false;
}

function runEstimate() {
  mealEntryScreen.hidden = true;
  loadingScreen.hidden = false;
  errorScreen.hidden = true;
  const description = mealDescription.value.trim();

  estimateTimer = window.setTimeout(() => {
    try {
      if (selectedPhoto) {
        const photoName = selectedPhoto.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
        showEstimate({
          name: description || (photoName ? `Meal photo: ${photoName}` : "Meal from photo"),
          calories: 420,
          protein: 24,
          carbs: 46,
          fat: 14,
          emoji: "🥗"
        });
        if (!description) showToast("Demo photo estimate only — image recognition is not connected yet.");
      } else {
        showEstimate(estimateMeal(description));
      }
    } catch (error) {
      console.error("Could not estimate the meal.", error);
      loadingScreen.hidden = true;
      errorScreen.hidden = false;
      document.querySelector("#estimate-error-message").textContent =
              "The estimate couldn't be completed. Try again or edit the meal details.";
    }
  }, 900);
}

function openMealDialog() {
  resetMealDialog();
  if (typeof mealDialog.showModal === "function") mealDialog.showModal();
  else mealDialog.setAttribute("open", "");
  mealDescription.focus({ preventScroll: true });
}

function resetMealDialog() {
  if (estimateTimer !== undefined) window.clearTimeout(estimateTimer);
  estimateTimer = undefined;
  mealForm.reset();
  assistantResult.replaceChildren();
  clearSelectedPhoto();
  showMealEntry();
  mealEntryScreen.hidden = false;
}

function clearSelectedPhoto() {
  selectedPhoto = null;
  if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
  photoPreviewUrl = null;
  cameraInput.value = "";
  photoInput.value = "";
  document.querySelector("#photo-preview").hidden = true;
  document.querySelector("#photo-preview-image").removeAttribute("src");
  document.querySelector("#photo-preview-name").textContent = "";
}

function showSelectedPhoto(file) {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowedTypes.includes(file.type)) {
    clearSelectedPhoto();
    showToast("Choose a JPG, PNG, WEBP, or GIF image.");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    clearSelectedPhoto();
    showToast("Choose an image smaller than 10 MB.");
    return;
  }
  clearSelectedPhoto();
  selectedPhoto = file;
  photoPreviewUrl = URL.createObjectURL(file);
  document.querySelector("#photo-preview-image").src = photoPreviewUrl;
  document.querySelector("#photo-preview-name").textContent = file.name;
  document.querySelector("#photo-preview").hidden = false;
}

const now = new Date();
document.querySelector("#today-label").textContent = new Intl.DateTimeFormat(undefined, {
  weekday: "short", month: "short", day: "numeric"
}).format(now);
document.querySelector("#welcome-date").textContent = new Intl.DateTimeFormat(undefined, {
  weekday: "long", month: "long", day: "numeric"
}).format(now).toUpperCase();
const hour = now.getHours();
document.querySelector("#greeting").firstChild.textContent =
  hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

function navigateTo(page) {
  document.querySelectorAll(".app-view").forEach((view) => {
    view.hidden = view.dataset.page !== page;
  });
  document.querySelectorAll(".mobile-nav [data-navigate], .nav-links [data-navigate]").forEach((button) => {
    const active = button.dataset.navigate === page;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll("[data-navigate]").forEach((button) => {
  button.addEventListener("click", () => navigateTo(button.dataset.navigate));
});

document.querySelectorAll("[data-open-meal]").forEach((button) => {
  button.addEventListener("click", openMealDialog);
});

document.querySelectorAll("[data-history-range]").forEach((button) => {
  button.addEventListener("click", () => {
    historyRange = button.dataset.historyRange;
    historyOffset = 0;
    renderHistory();
  });
});
document.querySelector("#history-previous").addEventListener("click", () => {
  historyOffset -= 1;
  renderHistory();
});
document.querySelector("#history-next").addEventListener("click", () => {
  if (historyOffset < 0) historyOffset += 1;
  renderHistory();
});

document.querySelectorAll("[data-insights-range]").forEach((button) => {
  button.addEventListener("click", () => {
    insightsRange = button.dataset.insightsRange;
    insightsOffset = 0;
    renderInsights();
  });
});
document.querySelectorAll("[data-metric]").forEach((button) => {
  button.addEventListener("click", () => {
    insightsMetric = button.dataset.metric;
    renderInsights();
  });
});
document.querySelector("#insights-previous").addEventListener("click", () => {
  insightsOffset -= 1;
  renderInsights();
});
document.querySelector("#insights-next").addEventListener("click", () => {
  if (insightsOffset < 0) insightsOffset += 1;
  renderInsights();
});

mealForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const description = mealDescription.value.trim();
  if (!description && !selectedPhoto) {
    mealDescription.focus();
    showToast("Describe your meal or choose a photo first.");
    return;
  }
  runEstimate();
});

document.querySelector("#retry-estimate").addEventListener("click", runEstimate);
document.querySelector("#edit-meal-input").addEventListener("click", showMealEntry);
mealDialog.addEventListener("close", resetMealDialog);

for (const input of [cameraInput, photoInput]) {
  input.addEventListener("change", (event) => {
    const file = event.currentTarget.files[0];
    if (file) showSelectedPhoto(file);
  });
}

document.querySelector("#open-camera").addEventListener("click", () => cameraInput.click());
document.querySelector("#choose-photo").addEventListener("click", () => photoInput.click());
document.querySelector("#remove-photo").addEventListener("click", clearSelectedPhoto);

document.querySelector("#theme-toggle").addEventListener("change", (event) => {
  theme = event.currentTarget.checked ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  saveTheme(theme);
});

document.querySelector("#settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const nextGoals = Object.fromEntries(Object.keys(DEFAULT_GOALS).map((key) => [
    key,
    Number(form.elements.namedItem(key).value)
  ]));
  if (!Object.values(nextGoals).every((value) => Number.isInteger(value) && value > 0)) {
    showToast("Enter a whole number greater than zero for each goal.");
    return;
  }
  goals = nextGoals;
  try {
    localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(goals));
  } catch (error) {
    console.error("Could not save nutrition goals.", error);
    showToast("Could not save your goals. Check your browser storage settings.");
    return;
  }
  render();
  showToast("Daily goals saved.");
});

render();
