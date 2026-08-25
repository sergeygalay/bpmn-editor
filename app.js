const modeler = new BpmnJS({
  container: '#canvas',
  keyboard: { bindTo: document }
});

const statusEl = document.getElementById('status');
const modelPath = 'diagrams/shop.bpmn';

function setStatus(message) {
  statusEl.textContent = message;
}

async function loadModel() {
  setStatus('Загрузка BPMN из GitHub…');

  try {
    const response = await fetch(`${modelPath}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const xml = await response.text();
    const result = await modeler.importXML(xml);

    if (result.warnings?.length) {
      console.warn('BPMN import warnings:', result.warnings);
    }

    modeler.get('canvas').zoom('fit-viewport');
    setStatus('BPMN 2.0 загружен. Можно редактировать элементы прямо на схеме.');
  } catch (error) {
    console.error(error);
    setStatus(`Не удалось загрузить модель: ${error.message}`);
  }
}

function zoomBy(factor) {
  const canvas = modeler.get('canvas');
  const current = canvas.zoom();
  canvas.zoom(Math.max(0.2, Math.min(4, current * factor)));
}

document.getElementById('reload').addEventListener('click', loadModel);
document.getElementById('fit').addEventListener('click', () => modeler.get('canvas').zoom('fit-viewport'));
document.getElementById('zoom-in').addEventListener('click', () => zoomBy(1.2));
document.getElementById('zoom-out').addEventListener('click', () => zoomBy(1 / 1.2));
document.getElementById('undo').addEventListener('click', () => modeler.get('commandStack').undo());
document.getElementById('redo').addEventListener('click', () => modeler.get('commandStack').redo());

modeler.on('commandStack.changed', () => {
  setStatus('Есть локальные изменения в браузере. Изменения из ChatGPT сохраняются через GitHub.');
});

loadModel();
