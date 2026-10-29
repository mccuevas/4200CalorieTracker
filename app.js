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
const assistantResult = document.querySelector("#assistant-result");
const mealDialog = document.querySelector("#meal-dialog");
const toast = document.querySelector("#toast");
let meals = loadMeals();
let toastTimer;
let selectedPhoto = null;
let photoPreviewUrl = null;

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
    return parsed.filter(isValidMeal);
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
    writeMealsToFolder();
  } catch (error) {
    console.error("Could not save meals.", error);
    showToast("Could not save your diary. Check your browser storage settings.");
  }
}

function formatNumber(value) {
  return Math.round(value).toLocaleString();
}

function getTotals() {
  return meals.reduce((sum, meal) => ({
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
  renderMeals();
  renderDestinations(totals);
}

function renderMeals(target = mealList) {
  target.replaceChildren();
  if (meals.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = '<div class="empty-plate" aria-hidden="true">◉</div><p class="empty-title">No meals logged today.</p><p class="empty-copy">Meals you add will appear here.</p>';
    target.append(empty);
    return;
  }

  for (const meal of meals) {
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
    remove.addEventListener("click", () => removeMeal(meal.id));
    entry.append(emoji, details, calories, remove);
    target.append(entry);
  }
}

function renderDestinations(totals) {
  document.querySelector("#history-meal-count").textContent = String(meals.length);
  document.querySelector("#history-calories").textContent = formatNumber(totals.calories);
  document.querySelector("#history-protein").textContent = `${formatNumber(totals.protein)}g`;
  document.querySelector("#history-carbs").textContent = `${formatNumber(totals.carbs)}g`;
  document.querySelector("#history-fat").textContent = `${formatNumber(totals.fat)}g`;
  renderMeals(document.querySelector("#history-meal-list"));

  document.querySelector("#insights-calories").textContent = formatNumber(totals.calories);
  document.querySelector("#insights-calorie-goal").textContent = formatNumber(goals.calories);
  document.querySelector("#insights-protein").textContent = `${formatNumber(totals.protein)}g`;
  document.querySelector("#insights-protein-goal").textContent = formatNumber(goals.protein);
  document.querySelector("#insights-carbs").textContent = `${formatNumber(totals.carbs)}g`;
  document.querySelector("#insights-carbs-goal").textContent = formatNumber(goals.carbs);
  document.querySelector("#insights-fat").textContent = `${formatNumber(totals.fat)}g`;
  document.querySelector("#insights-fat-goal").textContent = formatNumber(goals.fat);
  document.querySelector("#insights-heading").textContent = meals.length
    ? `${meals.length} meal${meals.length === 1 ? "" : "s"} logged today`
    : "Your insights will show up here.";
  document.querySelector("#insights-copy").textContent = meals.length
    ? `${formatNumber(totals.calories)} of ${formatNumber(goals.calories)} kcal logged so far. Nutrition values are estimates based on your entries.`
    : "Log a meal to see a summary of your calorie and macro progress.";

  for (const key of Object.keys(DEFAULT_GOALS)) {
    document.querySelector(`#goal-${key}`).value = String(goals[key]);
  }
}

function addMeal(meal) {
  meals.unshift({ ...meal, id: crypto.randomUUID() });
  saveMeals();
  render();
}

function removeMeal(id) {
  meals = meals.filter((meal) => meal.id !== id);
  saveMeals();
  render();
  showToast("Meal removed from your diary.");
}

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
  assistantResult.replaceChildren();
  assistantResult.hidden = false;
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
    assistantResult.hidden = true;
    mealDescription.value = "";
    clearSelectedPhoto();
    showToast("Meal added to today's diary.");
  });
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "secondary-button";
  dismiss.textContent = "Dismiss";
  dismiss.addEventListener("click", () => { assistantResult.hidden = true; });
  actions.append(add, dismiss);
  assistantResult.append(header, name, inputs, actions);
}

function openMealDialog() {
  if (typeof mealDialog.showModal === "function") mealDialog.showModal();
  else mealDialog.setAttribute("open", "");
}

function clearSelectedPhoto() {
  selectedPhoto = null;
  if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
  photoPreviewUrl = null;
  document.querySelector("#meal-photo").value = "";
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
document.querySelector("#history-date").textContent = new Intl.DateTimeFormat(undefined, {
  weekday: "long", month: "long", day: "numeric", year: "numeric"
}).format(now);
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

document.querySelectorAll("[data-open-estimator]").forEach((button) => {
  button.addEventListener("click", () => {
    navigateTo("home");
    const estimator = document.querySelector(".assistant-card");
    estimator.scrollIntoView({ behavior: "smooth", block: "center" });
    mealDescription.focus({ preventScroll: true });
  });
});

document.querySelector("#dialog-ai").addEventListener("click", () => {
  mealDialog.close();
  navigateTo("home");
  const estimator = document.querySelector(".assistant-card");
  estimator.scrollIntoView({ behavior: "smooth", block: "center" });
  mealDescription.focus({ preventScroll: true });
});

mealForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const description = mealDescription.value.trim();
  if (!description && !selectedPhoto) {
    mealDescription.focus();
    showToast("Describe your meal or choose a photo first.");
    return;
  }
  if (description) {
    showEstimate(estimateMeal(description));
    return;
  }
  const photoName = selectedPhoto.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  showEstimate({
    name: photoName ? `Meal photo: ${photoName}` : "Meal from photo",
    calories: 420,
    protein: 24,
    carbs: 46,
    fat: 14,
    emoji: "🥗"
  });
  showToast("Demo photo estimate only — image recognition is not connected yet.");
});

document.querySelector("#meal-photo").addEventListener("change", (event) => {
  const file = event.currentTarget.files[0];
  if (file) showSelectedPhoto(file);
});

document.querySelector("#remove-photo").addEventListener("click", clearSelectedPhoto);

document.querySelector("#theme-toggle").addEventListener("change", (event) => {
  theme = event.currentTarget.checked ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  saveTheme(theme);
});

document.querySelector("#manual-meal-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  addMeal({
    name: document.querySelector("#manual-name").value.trim(),
    calories: Number(document.querySelector("#manual-calories").value),
    protein: Number(document.querySelector("#manual-protein").value),
    carbs: Number(document.querySelector("#manual-carbs").value),
    fat: Number(document.querySelector("#manual-fat").value),
    emoji: "🥗"
  });
  form.reset();
  mealDialog.close();
  showToast("Meal added to today's diary.");
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
// ---------- Folder storage (File System Access API, no backend) ----------
let dataDir = null;
const folderStatus = document.querySelector("#folder-status");
const chooseFolderBtn = document.querySelector("#choose-folder");

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("calorie-tracker", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("handles");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve) => {
    const req = db.transaction("handles").objectStore("handles").get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(undefined);
  });
}
async function idbSet(key, value) {
  const db = await idbOpen();
  return new Promise((resolve) => {
    const tx = db.transaction("handles", "readwrite");
    tx.objectStore("handles").put(value, key);
    tx.oncomplete = resolve;
  });
}

async function writeMealsToFolder() {
  if (!dataDir) return;
  try {
    const file = await dataDir.getFileHandle("meals.json", { create: true });
    const writable = await file.createWritable();
    await writable.write(JSON.stringify(meals, null, 2));
    await writable.close();
  } catch (error) {
    console.error("Could not write to the data folder.", error);
    showToast("Could not write to your data folder. Try reconnecting it in Settings.");
  }
}

async function syncFromFolder() {
  try {
    const handle = await dataDir.getFileHandle("meals.json");
    const parsed = JSON.parse(await (await handle.getFile()).text());
    if (Array.isArray(parsed)) meals = parsed.filter(isValidMeal);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(meals));
    render();
  } catch {
    await writeMealsToFolder(); // no file yet, so create it from what we have
  }
  folderStatus.textContent = `Saving to folder: ${dataDir.name}`;
  chooseFolderBtn.textContent = "Change folder";
}

async function initFolder() {
  if (!("showDirectoryPicker" in window)) {
    folderStatus.textContent = "Folder saving needs Chrome or Edge. Meals are saved in this browser.";
    chooseFolderBtn.hidden = true;
    return;
  }
  const saved = await idbGet("dir");
  if (!saved) return;
  dataDir = saved;
  if ((await saved.queryPermission({ mode: "readwrite" })) === "granted") {
    await syncFromFolder();
  } else {
    folderStatus.textContent = `Click "Reconnect" to keep saving to ${saved.name}.`;
    chooseFolderBtn.textContent = "Reconnect";
  }
}

chooseFolderBtn.addEventListener("click", async () => {
  try {
    if (dataDir && chooseFolderBtn.textContent === "Reconnect") {
      if ((await dataDir.requestPermission({ mode: "readwrite" })) !== "granted") return;
    } else {
      dataDir = await window.showDirectoryPicker({ mode: "readwrite" });
      await idbSet("dir", dataDir);
    }
    await syncFromFolder();
    showToast("Data folder connected.");
  } catch (error) {
    if (error.name !== "AbortError") console.error(error);
  }
});
render();
initFolder();
