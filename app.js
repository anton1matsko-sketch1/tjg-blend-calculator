const state = {
  mode: "tanks",
  tanks: [],
  allocations: {},
  workPlanTouched: false,
};

const els = {
  tankRows: document.querySelector("#tankRows"),
  headerSummary: document.querySelector("#headerSummary"),
  addTankBtn: document.querySelector("#addTankBtn"),
  loadExampleBtn: document.querySelector("#loadExampleBtn"),
  calculateBtn: document.querySelector("#calculateBtn"),
  printBtn: document.querySelector("#printBtn"),
  exportReportBtn: document.querySelector("#exportReportBtn"),
  engineerRecommendations: document.querySelector("#engineerRecommendations"),
  reportProduct: document.querySelector("#reportProduct"),
  reportWell: document.querySelector("#reportWell"),
  reportCustomer: document.querySelector("#reportCustomer"),
  reportDate: document.querySelector("#reportDate"),
  engineerName: document.querySelector("#engineerName"),
  controlReserve: document.querySelector("#controlReserve"),
  useWeighting: document.querySelector("#useWeighting"),
  weightingFields: document.querySelector("#weightingFields"),
  waterStepVolume: document.querySelector("#waterStepVolume"),
  dilutionPlanRows: document.querySelector("#dilutionPlanRows"),
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
    waterStepVolume: num(els.waterStepVolume.value, 0.5),
    controlReserve: num(els.controlReserve.value, 0.3),
    useWeighting: Boolean(els.useWeighting.checked),
    reportProduct: els.reportProduct.value.trim() || "SWK-1.8",
    reportWell: els.reportWell.value.trim() || "объект",
    reportCustomer: els.reportCustomer.value.trim() || "заказчик",
    reportDate: els.reportDate.value,
    engineerName: els.engineerName.value.trim() || "Мацко А.В.",
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
  if (key === "volume" || key === "capacity") updateFreeVolumeCell(tank);
  renderHeader();
  renderAllocator();
}

function freeVolumeState(tank) {
  const rawFree = tank.capacity - tank.volume;
  return {
    value: Math.max(rawFree, 0),
    overflow: rawFree < 0,
  };
}

function updateFreeVolumeCell(tank) {
  const cell = document.querySelector(`[data-free="${tank.id}"]`);
  if (!cell) return;
  const free = freeVolumeState(tank);
  cell.textContent = `${fmt(free.value, 2)} м3`;
  cell.classList.toggle("is-overflow", free.overflow);
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
      const free = freeVolumeState(tank);
      return `
        <tr>
          <td><input value="${tank.name}" data-id="${tank.id}" data-key="name" aria-label="Название емкости" /></td>
          <td><input type="number" min="0" step="0.1" value="${tank.volume}" data-id="${tank.id}" data-key="volume" aria-label="Объем" /></td>
          <td><input type="number" min="0" step="0.001" value="${tank.density}" data-id="${tank.id}" data-key="density" aria-label="Плотность" /></td>
          <td><input type="number" step="1" value="${tank.temperature}" data-id="${tank.id}" data-key="temperature" aria-label="Температура" /></td>
          <td><input type="number" min="0" step="0.1" value="${tank.capacity}" data-id="${tank.id}" data-key="capacity" aria-label="Максимальный объем" /></td>
          <td class="free-volume ${free.overflow ? "is-overflow" : ""}" data-free="${tank.id}">${fmt(free.value, 2)} м3</td>
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
  renderDilutionPlan();
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
  renderDilutionPlan();
  updateGeneratedWorkPlan();
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

function getTankReportRows(params) {
  return state.tanks.map((tank) => {
    const free = freeVolumeState(tank);
    return {
      name: tank.name,
      volume: tank.volume,
      density: densityAtReference(tank, params),
      sourceDensity: tank.density,
      temperature: tank.temperature,
      capacity: tank.capacity,
      free: free.value,
      overflow: free.overflow,
    };
  });
}

function getReportVolumes(params) {
  const totalVolume = state.tanks.reduce((sum, tank) => sum + tank.volume, 0);
  const selectedVolume = Object.values(state.allocations).reduce((sum, value) => sum + num(value, 0), 0);
  return {
    totalVolume,
    effectiveVolume: state.mode === "batch" ? selectedVolume : totalVolume,
  };
}

function densityKg(valueGcm3) {
  return valueGcm3 * 1000;
}

function fmtKgDensity(valueGcm3, digits = 0) {
  return fmt(densityKg(valueGcm3), digits);
}

function targetGaugeDensityAtTemp(params, temperature) {
  return params.targetDensity - params.tempCoeff * (temperature - params.referenceTemp);
}

function calculateDrainForFreeVolume(volume, density, target, waterDensity, requiredWater, capacity) {
  const currentFree = capacity - volume;
  if (currentFree >= requiredWater) return 0;
  const denominator = target - waterDensity;
  if (denominator <= 0 || density <= target) return Math.max(requiredWater - currentFree, 0);

  const targetWaterAfterDrain = (volume * (density - target)) / denominator;
  const slope = (density - waterDensity) / denominator;
  const requiredDrain = (targetWaterAfterDrain - (capacity - volume)) / slope;
  return Math.max(requiredDrain, 0);
}

function getPerTankReportCalculations(params) {
  return state.tanks.map((tank, index) => {
    const correctedDensity = densityAtReference(tank, params);
    const free = freeVolumeState(tank);
    const common = {
      index: index + 1,
      name: tank.name,
      volume: tank.volume,
      temperature: tank.temperature,
      sourceDensity: tank.density,
      correctedDensity,
      capacity: tank.capacity,
      free: free.value,
    };

    if (params.useWeighting && correctedDensity < params.targetDensity) {
      const result = calcAdjustment(tank.volume, correctedDensity, params.targetDensity, params);
      return {
        ...common,
        mode: "weighting",
        reagentVolume: result.reagentVolume,
        reagentKg: result.reagentKg,
        bags: result.reagentKg / Math.max(params.bagSize, 1),
        finalVolume: result.finalVolume,
        finalDensity: result.finalDensity,
        freeAfter: Math.max(tank.capacity - result.finalVolume, 0),
      };
    }

    const calculatedWater = correctedDensity > params.targetDensity
      ? tank.volume * (correctedDensity - params.targetDensity) / (params.targetDensity - params.waterDensity)
      : 0;
    const controlReserve = Math.min(params.controlReserve, calculatedWater);
    const waterToAdd = Math.max(calculatedWater - controlReserve, 0);
    const drainVolume = calculateDrainForFreeVolume(
      tank.volume,
      correctedDensity,
      params.targetDensity,
      params.waterDensity,
      waterToAdd,
      tank.capacity,
    );
    const workingVolume = Math.max(tank.volume - drainVolume, 0);
    const workingMass = workingVolume * correctedDensity;
    const densityBeforeFinal = waterToAdd > 0
      ? (workingMass + waterToAdd * params.waterDensity) / (workingVolume + waterToAdd)
      : correctedDensity;
    const finalVolume = workingVolume + waterToAdd;

    return {
      ...common,
      mode: "dilution",
      calculatedWater,
      controlReserve,
      waterToAdd,
      drainVolume,
      finalVolume,
      freeAfter: Math.max(tank.capacity - finalVolume, 0),
      densityBeforeFinal,
    };
  });
}

function reportOperationType(params, rows) {
  if (params.useWeighting || rows.some((row) => row.mode === "weighting")) return "weighting";
  return "dilution";
}

function generateWorkPlanText(params, rows) {
  const operation = reportOperationType(params, rows);

  if (operation === "weighting") {
    const lines = [
      "1. Проверить фактический объем, температуру и плотность раствора в каждой емкости перед вводом сухого реагента.",
      "2. Вводить сухой реагент порционно при включенном перемешивании/рециркуляции, не допуская локального пересыщения и осадкообразования.",
      "3. После ввода основной расчетной массы реагента выполнить перемешивание до стабилизации плотности.",
      "4. Замерить плотность и температуру раствора в каждой емкости, привести показания к расчетной температуре и передать данные инженеру-технологу ООО «Вэл Инжиниринг».",
      "5. Финальную корректировку выполнять малыми порциями реагента только после подтверждения промежуточного замера.",
      "6. Зафиксировать финальные V, T, ρ@T и ρ@20 по каждой емкости в исполнительной документации.",
    ];
    return lines.join("\n");
  }

  const drainRows = rows.filter((row) => row.drainVolume > 0.0001);
  const waterList = rows
    .filter((row) => row.waterToAdd > 0.0001)
    .map((row) => `${row.name} — ${fmt(row.waterToAdd, 2)} м3`)
    .join("; ");
  const drainText = drainRows.length
    ? `1. Предварительно освободить объем в емкостях: ${drainRows.map((row) => `${row.name} — слить ${fmt(row.drainVolume, 2)} м3`).join("; ")}. Слитый раствор сохранить в рабочем объеме поставки и потерями не считать.`
    : "1. Проверить фактический свободный объем в каждой емкости перед началом разбавления.";

  return [
    drainText,
    `2. Долить пресную воду (ρ≈${fmt(densityKg(params.waterDensity), 0)} кг/м3): ${waterList || "долив не требуется"}. Доливать порционно при включенном перемешивании/рециркуляции.`,
    "3. После основного долива замерить плотность и температуру раствора в каждой емкости и довести данные до инженера-технолога ООО «Вэл Инжиниринг».",
    `4. Привести замер к ${fmt(params.referenceTemp, 0)} °C по принятой поправке ρ@20 = ρизм + ${fmt(densityKg(params.tempCoeff), 2)}·(T − ${fmt(params.referenceTemp, 0)}). Приемка по целевой плотности ${fmtKgDensity(params.targetDensity, 0)} кг/м3.`,
    `5. Если плотность выше ${fmtKgDensity(params.targetDensity, 0)} кг/м3, долить остаток воды из резерва малыми порциями по 50-100 л с замером после каждой порции.`,
    "6. Зафиксировать финальные V, T, ρ@T и ρ@20 по каждой емкости в исполнительной документации.",
  ].join("\n");
}

function updateGeneratedWorkPlan(force = false) {
  if (state.workPlanTouched && !force) return;
  const params = readParams();
  const rows = getPerTankReportCalculations(params);
  els.engineerRecommendations.value = generateWorkPlanText(params, rows);
}

function getDilutionBase(params) {
  const selected = state.tanks
    .map((tank) => ({
      tank,
      take: Math.min(num(state.allocations[tank.id], 0), tank.volume),
    }))
    .filter((item) => item.take > 0);
  const source = state.mode === "batch" && selected.length > 0
    ? selected
    : state.tanks.map((tank) => ({ tank, take: tank.volume }));
  const volume = source.reduce((sum, item) => sum + item.take, 0);
  const mass = source.reduce((sum, item) => sum + item.take * densityAtReference(item.tank, params), 0);

  return {
    volume,
    mass,
    density: volume > 0 ? mass / volume : 0,
  };
}

function buildDilutionPlanRows(params) {
  const base = getDilutionBase(params);
  const rows = [];
  const target = params.targetDensity;
  const waterDensity = params.waterDensity;
  const step = params.waterStepVolume;

  if (base.volume <= 0 || step <= 0 || target <= waterDensity || base.density <= target) {
    return { base, rows };
  }

  let cumulativeWater = 0;
  let currentVolume = base.volume;
  let currentMass = base.mass;
  const maxSteps = 500;

  for (let index = 1; index <= maxSteps; index += 1) {
    const currentDensity = currentMass / currentVolume;
    const exactWaterToTarget = currentVolume * (currentDensity - target) / (target - waterDensity);
    const stepWater = Math.min(step, exactWaterToTarget);
    cumulativeWater += stepWater;
    currentMass += stepWater * waterDensity;
    currentVolume += stepWater;

    const densityAfterStep = currentMass / currentVolume;
    const remainingWater = densityAfterStep > target
      ? currentVolume * (densityAfterStep - target) / (target - waterDensity)
      : 0;
    const reachedTarget = densityAfterStep <= target + 0.0005;
    const nextStepIsLast = !reachedTarget && remainingWater <= step + 0.000001;

    rows.push({
      stepNumber: index,
      stepWater,
      cumulativeWater,
      density: Math.max(densityAfterStep, target),
      status: reachedTarget
        ? "🔴 Стоп — целевая плотность достигнута"
        : nextStepIsLast
          ? "🟡 Следующий шаг — последний, контролировать дробно"
          : "🟢 Норма",
      tone: reachedTarget ? "target" : nextStepIsLast ? "near" : "normal",
    });

    if (reachedTarget) break;
  }

  return { base, rows };
}

function renderDilutionPlan() {
  const params = readParams();
  const { base, rows } = buildDilutionPlanRows(params);

  if (base.volume <= 0) {
    els.dilutionPlanRows.innerHTML = `
      <tr><td colspan="5" class="empty-row">Добавьте объем раствора для построения плана.</td></tr>
    `;
    return;
  }

  if (params.waterStepVolume <= 0) {
    els.dilutionPlanRows.innerHTML = `
      <tr><td colspan="5" class="empty-row">Укажите положительный шаг добавления воды.</td></tr>
    `;
    return;
  }

  if (params.targetDensity <= params.waterDensity) {
    els.dilutionPlanRows.innerHTML = `
      <tr><td colspan="5" class="empty-row">Целевая плотность должна быть выше плотности воды.</td></tr>
    `;
    return;
  }

  if (base.density <= params.targetDensity) {
    els.dilutionPlanRows.innerHTML = `
      <tr><td colspan="5" class="empty-row">Текущая плотность ${fmt(base.density, 3)} г/см3 не выше целевой. Разбавление водой не требуется.</td></tr>
    `;
    return;
  }

  els.dilutionPlanRows.innerHTML = rows
    .map(
      (row) => `
        <tr class="dilution-row-${row.tone}">
          <td>${row.stepNumber}</td>
          <td>${fmt(row.stepWater, 2)}</td>
          <td>${fmt(row.cumulativeWater, 2)}</td>
          <td>${fmt(row.density, 3)}</td>
          <td>${row.status}</td>
        </tr>
      `,
    )
    .join("");
}

function makeLogoMarkup() {
  return `
    <div class="report-logo">
      <img src="assets/wellpro-logo.png" alt="WELLPRO" />
    </div>
  `;
}

function buildReportHtml() {
  const params = readParams();
  const rows = getTankReportRows(params);
  const volumes = getReportVolumes(params);
  const now = new Date();
  const date = now.toLocaleDateString("ru-RU");
  const fileDate = now.toISOString().slice(0, 10);
  const recommendations = els.engineerRecommendations.value.trim();
  const reportFooter = `
    <footer>
      <div class="report-rule"></div>
      <p>
        Внимание! Информация в отчете сформирована на основе введенных исходных данных и инженерных расчетов.
        Ответственность за проверку исходных данных, условий применения и финальных технологических решений
        несет пользователь отчета.
      </p>
    </footer>
  `;
  const reportHeader = `
    <header class="report-top">
      <div>
        <p class="report-company">ООО Вэл Инжиниринг</p>
        <p class="report-date">Дата формирования: ${date}</p>
      </div>
      ${makeLogoMarkup()}
    </header>
  `;

  return {
    fileName: `rekomendatsii-tjg-${fileDate}.pdf`,
    html: `
      <article class="report-export">
        <section class="report-page report-cover">
          ${reportHeader}
          <div class="report-hero">
            <h1>Рекомендации по корректировке плотности ТЖГ</h1>
            <div class="report-rule"></div>
          </div>
          ${reportFooter}
        </section>

        <section class="report-page">
          ${reportHeader}
          <div class="report-section">
            <h2>Исходные данные</h2>
            <table>
              <thead>
                <tr>
                  <th>Емкость</th>
                  <th>Объем, м3</th>
                  <th>Плотность, г/см3</th>
                  <th>Темп., °C</th>
                  <th>Макс. объем, м3</th>
                  <th>Свободно, м3</th>
                </tr>
              </thead>
              <tbody>
                ${rows
                  .map(
                    (row) => `
                      <tr>
                        <td>${escapeHtml(row.name)}</td>
                        <td>${fmt(row.volume, 2)}</td>
                        <td>${fmt(row.sourceDensity, 3)}</td>
                        <td>${fmt(row.temperature, 0)}</td>
                        <td>${fmt(row.capacity, 2)}</td>
                        <td class="${row.overflow ? "report-danger" : ""}">${fmt(row.free, 2)}</td>
                      </tr>
                    `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
          ${reportFooter}
        </section>

        <section class="report-page">
          ${reportHeader}
          <div class="report-section">
            <h2>Расчетные параметры</h2>
            <div class="report-params">
              <div><span>Целевая плотность</span><strong>${fmt(params.targetDensity, 3)} г/см3</strong></div>
              <div><span>Эффективный объем</span><strong>${fmt(volumes.effectiveVolume, 2)} м3</strong></div>
              <div><span>Доступный объем</span><strong>${fmt(volumes.totalVolume, 2)} м3</strong></div>
              <div><span>Эффективная плотность реагента</span><strong>${fmt(params.reagentDensity, 2)} г/см3</strong></div>
              <div><span>Доступно реагента</span><strong>${fmt(params.reagentLimit, 0)} кг</strong></div>
              <div><span>Фасовка</span><strong>${fmt(params.bagSize, 0)} кг</strong></div>
              <div><span>Подача насоса</span><strong>${fmt(params.waterRate, 1)} л/с</strong></div>
              <div><span>Приведение к температуре</span><strong>${fmt(params.referenceTemp, 0)} °C</strong></div>
            </div>
          </div>
          ${reportFooter}
        </section>

        <section class="report-page">
          ${reportHeader}
          <div class="report-section">
            <h2>Рекомендации инженера-технолога</h2>
            <div class="report-recommendations">
              ${recommendations ? escapeHtml(recommendations).replaceAll("\\n", "<br />") : "&nbsp;"}
            </div>
          </div>

          <div class="report-signature">
            <p>Инженер-технолог ООО «Вэл Инжиниринг»</p>
            <div class="signature-grid">
              <div><span></span><label>подпись</label></div>
              <div><span></span><label>ФИО</label></div>
              <div><span>${date}</span><label>дата</label></div>
            </div>
          </div>
          ${reportFooter}
        </section>
      </article>
    `,
  };
}

function fallbackPrintReport(report) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(`
    <!doctype html>
    <html lang="ru">
      <head>
        <meta charset="UTF-8" />
        <title>Отчет</title>
        <link rel="stylesheet" href="styles.css" />
      </head>
      <body class="report-print-body">${report.html}</body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function loadScriptOnce(src, id) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-loader-id="${id}"]`)) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.dataset.loaderId = id;
    script.addEventListener("load", resolve);
    script.addEventListener("error", reject);
    document.head.appendChild(script);
  });
}

async function loadPdfLibraries() {
  if (!window.html2canvas) {
    await loadScriptOnce("assets/html2canvas.min.js", "html2canvas");
  }
  if (!window.jspdf?.jsPDF) {
    await loadScriptOnce("assets/jspdf.umd.min.js", "jspdf");
  }
  return Boolean(window.html2canvas && window.jspdf?.jsPDF);
}

async function exportReportPdf() {
  calculate();
  const report = buildReportHtml();
  const wrapper = document.createElement("div");
  wrapper.className = "report-export-host";
  wrapper.innerHTML = report.html;
  document.body.appendChild(wrapper);

  try {
    const librariesReady = await loadPdfLibraries();
    if (!librariesReady) {
      fallbackPrintReport(report);
      return;
    }

    if (document.fonts?.ready) await document.fonts.ready;

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      unit: "mm",
      format: "a4",
      orientation: "portrait",
      compress: true,
    });
    const pages = [...wrapper.querySelectorAll(".report-page")];

    for (const [index, page] of pages.entries()) {
      const canvas = await window.html2canvas(page, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        windowWidth: page.scrollWidth,
        windowHeight: page.scrollHeight,
      });
      const image = canvas.toDataURL("image/jpeg", 0.98);
      if (index > 0) pdf.addPage("a4", "portrait");
      pdf.addImage(image, "JPEG", 0, 0, 210, 297, undefined, "FAST");
    }

    pdf.save(report.fileName);
  } finally {
    wrapper.remove();
  }
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function docTextRuns(text, bold = false) {
  return String(text)
    .split("\n")
    .map((line, index) => {
      const br = index === 0 ? "" : "<w:br/>";
      return `${br}<w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r>`;
    })
    .join("");
}

function docParagraph(text, options = {}) {
  const style = options.style ? `<w:pStyle w:val="${options.style}"/>` : "";
  const jc = options.align ? `<w:jc w:val="${options.align}"/>` : "";
  const spacing = `<w:spacing w:before="${options.before ?? 0}" w:after="${options.after ?? 120}" w:line="276" w:lineRule="auto"/>`;
  const indent = options.indent ? `<w:ind w:firstLine="${options.indent}"/>` : "";
  return `<w:p><w:pPr>${style}${jc}${spacing}${indent}</w:pPr>${docTextRuns(text, options.bold)}</w:p>`;
}

function docLogoParagraph() {
  return `
    <w:p>
      <w:pPr><w:spacing w:after="260"/><w:jc w:val="left"/></w:pPr>
      <w:r>
        <w:drawing>
          <wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
            <wp:extent cx="3100000" cy="760000"/>
            <wp:docPr id="1" name="Well Engineering"/>
            <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:nvPicPr><pic:cNvPr id="0" name="well-engineering-logo.png"/><pic:cNvPicPr/></pic:nvPicPr>
                  <pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
                  <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="3100000" cy="760000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
  `;
}

function docCell(content, options = {}) {
  const width = options.width ? `<w:tcW w:w="${options.width}" w:type="dxa"/>` : "";
  const fill = options.fill ? `<w:shd w:fill="${options.fill}"/>` : "";
  const vAlign = "<w:vAlign w:val=\"center\"/>";
  const paragraphs = Array.isArray(content)
    ? content.join("")
    : `<w:p><w:pPr><w:spacing w:after="0"/><w:jc w:val="${options.align || "center"}"/></w:pPr><w:r><w:rPr>${options.bold ? "<w:b/>" : ""}<w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${xmlEscape(content)}</w:t></w:r></w:p>`;
  return `<w:tc><w:tcPr>${width}${fill}${vAlign}</w:tcPr>${paragraphs}</w:tc>`;
}

function docTable(rows, options = {}) {
  const widths = options.widths || [];
  const headerFill = options.headerFill || "BDD7EE";
  const tableRows = rows
    .map((row, rowIndex) => {
      const isHeader = rowIndex === 0 && options.header !== false;
      const cells = row
        .map((cell, cellIndex) => {
          const value = typeof cell === "object" && cell !== null ? cell.value : cell;
          const cellOptions = typeof cell === "object" && cell !== null ? cell : {};
          return docCell(String(value ?? ""), {
            width: widths[cellIndex],
            fill: isHeader ? headerFill : cellOptions.fill,
            bold: isHeader || cellOptions.bold,
            align: cellOptions.align || (cellIndex === 0 ? "left" : "center"),
          });
        })
        .join("");
      return `<w:tr>${cells}</w:tr>`;
    })
    .join("");
  const grid = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("");
  return `
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="0" w:type="auto"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:color="BFBFBF"/>
          <w:left w:val="single" w:sz="4" w:color="BFBFBF"/>
          <w:bottom w:val="single" w:sz="4" w:color="BFBFBF"/>
          <w:right w:val="single" w:sz="4" w:color="BFBFBF"/>
          <w:insideH w:val="single" w:sz="4" w:color="BFBFBF"/>
          <w:insideV w:val="single" w:sz="4" w:color="BFBFBF"/>
        </w:tblBorders>
        <w:tblCellMar>
          <w:top w:w="90" w:type="dxa"/><w:left w:w="90" w:type="dxa"/>
          <w:bottom w:w="90" w:type="dxa"/><w:right w:w="90" w:type="dxa"/>
        </w:tblCellMar>
      </w:tblPr>
      <w:tblGrid>${grid}</w:tblGrid>
      ${tableRows}
    </w:tbl>
  `;
}

function makeTemperatureTargetRows(params) {
  return [
    ["Температура раствора в емкости, °C", "Целевое показание плотномера, кг/м3"],
    ...[15, 20, 25, 30, 35].map((temperature) => [
      `+${temperature}`,
      temperature === params.referenceTemp
        ? `${fmtKgDensity(params.targetDensity, 0)} (норма)`
        : fmtKgDensity(targetGaugeDensityAtTemp(params, temperature), 0),
    ]),
  ];
}

function makeReportTables(params, rows, operation) {
  const sourceRows = [
    ["№", "Емкость", "V раствора, м3", "T, °C", "ρ@T, кг/м3", `ρ@${fmt(params.referenceTemp, 0)} °C, кг/м3`],
    ...rows.map((row) => [
      row.index,
      row.name,
      fmt(row.volume, 1),
      fmt(row.temperature, 1),
      fmtKgDensity(row.sourceDensity, 0),
      fmtKgDensity(row.correctedDensity, 0),
    ]),
  ];

  const resultRows = operation === "weighting"
    ? [
        ["Емкость", "V раствора, м3", `ρ@${fmt(params.referenceTemp, 0)} °C, кг/м3`, "Реагент, кг", "Мешки", "Объем после, м3", "Свободный объем, м3"],
        ...rows.map((row) => [
          row.name,
          fmt(row.volume, 1),
          fmtKgDensity(row.correctedDensity, 0),
          row.mode === "weighting" ? fmt(row.reagentKg, 0) : "0",
          row.mode === "weighting" ? fmt(row.bags, 2) : "0",
          fmt(row.finalVolume ?? row.volume, 2),
          fmt(row.freeAfter ?? row.free, 2),
        ]),
      ]
    : [
        ["Емкость", "V раствора, м3", `ρ@${fmt(params.referenceTemp, 0)} °C, кг/м3`, "Расчетная вода, м3", "Резерв, м3", "Вода к доливу, м3", "Слив, м3", "Объем после, м3", "Свободно, м3", `Ожидаемая ρ@${fmt(params.referenceTemp, 0)}, кг/м3`],
        ...rows.map((row) => [
          row.name,
          fmt(row.volume, 1),
          fmtKgDensity(row.correctedDensity, 0),
          fmt(row.calculatedWater, 2),
          fmt(row.controlReserve, 2),
          { value: fmt(row.waterToAdd, 2), fill: "E2F0D9", bold: true },
          row.drainVolume > 0 ? { value: fmt(row.drainVolume, 2), fill: "FFF2CC", bold: true } : "0,00",
          fmt(row.finalVolume, 2),
          fmt(row.freeAfter, 2),
          `~${fmtKgDensity(row.densityBeforeFinal, 0)}`,
        ]),
      ];

  return { sourceRows, resultRows };
}

function buildDocxDocumentXml(params, rows) {
  const operation = reportOperationType(params, rows);
  const date = params.reportDate
    ? new Date(`${params.reportDate}T00:00:00`).toLocaleDateString("ru-RU")
    : new Date().toLocaleDateString("ru-RU");
  const targetKg = fmtKgDensity(params.targetDensity, 0);
  const { sourceRows, resultRows } = makeReportTables(params, rows, operation);
  const workPlan = els.engineerRecommendations.value.trim() || generateWorkPlanText(params, rows);
  const densityIntro = rows.length
    ? `с ${fmtKgDensity(rows[0].correctedDensity, 0)} до ${targetKg} кг/м3`
    : `до ${targetKg} кг/м3`;
  const methodText = operation === "weighting"
    ? `Модель — волюметрически-аддитивная: при вводе сухого реагента растут масса и расчетный объем раствора. Эффективная плотность реагента принята ${fmt(params.reagentDensity, 2)} г/см3.`
    : `Модель — волюметрически-аддитивная: при доливе воды количество соли в растворе не меняется — растет только объем, а плотность падает. Объем воды для снижения плотности считается по формуле: V_воды = V · (ρ@${fmt(params.referenceTemp, 0)} − ${targetKg}) / (${targetKg} − ${fmtKgDensity(params.waterDensity, 0)}).`;

  const body = [
    docLogoParagraph(),
    docParagraph(`РЕКОМЕНДАЦИИ ПО ПРИГОТОВЛЕНИЮ РАБОЧЕГО РАСТВОРА\nПЛОТНОСТЬЮ ${targetKg} кг/м3`, { style: "Title", align: "center", bold: true, after: 120 }),
    docParagraph(`из поставленного концентрата ${params.reportProduct} (${params.reportWell})`, { style: "Subtitle", align: "center", bold: true, after: 40 }),
    docParagraph(`в адрес ${params.reportCustomer} · инженерное сопровождение поставки · ${date} г.`, { style: "Italic", align: "center", after: 260 }),
    docParagraph("1. Цель", { style: "Heading1" }),
    docParagraph(`${operation === "weighting" ? "Определить массу сухого реагента для повышения плотности" : "Определить объем пресной воды для снижения плотности"} рабочего раствора ${params.reportProduct} ${densityIntro} (при ${fmt(params.referenceTemp, 0)} °C) по каждой емкости с учетом свободного объема.`, { indent: 720 }),
    docParagraph("2. Исходные данные", { style: "Heading1" }),
    docParagraph(`Исходные данные введены пользователем в калькуляторе. Замеры плотности приведены к ${fmt(params.referenceTemp, 0)} °C по принятой поправке ρ@20 = ρизм + ${fmt(densityKg(params.tempCoeff), 2)}·(T − ${fmt(params.referenceTemp, 0)}). Коэффициент является расчетным и должен уточняться для конкретного солевого состава при наличии лабораторной температурной кривой.`, { indent: 720 }),
    docTable(sourceRows, { widths: [520, 2050, 1660, 1060, 1440, 1660] }),
    docParagraph("3. Методика расчета", { style: "Heading1", before: 180 }),
    docParagraph(methodText, { indent: 720 }),
    docParagraph("4. Результат по емкостям", { style: "Heading1", before: 180 }),
    docTable(resultRows, { widths: operation === "weighting" ? [2050, 1350, 1500, 1250, 950, 1250, 1200] : [1200, 850, 1000, 900, 780, 900, 730, 900, 850, 950] }),
    operation === "dilution"
      ? docParagraph(`Долив выполняется на ${fmt(params.controlReserve, 2)} м3 меньше расчетного по каждой емкости, где это возможно. Это резерв на финальный контроль и защита от переразбавления. Слитый раствор при необходимости освобождения объема сохраняется в рабочем объеме поставки и потерями не является.`, { before: 120 })
      : docParagraph("Ввод реагента выполнять порционно с обязательным перемешиванием и промежуточным контролем плотности.", { before: 120 }),
    docParagraph("5. Порядок работ и точки контроля", { style: "Heading1", before: 180 }),
    ...workPlan.split("\n").filter(Boolean).map((line) => docParagraph(line, { before: 40, after: 80 })),
    docParagraph("Целевое показание плотномера при фактической температуре раствора:", { before: 140 }),
    docTable(makeTemperatureTargetRows(params), { widths: [4200, 4200] }),
    docParagraph("6. Зона ответственности и примечания", { style: "Heading1", before: 180 }),
    docParagraph(`Слитый раствор сохраняется в рабочем объеме поставки ${params.reportProduct} и потерями не является.`),
    docParagraph(`${operation === "weighting" ? "Утяжеление" : "Разбавление"} до ${targetKg} кг/м3 выполняется силами ${params.reportCustomer} на объекте.`),
    docParagraph(`Любую дальнейшую корректировку плотности выполнять только после согласования с инженером-технологом ООО «Вэл Инжиниринг».`),
    docParagraph(`Инженерное сопровождение носит рекомендательный характер; конечная ответственность за результат операции — на ${params.reportCustomer} в рамках договора.`),
    docParagraph("", { before: 420 }),
    docTable([
      [
        { value: "Инженер-технолог\nООО «Вэл Инжиниринг»", bold: true, align: "left" },
        { value: params.engineerName, bold: true, align: "right" },
      ],
    ], { header: false, widths: [4200, 4200] }),
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
      xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
      xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
      <w:body>
        ${body}
        <w:sectPr>
          <w:pgSz w:w="11906" w:h="16838"/>
          <w:pgMar w:top="850" w:right="1134" w:bottom="850" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>
        </w:sectPr>
      </w:body>
    </w:document>`;
}

function buildDocxStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
        <w:name w:val="Normal"/>
        <w:qFormat/>
        <w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr>
        <w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>
      </w:style>
      <w:style w:type="paragraph" w:styleId="Title">
        <w:name w:val="Title"/>
        <w:basedOn w:val="Normal"/>
        <w:qFormat/>
        <w:pPr><w:spacing w:before="120" w:after="80"/><w:jc w:val="center"/></w:pPr>
        <w:rPr><w:b/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="32"/></w:rPr>
      </w:style>
      <w:style w:type="paragraph" w:styleId="Subtitle">
        <w:name w:val="Subtitle"/>
        <w:basedOn w:val="Normal"/>
        <w:qFormat/>
        <w:pPr><w:spacing w:after="40"/><w:jc w:val="center"/></w:pPr>
        <w:rPr><w:b/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="28"/></w:rPr>
      </w:style>
      <w:style w:type="paragraph" w:styleId="Italic">
        <w:name w:val="Italic"/>
        <w:basedOn w:val="Normal"/>
        <w:pPr><w:spacing w:after="120"/><w:jc w:val="center"/></w:pPr>
        <w:rPr><w:i/><w:sz w:val="24"/></w:rPr>
      </w:style>
      <w:style w:type="paragraph" w:styleId="Heading1">
        <w:name w:val="heading 1"/>
        <w:basedOn w:val="Normal"/>
        <w:qFormat/>
        <w:pPr><w:keepNext/><w:spacing w:before="220" w:after="120"/></w:pPr>
        <w:rPr><w:b/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="30"/></w:rPr>
      </w:style>
    </w:styles>`;
}

function buildDocxPackageXml() {
  return {
    contentTypes: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Default Extension="png" ContentType="image/png"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
        <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
        <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
      </Types>`,
    packageRels: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
      </Relationships>`,
    documentRels: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
        <Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/well-engineering-logo.png"/>
      </Relationships>`,
    settings: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:zoom w:percent="100"/>
      </w:settings>`,
  };
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
}

const crcTable = makeCrcTable();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function utf8Bytes(value) {
  return new TextEncoder().encode(value);
}

function u16(value) {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function u32(value) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = Math.max(date.getFullYear() - 1980, 0);
  return { time, date: (year << 9) | (month << 5) | day };
}

function buildZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const stamp = dosDateTime();

  for (const file of files) {
    const nameBytes = utf8Bytes(file.name);
    const data = file.data instanceof Uint8Array ? file.data : utf8Bytes(file.data);
    const crc = crc32(data);
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(stamp.time), ...u16(stamp.date),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0),
      ...nameBytes,
    ]);
    chunks.push(local, data);
    central.push(new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(stamp.time), ...u16(stamp.date),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nameBytes,
    ]));
    offset += local.length + data.length;
  }

  const centralOffset = offset;
  for (const item of central) {
    chunks.push(item);
    offset += item.length;
  }
  chunks.push(new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(offset - centralOffset), ...u32(centralOffset), ...u16(0),
  ]));

  return new Blob(chunks, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

async function buildDocxBlob(params, rows) {
  const packageXml = buildDocxPackageXml();
  const logoBytes = new Uint8Array(await (await fetch("assets/well-engineering-logo.png")).arrayBuffer());
  return buildZip([
    { name: "[Content_Types].xml", data: packageXml.contentTypes },
    { name: "_rels/.rels", data: packageXml.packageRels },
    { name: "word/document.xml", data: buildDocxDocumentXml(params, rows) },
    { name: "word/styles.xml", data: buildDocxStylesXml() },
    { name: "word/settings.xml", data: packageXml.settings },
    { name: "word/_rels/document.xml.rels", data: packageXml.documentRels },
    { name: "word/media/well-engineering-logo.png", data: logoBytes },
  ]);
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportDocxReport() {
  calculate();
  updateGeneratedWorkPlan();
  const params = readParams();
  const rows = getPerTankReportCalculations(params);
  const date = params.reportDate || new Date().toISOString().slice(0, 10);
  const cleanProduct = params.reportProduct.replace(/[^a-zA-Zа-яА-Я0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const cleanTarget = String(Math.round(densityKg(params.targetDensity)));
  const blob = await buildDocxBlob(params, rows);
  downloadBlob(blob, `Рекомендации_${cleanProduct}_${cleanTarget}_${date}.docx`);
}

els.addTankBtn.addEventListener("click", () => addTank({ capacity: 50 }));
els.loadExampleBtn.addEventListener("click", loadExample);
els.calculateBtn.addEventListener("click", calculate);
els.printBtn.addEventListener("click", () => window.print());
els.exportReportBtn.addEventListener("click", exportDocxReport);
els.modeTanksBtn.addEventListener("click", () => setMode("tanks"));
els.modeBatchBtn.addEventListener("click", () => setMode("batch"));
els.autoAllocateBtn.addEventListener("click", autoAllocate);
els.useWeighting.addEventListener("change", () => {
  els.weightingFields.classList.toggle("hidden", !els.useWeighting.checked);
  updateGeneratedWorkPlan();
  calculate();
});
els.engineerRecommendations.addEventListener("input", () => {
  state.workPlanTouched = true;
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (target.matches("[data-id][data-key]")) {
    updateTank(target.dataset.id, target.dataset.key, target.value);
    renderDilutionPlan();
    updateGeneratedWorkPlan();
  }

  if (target.matches("[data-allocation]")) {
    state.allocations[target.dataset.allocation] = num(target.value, 0);
    renderDilutionPlan();
    updateGeneratedWorkPlan();
  }

  if (target.closest(".settings-panel") || target.closest(".scenario-controls")) {
    renderHeader();
    renderDilutionPlan();
    updateGeneratedWorkPlan();
  }

  if (target.closest(".dilution-plan-panel")) {
    renderDilutionPlan();
    updateGeneratedWorkPlan();
  }

  if (target.closest(".report-meta-panel")) {
    updateGeneratedWorkPlan();
  }
});

document.addEventListener("click", (event) => {
  const removeId = event.target.dataset.remove;
  if (removeId) removeTank(removeId);
});

els.reportDate.value = new Date().toISOString().slice(0, 10);
loadExample();
