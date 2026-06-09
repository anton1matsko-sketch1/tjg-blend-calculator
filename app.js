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
  exportReportBtn: document.querySelector("#exportReportBtn"),
  engineerRecommendations: document.querySelector("#engineerRecommendations"),
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

function makeLogoMarkup() {
  return `
    <div class="report-logo">
      <svg viewBox="0 0 80 82" aria-hidden="true">
        <path d="M27 4C20 20 11 34 11 50c0 15 10 25 25 27-8-8-11-17-8-28 3-12 10-25 16-39C38 9 33 6 27 4Z"></path>
        <path d="M53 4C60 20 69 34 69 50c0 15-10 25-25 27 8-8 11-17 8-28-3-12-10-25-16-39 6-1 11-4 17-6Z"></path>
      </svg>
      <span>WELL PRO</span>
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

function loadPdfLibrary() {
  if (window.html2pdf) return Promise.resolve(window.html2pdf);

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-pdf-library="html2pdf"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.html2pdf));
      existing.addEventListener("error", reject);
      return;
    }

    const script = document.createElement("script");
    script.src = "assets/html2pdf.bundle.min.js";
    script.defer = true;
    script.dataset.pdfLibrary = "html2pdf";
    script.addEventListener("load", () => resolve(window.html2pdf));
    script.addEventListener("error", reject);
    document.head.appendChild(script);
  });
}

async function exportReportPdf() {
  calculate();
  const report = buildReportHtml();
  const wrapper = document.createElement("div");
  wrapper.className = "report-export-host";
  wrapper.innerHTML = report.html;
  document.body.appendChild(wrapper);

  try {
    const pdfLibrary = await loadPdfLibrary();
    if (!pdfLibrary) {
      fallbackPrintReport(report);
      return;
    }

    await pdfLibrary()
      .set({
        margin: 0,
        filename: report.fileName,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css"] },
      })
      .from(wrapper.querySelector(".report-export"))
      .save();
  } finally {
    wrapper.remove();
  }
}

els.addTankBtn.addEventListener("click", () => addTank({ capacity: 50 }));
els.loadExampleBtn.addEventListener("click", loadExample);
els.calculateBtn.addEventListener("click", calculate);
els.printBtn.addEventListener("click", () => window.print());
els.exportReportBtn.addEventListener("click", exportReportPdf);
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
