const exportPngButton = document.getElementById('export-png');

function safePngFilename(value) {
  return String(value || 'diagram')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_-]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'diagram';
}

function prepareSvgForPng(svgText) {
  const parser = new DOMParser();
  const documentSvg = parser.parseFromString(svgText, 'image/svg+xml');
  const svgElement = documentSvg.documentElement;

  if (svgElement.nodeName.toLowerCase() === 'parsererror') {
    throw new Error('не удалось разобрать SVG');
  }

  const viewBox = (svgElement.getAttribute('viewBox') || '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);

  let width = Number.parseFloat(svgElement.getAttribute('width'));
  let height = Number.parseFloat(svgElement.getAttribute('height'));

  if ((!Number.isFinite(width) || width <= 0) && viewBox.length === 4) {
    width = viewBox[2];
  }

  if ((!Number.isFinite(height) || height <= 0) && viewBox.length === 4) {
    height = viewBox[3];
  }

  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error('не удалось определить размер диаграммы');
  }

  if (!svgElement.getAttribute('xmlns')) {
    svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }

  svgElement.setAttribute('width', String(width));
  svgElement.setAttribute('height', String(height));

  return {
    svg: new XMLSerializer().serializeToString(svgElement),
    width,
    height
  };
}

function loadSvgImage(svg) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => resolve({ image, objectUrl });
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('браузер не смог отрисовать SVG'));
    };

    image.src = objectUrl;
  });
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('не удалось сформировать PNG'));
    }, 'image/png');
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportCurrentDiagramAsPng() {
  if (!currentDiagram) {
    setStatus('Сначала откройте диаграмму.');
    return;
  }

  const previousText = exportPngButton.textContent;
  exportPngButton.disabled = true;
  exportPngButton.textContent = 'PNG…';
  setStatus(`Экспорт «${currentDiagram.name}» в PNG…`);

  try {
    const { svg } = await modeler.saveSVG();
    const prepared = prepareSvgForPng(svg);

    const maxDimension = 8192;
    const preferredScale = 2;
    const scale = Math.min(
      preferredScale,
      maxDimension / prepared.width,
      maxDimension / prepared.height
    );

    const outputWidth = Math.max(1, Math.round(prepared.width * scale));
    const outputHeight = Math.max(1, Math.round(prepared.height * scale));

    const { image, objectUrl } = await loadSvgImage(prepared.svg);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;

      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D недоступен');

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, outputWidth, outputHeight);
      context.drawImage(image, 0, 0, outputWidth, outputHeight);

      const pngBlob = await canvasToPngBlob(canvas);
      const filename = `${safePngFilename(currentDiagram.id || currentDiagram.name)}.png`;
      downloadBlob(pngBlob, filename);

      setStatus(`«${currentDiagram.name}» экспортирована в ${filename} (${outputWidth}×${outputHeight}).`);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch (error) {
    console.error(error);
    setStatus(`Не удалось экспортировать PNG: ${error.message}`);
  } finally {
    exportPngButton.disabled = false;
    exportPngButton.textContent = previousText;
  }
}

exportPngButton.addEventListener('click', exportCurrentDiagramAsPng);

document.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && key === 'e') {
    event.preventDefault();
    exportCurrentDiagramAsPng();
  }
});
