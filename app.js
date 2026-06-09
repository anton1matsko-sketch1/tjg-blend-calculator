const state = {
  mode: "tanks",
  tanks: [],
  allocations: {},
};

const els = {
  tankRows: document.querySelector("#tankRows"),
  headerSummary: document.querySelector("#headerSummary"),
  addTankBtn: document.querySelector("#addTankBtn"),
  loadExampleBtn: document.querySelector("#loadExampleBtn"),
  calculateBtn: document.querySelector("#calculateBtn"),
  printBtn: document.querySelector("#printBtn"),
  modeTanksBtn: document.querySelector("#modeTanksBtn"),
  modeBatchBtn: document.querySelector("#modeBatchBtn"),
  batchVolumeLabel: document.querySelector("#batchVolumeLabel"),
  batchAllocator: document.querySelector("#batchAllocator"),
  allocationRows: document.querySelector("#allocationRows"),
  autoAllocateBtn: document.querySelector("#autoAllocateBtn"),
  targetDensity: document.querySelector("#targetDensity"),
  targetVolume: document.querySelector("#targetVolume"),
  waterDensity: document.querySelector("#waterDensity"),
  reagentDensity: document.querySelector("#reagentDensity"),
  reagentLimit: document.querySelector("#reagentLimit"),
  bagSize: document.querySelector("#bagSize"),
  waterRate: document.querySelector("#waterRate"),
  referenceTemp: document.querySelector("#referenceTemp"),
  tempCoeff: document.querySelector("#tempCoeff"),
  warnings: document.querySelector("#warnings"),
  results: document.querySelector("#results"),
  resultSubtitle: document.querySelector("#resultSubtitle"),
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function fmt(value, digits = 2) {
  return round(value, digits).toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readParams() {
  return {
    waterDensity: num(els.waterDensity.value, 1),
    reagentDensity: num(els.reagentDensity.value, 2.6),
    reagentLimit: num(els.reagentLimit.value, 0),
    bagSize: num(els.bagSize.value, 1000),
    waterRate: num(els.waterRate.value, 8),
    referenceTemp: num(els.referenceTemp.value, 20),
    tempCoeff: num(els.tempCoeff.value, 0),
    targetDensity: num(els.targetDensity.value, 1.74),
    targetVolume: num(els.targetVolume.value, 0),
  };
}

function densityAtReference(tank, params) {
  return tank.density + params.tempCoeff * (tank.temperature - params.referenceTemp);
}

function tankMassTon(tank, params) {
  return tank.volume * densityAtReference(tank, params);
}

function calcAdjustment(volume, density, target, params) {
  const diff = density - target;
  const tolerance = 0.0005;

  if (Math.abs(diff) <= tolerance) {
    return {
      type: "ok",
      waterVolume: 0,
      reagentVolume: 0,
      reagentKg: 0,
      finalVolume: volume,
      finalDensity: density,
    };
  }

  if (density > target) {
    const denominator = target - params.waterDensity;
    const waterVolume = denominator > 0 ? (volume * (density - target)) / denominator : Number.NaN;
    return {
      type: "water",
      waterVolume,
      reagentVolume: 0,
      reagentKg: 0,
      finalVolume: volume + waterVolume,
      finalDensity: target,
    };
  }

  const denominator = params.reagentDensity - target;
  const reagentVolume = denominator > 0 ? (volume * (target - density)) / denominator : Number.NaN;
  const reagentKg = reagentVolume * params.reagentDensity * 1000;
  return {
    type: "reagent",
    waterVolume: 0,
    reagentVolume,
    reagentKg,
    finalVolume: volume + reagentVolume,
    finalDensity: target,
  };
}

function addTank(data = {}) {
  const id = uid();
  state.tanks.push({
    id,
    name: data.name ?? `Емкость ${state.tanks.length + 1}`,
    volume: data.volume ?? 0,
    density: data.density ?? 1.74,
    temperature: data.temperature ?? 20,
    capacity: data.capacity ?? 0,
  });
  state.allocations[id] = 0;
  render();
}

function loadExample() {
  state.tanks = [
    { id: uid(), name: "Емкость 1 (Рабочая)", volume: 25, density: 1.76, temperature: 20, capacity: 30 },
    { id: uid(), name: "Емкость 2", volume: 40, density: 1.805, temperature: 20, capacity: 50 },
    { id: uid(), name: "Емкость 3", volume: 35, density: 1.69, temperature: 20, capacity: 40 },
  ];
  state.allocations = Object.fromEntries(state.tanks.map((tank) => [tank.id, 0]));
  render();
  calculate();
}

function updateTank(id, key, value) {
  const tank = state.tanks.find((item) => item.id === id);
  if (!tank) return;
  tank[key] = key === "name" ? value : num(value, 0);
  renderHeader();
  renderAllocator();
}

function removeTank(id) {
  state.tanks = state.tanks.filter((tank) => tank.id !== id);
  delete state.allocations[id];
  render();
}

function setMode(mode) {
  state.mode = mode;
  els.modeTanksBtn.classList.toggle("active", mode === "tanks");
  els.modeBatchBtn.classList.toggle("active", mode === "batch");
  els.batchVolumeLabel.classList.toggle("hidden", mode !== "batch");
  els.batchAllocator.classList.toggle("hidden", mode !== "batch");
  renderAllocator();
  calculate();
}

function autoAllocate() {
  const params = readParams();
  let remaining = params.targetVolume;
  state.allocations = {};
  const sorted = [...state.tanks].sort((a, b) => {
    const aDensity = Math.abs(densityAtReference(a, params) - params.targetDensity);
    const bDensity = Math.abs(densityAtReference(b, params) - params.targetDensity);
    return aDensity - bDensity;
  });

  for (const tank of sorted) {
    const take = Math.min(tank.volume, Math.max(remaining, 0));
    state.allocations[tank.id] = round(take, 3);
    remaining -= take;
  }

  for (const tank of state.tanks) {
    state.allocations[tank.id] = state.allocations[tank.id] ?? 0;
  }

  renderAllocator();
  calculate();
}

function renderHeader() {
  const params = readParams();
  const totalVolume = state.tanks.reduce((sum, tank) => sum + tank.volume, 0);
  const totalMass = state.tanks.reduce((sum, tank) => sum + tankMassTon(tank, params), 0);
  const averageDensity = totalVolume > 0 ? totalMass / totalVolume : 0;
  const freeVolume = state.tanks.reduce((sum, tank) => sum + Math.max(tank.capacity - tank.volume, 0), 0);

  els.headerSummary.innerHTML = [
    ["Объем", `${fmt(totalVolume, 2)} м3`],
    ["Средняя плотность", `${fmt(averageDensity, 3)} г/см3`],
    ["Свободно", `${fmt(freeVolume, 2)} м3`],
  ]
    .map(([label, value]) => `<div class="summary-tile"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function renderTanks() {
  els.tankRows.innerHTML = state.tanks
    .map((tank) => {
      const free = Math.max(tank.capacity - tank.volume, 0);
      return `
        <tr>
          <td><input value="${tank.name}" data-id="${tank.id}" data-key="name" aria-label="Название емкости" /></td>
          <td><input type="number" min="0" step="0.1" value="${tank.volume}" data-id="${tank.id}" data-key="volume" aria-label="Объем" /></td>
          <td><input type="number" min="0" step="0.001" value="${tank.density}" data-id="${tank.id}" data-key="density" aria-label="Плотность" /></td>
          <td><input type="number" step="1" value="${tank.temperature}" data-id="${tank.id}" data-key="temperature" aria-label="Температура" /></td>
          <td><input type="number" min="0" step="0.1" value="${tank.capacity}" data-id="${tank.id}" data-key="capacity" aria-label="Максимальный объем" /></td>
          <td class="free-volume">${fmt(free, 2)} м3</td>
          <td><button class="remove-button" type="button" data-remove="${tank.id}" title="Удалить емкость">×</button></td>
        </tr>
      `;
    })
    .join("");
}

function renderAllocator() {
  if (state.mode !== "batch") return;
  els.allocationRows.innerHTML = state.tanks
    .map((tank) => {
      const value = state.allocations[tank.id] ?? 0;
      return `
        <label class="allocation-card">
          <strong>${tank.name}</strong>
          <span>Доступно ${fmt(tank.volume, 2)} м3, плотность ${fmt(tank.density, 3)}</span>
          Отбор, м3
          <input type="number" min="0" max="${tank.volume}" step="0.1" value="${value}" data-allocation="${tank.id}" />
        </label>
      `;
    })
    .join("");
}

function render() {
  renderHeader();
  renderTanks();
  renderAllocator();
}

function showWarnings(items) {
  els.warnings.innerHTML = items
    .map((item) => `<div class="warning ${item.level === "danger" ? "danger" : ""}">${item.text}</div>`)
    .join("");
}

function actionText(result) {
  if (result.type === "water") return `<span class="status-water">Добавить воду</span>`;
  if (result.type === "reagent") return `<span class="status-reagent">Добавить реагент</span>`;
  return `<span class="status-ok">Коррекция не нужна</span>`;
}

function renderResultCard(title, subtitle, result, extras = []) {
  const waterMinutes = result.waterVolume > 0 ? (result.waterVolume * 1000) / (readParams().waterRate * 60) : 0;
  const bags = result.reagentKg > 0 ? result.reagentKg / Math.max(readParams().bagSize, 1) : 0;
  const metrics = [
    ["Действие", actionText(result)],
    ["Вода", `${fmt(result.waterVolume, 2)} м3`],
    ["Время подачи воды", `${fmt(waterMinutes, 1)} мин`],
    ["Реагент", `${fmt(result.reagentKg, 0)} кг`],
    ["Мешки по фасовке", `${fmt(bags, 2)} шт.`],
    ["Прирост объема", `${fmt(result.waterVolume + result.reagentVolume, 2)} м3`],
    ["Итоговый объем", `${fmt(result.finalVolume, 2)} м3`],
    ["Итоговая плотность", `${fmt(result.finalDensity, 3)} г/см3`],
    ...extras,
  ];

  return `
    <article class="result-card">
      <header>
        <div>
          <h3>${title}</h3>
          <p>${subtitle}</p>
        </div>
      </header>
      <div class="result-grid">
        ${metrics
          .map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`)
          .join("")}
      </div>
    </article>
  `;
}

function calculateTanks() {
  const params = readParams();
  const warnings = [];
  let totalWater = 0;
  let totalReagent = 0;

  const cards = state.tanks.map((tank) => {
    const correctedDensity = densityAtReference(tank, params);
    const result = calcAdjustment(tank.volume, correctedDensity, params.targetDensity, params);
    const freeVolume = Math.max(tank.capacity - tank.volume, 0);
    const addedVolume = result.waterVolume + result.reagentVolume;

    if (!Number.isFinite(result.finalVolume)) {
      warnings.push({ level: "danger", text: `${tank.name}: невозможно рассчитать при заданных плотностях.` });
    }

    if (addedVolume > freeVolume + 0.0001) {
      warnings.push({
        level: "danger",
        text: `${tank.name}: нужно добавить ${fmt(addedVolume, 2)} м3, свободно только ${fmt(freeVolume, 2)} м3.`,
      });
    }

    totalWater += Number.isFinite(result.waterVolume) ? result.waterVolume : 0;
    totalReagent += Number.isFinite(result.reagentKg) ? result.reagentKg : 0;

    return renderResultCard(
      tank.name,
      `Исходно ${fmt(tank.volume, 2)} м3, плотность с поправкой ${fmt(correctedDensity, 3)} г/см3`,
      result,
      [["Свободный объем", `${fmt(freeVolume, 2)} м3`]],
    );
  });

  if (totalReagent > params.reagentLimit) {
    warnings.push({
      level: "danger",
      text: `Требуется ${fmt(totalReagent, 0)} кг реагента, доступно ${fmt(params.reagentLimit, 0)} кг.`,
    });
  }

  els.resultSubtitle.textContent = `Итого: вода ${fmt(totalWater, 2)} м3, реагент ${fmt(totalReagent, 0)} кг.`;
  showWarnings(warnings);
  els.results.innerHTML = cards.join("");
}

function calculateBatch() {
  const params = readParams();
  const warnings = [];
  const selected = state.tanks
    .map((tank) => ({
      tank,
      take: Math.min(num(state.allocations[tank.id], 0), tank.volume),
    }))
    .filter((item) => item.take > 0);

  const volume = selected.reduce((sum, item) => sum + item.take, 0);
  const mass = selected.reduce((sum, item) => {
    const rho = densityAtReference(item.tank, params);
    return sum + item.take * rho;
  }, 0);
  const density = volume > 0 ? mass / volume : 0;
  const result = calcAdjustment(volume, density, params.targetDensity, params);
  const totalAfterCorrection = result.finalVolume;

  if (volume <= 0) {
    warnings.push({ level: "danger", text: "Укажите отбор хотя бы из одной емкости." });
  }

  if (params.targetVolume > 0 && Math.abs(totalAfterCorrection - params.targetVolume) > 0.5) {
    warnings.push({
      level: "warn",
      text: `После корректировки получится ${fmt(totalAfterCorrection, 2)} м3. Для точного объема ${fmt(params.targetVolume, 2)} м3 измените отбор из емкостей.`,
    });
  }

  if (result.reagentKg > params.reagentLimit) {
    warnings.push({
      level: "danger",
      text: `Требуется ${fmt(result.reagentKg, 0)} кг реагента, доступно ${fmt(params.reagentLimit, 0)} кг.`,
    });
  }

  const composition = selected
    .map((item) => `${item.tank.name}: ${fmt(item.take, 2)} м3`)
    .join("; ");

  els.resultSubtitle.textContent = `Смесь до корректировки: ${fmt(volume, 2)} м3 при ${fmt(density, 3)} г/см3.`;
  showWarnings(warnings);
  els.results.innerHTML = renderResultCard(
    "Расчетная партия",
    composition || "Отбор не задан",
    result,
    [
      ["Объем до коррекции", `${fmt(volume, 2)} м3`],
      ["Плотность смеси", `${fmt(density, 3)} г/см3`],
    ],
  );
}

function calculate() {
  renderHeader();
  if (state.tanks.length === 0) {
    els.resultSubtitle.textContent = "Добавьте емкости или загрузите пример.";
    showWarnings([]);
    els.results.innerHTML = "";
    return;
  }

  if (state.mode === "batch") {
    calculateBatch();
  } else {
    calculateTanks();
  }
}

els.addTankBtn.addEventListener("click", () => addTank({ capacity: 50 }));
els.loadExampleBtn.addEventListener("click", loadExample);
els.calculateBtn.addEventListener("click", calculate);
els.printBtn.addEventListener("click", () => window.print());
els.modeTanksBtn.addEventListener("click", () => setMode("tanks"));
els.modeBatchBtn.addEventListener("click", () => setMode("batch"));
els.autoAllocateBtn.addEventListener("click", autoAllocate);

document.addEventListener("input", (event) => {
  const target = event.target;
  if (target.matches("[data-id][data-key]")) {
    updateTank(target.dataset.id, target.dataset.key, target.value);
  }

  if (target.matches("[data-allocation]")) {
    state.allocations[target.dataset.allocation] = num(target.value, 0);
  }

  if (target.closest(".settings-panel") || target.closest(".scenario-controls")) {
    renderHeader();
  }
});

document.addEventListener("click", (event) => {
  const removeId = event.target.dataset.remove;
  if (removeId) removeTank(removeId);
});

loadExample();
