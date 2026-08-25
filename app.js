const modeler = new BpmnJS({
  container: '#canvas',
  keyboard: { bindTo: document }
});

const REPO_OWNER = 'sergeygalay';
const REPO_NAME = 'bpmn-editor';
const BRANCH = 'main';
const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;

const statusEl = document.getElementById('status');
const modelNameEl = document.getElementById('model-name');
const modelDescriptionEl = document.getElementById('model-description');
const modelPathEl = document.getElementById('model-path');
const dirtyBadge = document.getElementById('dirty-badge');
const githubBadge = document.getElementById('github-badge');
const diagramList = document.getElementById('diagram-list');
const diagramCount = document.getElementById('diagram-count');
const diagramSearch = document.getElementById('diagram-search');
const sidebar = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const undoButton = document.getElementById('undo');
const redoButton = document.getElementById('redo');
const saveButton = document.getElementById('save');
const githubConnectButton = document.getElementById('github-connect');
const githubDialog = document.getElementById('github-dialog');
const githubForm = document.getElementById('github-form');
const githubTokenInput = document.getElementById('github-token');
const githubSubmitButton = document.getElementById('github-submit');

let diagrams = [];
let currentDiagram = null;
let currentFileSha = null;
let isLoading = false;
let isSaving = false;
let hasLocalChanges = false;
let githubToken = null;

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

function updateGithubUi() {
  const connected = Boolean(githubToken);
  githubBadge.textContent = connected ? 'GitHub подключён' : 'GitHub не подключён';
  githubBadge.classList.toggle('connected', connected);
  githubConnectButton.textContent = connected ? 'GitHub ✓' : 'Подключить GitHub';
  githubConnectButton.title = connected ? 'Сменить GitHub token' : 'Подключить GitHub для сохранения';
  saveButton.disabled = !currentDiagram || isLoading || isSaving;
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

function apiHeaders(token = githubToken) {
  const headers = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function encodeRepoPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function readGithubFileMetadata(path, token = githubToken) {
  const url = `${API_BASE}/contents/${encodeRepoPath(path)}?ref=${encodeURIComponent(BRANCH)}`;
  const response = await fetch(url, { headers: apiHeaders(token), cache: 'no-store' });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body.message) message = body.message;
    } catch (_) {}
    throw new Error(message);
  }
  return response.json();
}

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function openGithubDialog() {
  githubTokenInput.value = '';
  if (typeof githubDialog.showModal === 'function') {
    githubDialog.showModal();
  } else {
    githubDialog.setAttribute('open', '');
  }
  setTimeout(() => githubTokenInput.focus(), 0);
}

function closeGithubDialog() {
  if (typeof githubDialog.close === 'function') {
    githubDialog.close();
  } else {
    githubDialog.removeAttribute('open');
  }
}

async function connectGithub(token) {
  const candidate = token.trim();
  if (!candidate) throw new Error('Введите GitHub token');

  const response = await fetch(API_BASE, {
    headers: apiHeaders(candidate),
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(response.status === 401 ? 'Неверный или просроченный token' : `GitHub вернул HTTP ${response.status}`);
  }

  githubToken = candidate;
  updateGithubUi();
  setStatus('GitHub подключён. Кнопка «Сохранить» будет коммитить BPMN прямо в репозиторий.');
}

async function saveCurrentDiagram() {
  if (!currentDiagram || isSaving || isLoading) return;

  if (!githubToken) {
    openGithubDialog();
    setStatus('Для сохранения в репозиторий сначала подключите GitHub.');
    return;
  }

  isSaving = true;
  updateGithubUi();
  setStatus(`Сохранение «${currentDiagram.name}» в GitHub…`);

  try {
    const metadata = await readGithubFileMetadata(currentDiagram.path);

    if (currentFileSha && metadata.sha !== currentFileSha) {
      const overwrite = window.confirm(
        'Файл на GitHub изменился после того, как вы открыли диаграмму. Сохранение перезапишет более новую версию. Продолжить?'
      );
      if (!overwrite) {
        setStatus('Сохранение отменено. Сначала нажмите «Обновить», чтобы получить последнюю версию из GitHub.');
        return;
      }
    }

    const { xml } = await modeler.saveXML({ format: true });
    const url = `${API_BASE}/contents/${encodeRepoPath(currentDiagram.path)}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        ...apiHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Update BPMN: ${currentDiagram.name}`,
        content: utf8ToBase64(xml),
        sha: metadata.sha,
        branch: BRANCH
      })
    });

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const body = await response.json();
        if (body.message) message = body.message;
      } catch (_) {}
      if (response.status === 401 || response.status === 403) {
        githubToken = null;
        updateGithubUi();
        message += '. Проверьте token и право Contents: Read and write.';
      }
      throw new Error(message);
    }

    const saved = await response.json();
    currentFileSha = saved.content?.sha || metadata.sha;
    setDirty(false);
    const shortCommit = saved.commit?.sha ? saved.commit.sha.slice(0, 7) : '';
    setStatus(`«${currentDiagram.name}» сохранена в GitHub${shortCommit ? ` · commit ${shortCommit}` : ''}.`);
  } catch (error) {
    console.error(error);
    setStatus(`Не удалось сохранить в GitHub: ${error.message}`);
  } finally {
    isSaving = false;
    updateGithubUi();
  }
}

async function selectDiagram(diagram) {
  if (!diagram || diagram.id === currentDiagram?.id) {
    if (isMobileLayout()) setSidebarCollapsed(true, { remember: false });
    return;
  }

  if (hasLocalChanges) {
    const ok = window.confirm('Есть несохранённые изменения. Переключить диаграмму и потерять их?');
    if (!ok) return;
  }

  await loadDiagram(diagram);
  if (isMobileLayout()) setSidebarCollapsed(true, { remember: false });
}

async function loadDiagram(diagram, { updateUrl = true } = {}) {
  if (!diagram) return;

  isLoading = true;
  currentDiagram = diagram;
  currentFileSha = null;
  setDirty(false);
  updateGithubUi();
  modelNameEl.textContent = diagram.name;
  modelDescriptionEl.textContent = diagram.description || '';
  modelPathEl.textContent = diagram.path || '';
  renderCatalog(diagramSearch.value);
  setStatus(`Загрузка «${diagram.name}» из GitHub…`);

  try {
    const [modelResponse, metadata] = await Promise.all([
      fetch(`${diagram.path}?v=${Date.now()}`, { cache: 'no-store' }),
      readGithubFileMetadata(diagram.path, null).catch(() => null)
    ]);

    if (!modelResponse.ok) throw new Error(`HTTP ${modelResponse.status}`);

    const xml = await modelResponse.text();
    const result = await modeler.importXML(xml);
    currentFileSha = metadata?.sha || null;

    if (result.warnings?.length) {
      console.warn('BPMN import warnings:', result.warnings);
    }

    modeler.get('canvas').zoom('fit-viewport');
    updateHistoryButtons();
    if (updateUrl) setUrlDiagram(diagram.id);
    setStatus(`«${diagram.name}» загружена из GitHub. Изменения можно сохранить обратно в репозиторий.`);
  } catch (error) {
    console.error(error);
    setStatus(`Не удалось загрузить «${diagram.name}»: ${error.message}`);
  } finally {
    isLoading = false;
    updateGithubUi();
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
  const key = event.key.toLowerCase();
  if ((event.metaKey || event.ctrlKey) && key === 'k') {
    event.preventDefault();
    if (document.body.classList.contains('sidebar-collapsed')) {
      setSidebarCollapsed(false, { remember: false });
    }
    diagramSearch.focus();
    diagramSearch.select();
  }
  if ((event.metaKey || event.ctrlKey) && key === 's') {
    event.preventDefault();
    saveCurrentDiagram();
  }
});

githubConnectButton.addEventListener('click', openGithubDialog);
document.getElementById('github-dialog-close').addEventListener('click', closeGithubDialog);

githubForm.addEventListener('submit', async event => {
  event.preventDefault();
  githubSubmitButton.disabled = true;
  githubSubmitButton.textContent = 'Проверка…';
  try {
    await connectGithub(githubTokenInput.value);
    githubTokenInput.value = '';
    closeGithubDialog();
  } catch (error) {
    setStatus(`Не удалось подключить GitHub: ${error.message}`);
    githubTokenInput.focus();
    githubTokenInput.select();
  } finally {
    githubSubmitButton.disabled = false;
    githubSubmitButton.textContent = 'Подключить';
  }
});

saveButton.addEventListener('click', saveCurrentDiagram);
document.getElementById('copy-link').addEventListener('click', copyCurrentLink);

document.getElementById('reload').addEventListener('click', async () => {
  if (!currentDiagram) return;
  if (hasLocalChanges) {
    const ok = window.confirm('Загрузить текущую версию из GitHub и потерять несохранённые изменения?');
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
  setStatus(`«${currentDiagram?.name || 'Диаграмма'}»: есть несохранённые изменения. Нажмите «Сохранить», чтобы записать их в GitHub.`);
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
updateGithubUi();
loadCatalog();
