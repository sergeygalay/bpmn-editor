const modeler = new BpmnJS({
  container: '#canvas',
  keyboard: { bindTo: document }
});

const statusEl = document.getElementById('status');
const modelNameEl = document.getElementById('model-name');
const diagramSelect = document.getElementById('diagram-select');

let diagrams = [];
let currentDiagram = null;
let isLoading = false;
let hasLocalChanges = false;

function setStatus(message) {
  statusEl.textContent = message;
}

function setUrlDiagram(id) {
  const url = new URL(window.location.href);
  url.searchParams.set('diagram', id);
  window.history.replaceState({}, '', url);
}

async function loadDiagram(diagram, { updateUrl = true } = {}) {
  if (!diagram) return;

  isLoading = true;
  hasLocalChanges = false;
  currentDiagram = diagram;
  modelNameEl.textContent = diagram.name;
  diagramSelect.value = diagram.id;
  setStatus(`Загрузка «${diagram.name}» из GitHub…`);

  try {
    const response = await fetch(`${diagram.path}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const xml = await response.text();
    const result = await modeler.importXML(xml);

    if (result.warnings?.length) {
      console.warn('BPMN import warnings:', result.warnings);
    }

    modeler.get('canvas').zoom('fit-viewport');
    if (updateUrl) setUrlDiagram(diagram.id);
    setStatus(`«${diagram.name}» загружена. Можно редактировать BPMN 2.0 элементы прямо на схеме.`);
  } catch (error) {
    console.error(error);
    setStatus(`Не удалось загрузить «${diagram.name}»: ${error.message}`);
  } finally {
    isLoading = false;
  }
}

async function loadCatalog() {
  setStatus('Загрузка списка диаграмм…');

  try {
    const response = await fetch(`diagrams/index.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const catalog = await response.json();
    diagrams = Array.isArray(catalog.diagrams) ? catalog.diagrams : [];
    if (!diagrams.length) throw new Error('список диаграмм пуст');

    diagramSelect.innerHTML = '';
    for (const diagram of diagrams) {
      const option = document.createElement('option');
      option.value = diagram.id;
      option.textContent = diagram.name;
      diagramSelect.appendChild(option);
    }
    diagramSelect.disabled = false;

    const requestedId = new URL(window.location.href).searchParams.get('diagram');
    const initial = diagrams.find(d => d.id === requestedId) || diagrams[0];
    await loadDiagram(initial, { updateUrl: !requestedId || initial.id !== requestedId });
  } catch (error) {
    console.error(error);
    setStatus(`Не удалось загрузить каталог диаграмм: ${error.message}`);
  }
}

function zoomBy(factor) {
  const canvas = modeler.get('canvas');
  const current = canvas.zoom();
  canvas.zoom(Math.max(0.2, Math.min(4, current * factor)));
}

diagramSelect.addEventListener('change', async () => {
  const next = diagrams.find(d => d.id === diagramSelect.value);
  if (!next || next.id === currentDiagram?.id) return;

  if (hasLocalChanges) {
    const ok = window.confirm('Есть локальные несохранённые изменения. Переключить диаграмму и потерять их?');
    if (!ok) {
      diagramSelect.value = currentDiagram.id;
      return;
    }
  }

  await loadDiagram(next);
});

document.getElementById('reload').addEventListener('click', async () => {
  if (!currentDiagram) return;
  if (hasLocalChanges) {
    const ok = window.confirm('Перезагрузить диаграмму из GitHub и потерять локальные изменения?');
    if (!ok) return;
  }
  await loadDiagram(currentDiagram, { updateUrl: false });
});

document.getElementById('fit').addEventListener('click', () => modeler.get('canvas').zoom('fit-viewport'));
document.getElementById('zoom-in').addEventListener('click', () => zoomBy(1.2));
document.getElementById('zoom-out').addEventListener('click', () => zoomBy(1 / 1.2));
document.getElementById('undo').addEventListener('click', () => modeler.get('commandStack').undo());
document.getElementById('redo').addEventListener('click', () => modeler.get('commandStack').redo());

modeler.on('commandStack.changed', () => {
  if (isLoading) return;
  hasLocalChanges = true;
  setStatus(`«${currentDiagram?.name || 'Диаграмма'}»: есть локальные изменения в браузере. Версия ChatGPT хранится в GitHub.`);
});

loadCatalog();
