const modeler = new BpmnJS({
  container: '#canvas',
  keyboard: { bindTo: document }
});

const statusEl = document.getElementById('status');
const modelNameEl = document.getElementById('model-name');
const modelDescriptionEl = document.getElementById('model-description');
const modelPathEl = document.getElementById('model-path');
const dirtyBadge = document.getElementById('dirty-badge');
const diagramList = document.getElementById('diagram-list');
const diagramCount = document.getElementById('diagram-count');
const diagramSearch = document.getElementById('diagram-search');
const sidebar = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const undoButton = document.getElementById('undo');
const redoButton = document.getElementById('redo');

let diagrams = [];
let currentDiagram = null;
let isLoading = false;
let hasLocalChanges = false;

function setStatus(message) {
  statusEl.textContent = message;
}

function isMobileLayout() {
  return window.matchMedia('(max-width: 900px)').matches;
}

function setSidebarCollapsed(collapsed, { remember = true } = {}) {
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  sidebarBackdrop.hidden = collapsed || !isMobileLayout();
  if (remember && !isMobileLayout()) {
    localStorage.setItem('bpmn-sidebar-collapsed', collapsed ? '1' : '0');
  }
}

function initializeSidebarState() {
  if (isMobileLayout()) {
    setSidebarCollapsed(true, { remember: false });
    return;
  }
  setSidebarCollapsed(localStorage.getItem('bpmn-sidebar-collapsed') === '1', { remember: false });
}

function setDirty(isDirty) {
  hasLocalChanges = isDirty;
  dirtyBadge.hidden = !isDirty;
  document.title = `${isDirty ? '• ' : ''}${currentDiagram?.name || 'BPMN 2.0 Editor'}`;
}

function updateHistoryButtons() {
  const commandStack = modeler.get('commandStack');
  undoButton.disabled = !commandStack.canUndo();
  redoButton.disabled = !commandStack.canRedo();
}

function setUrlDiagram(id) {
  const url = new URL(window.location.href);
  url.searchParams.set('diagram', id);
  window.history.replaceState({}, '', url);
  localStorage.setItem('bpmn-last-diagram', id);
}

function searchableText(diagram) {
  return [diagram.name, diagram.group, diagram.description, diagram.id]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('ru');
}

function renderCatalog(query = '') {
  const normalizedQuery = query.trim().toLocaleLowerCase('ru');
  const filtered = normalizedQuery
    ? diagrams.filter(diagram => searchableText(diagram).includes(normalizedQuery))
    : diagrams;

  diagramCount.textContent = normalizedQuery
    ? `${filtered.length} / ${diagrams.length}`
    : String(diagrams.length);

  diagramList.innerHTML = '';

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'catalog-empty';
    empty.textContent = 'Ничего не найдено';
    diagramList.appendChild(empty);
    return;
  }

  const grouped = new Map();
  for (const diagram of filtered) {
    const group = diagram.group || 'Без группы';
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push(diagram);
  }

  for (const [groupName, groupDiagrams] of grouped) {
    const group = document.createElement('section');
    group.className = 'diagram-group';

    const title = document.createElement('h3');
    title.className = 'diagram-group-title';
    title.textContent = groupName;
    group.appendChild(title);

    for (const diagram of groupDiagrams) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `diagram-item${diagram.id === currentDiagram?.id ? ' active' : ''}`;
      button.dataset.diagramId = diagram.id;
      button.setAttribute('aria-current', diagram.id === currentDiagram?.id ? 'page' : 'false');

      const name = document.createElement('span');
      name.className = 'diagram-item-name';
      name.textContent = diagram.name;
      button.appendChild(name);

      if (diagram.description) {
        const description = document.createElement('span');
        description.className = 'diagram-item-description';
        description.textContent = diagram.description;
        button.appendChild(description);
      }

      button.addEventListener('click', () => selectDiagram(diagram));
      group.appendChild(button);
    }

    diagramList.appendChild(group);
  }
}

async function selectDiagram(diagram) {
  if (!diagram || diagram.id === currentDiagram?.id) {
    if (isMobileLayout()) setSidebarCollapsed(true, { remember: false });
    return;
  }

  if (hasLocalChanges) {
    const ok = window.confirm('Есть локальные несохранённые изменения. Переключить диаграмму и потерять их?');
    if (!ok) return;
  }

  await loadDiagram(diagram);
  if (isMobileLayout()) setSidebarCollapsed(true, { remember: false });
}

async function loadDiagram(diagram, { updateUrl = true } = {}) {
  if (!diagram) return;

  isLoading = true;
  currentDiagram = diagram;
  setDirty(false);
  modelNameEl.textContent = diagram.name;
  modelDescriptionEl.textContent = diagram.description || '';
  modelPathEl.textContent = diagram.path || '';
  renderCatalog(diagramSearch.value);
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
    updateHistoryButtons();
    if (updateUrl) setUrlDiagram(diagram.id);
    setStatus(`«${diagram.name}» загружена из GitHub. BPMN 2.0 можно редактировать прямо на схеме.`);
  } catch (error) {
    console.error(error);
    setStatus(`Не удалось загрузить «${diagram.name}»: ${error.message}`);
  } finally {
    isLoading = false;
  }
}

async function loadCatalog() {
  setStatus('Загрузка каталога диаграмм…');

  try {
    const response = await fetch(`diagrams/index.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const catalog = await response.json();
    diagrams = Array.isArray(catalog.diagrams) ? catalog.diagrams : [];
    if (!diagrams.length) throw new Error('список диаграмм пуст');

    renderCatalog();

    const urlId = new URL(window.location.href).searchParams.get('diagram');
    const rememberedId = localStorage.getItem('bpmn-last-diagram');
    const requestedId = urlId || rememberedId;
    const initial = diagrams.find(d => d.id === requestedId) || diagrams[0];
    await loadDiagram(initial, { updateUrl: initial.id !== urlId });
  } catch (error) {
    console.error(error);
    diagramList.innerHTML = '<div class="catalog-empty">Не удалось загрузить каталог</div>';
    setStatus(`Не удалось загрузить каталог диаграмм: ${error.message}`);
  }
}

function zoomBy(factor) {
  const canvas = modeler.get('canvas');
  const current = canvas.zoom();
  canvas.zoom(Math.max(0.2, Math.min(4, current * factor)));
}

async function copyCurrentLink() {
  if (!currentDiagram) return;
  setUrlDiagram(currentDiagram.id);
  const link = window.location.href;

  try {
    await navigator.clipboard.writeText(link);
    setStatus(`Ссылка на «${currentDiagram.name}» скопирована.`);
  } catch (error) {
    window.prompt('Скопируйте ссылку на диаграмму:', link);
  }
}

document.getElementById('sidebar-toggle').addEventListener('click', () => {
  setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'));
});

document.getElementById('sidebar-close').addEventListener('click', () => {
  setSidebarCollapsed(true, { remember: false });
});

sidebarBackdrop.addEventListener('click', () => {
  setSidebarCollapsed(true, { remember: false });
});

diagramSearch.addEventListener('input', () => renderCatalog(diagramSearch.value));

diagramSearch.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    diagramSearch.value = '';
    renderCatalog();
    diagramSearch.blur();
  }
});

document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (document.body.classList.contains('sidebar-collapsed')) {
      setSidebarCollapsed(false, { remember: false });
    }
    diagramSearch.focus();
    diagramSearch.select();
  }
});

document.getElementById('copy-link').addEventListener('click', copyCurrentLink);

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
undoButton.addEventListener('click', () => modeler.get('commandStack').undo());
redoButton.addEventListener('click', () => modeler.get('commandStack').redo());

modeler.on('commandStack.changed', () => {
  updateHistoryButtons();
  if (isLoading) return;
  setDirty(true);
  setStatus(`«${currentDiagram?.name || 'Диаграмма'}»: есть локальные изменения в браузере. Версия из ChatGPT хранится в GitHub.`);
});

window.addEventListener('beforeunload', event => {
  if (!hasLocalChanges) return;
  event.preventDefault();
  event.returnValue = '';
});

window.addEventListener('resize', () => {
  if (isMobileLayout()) {
    sidebarBackdrop.hidden = document.body.classList.contains('sidebar-collapsed');
  } else {
    sidebarBackdrop.hidden = true;
  }
});

initializeSidebarState();
updateHistoryButtons();
loadCatalog();
