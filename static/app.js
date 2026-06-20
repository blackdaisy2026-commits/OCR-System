// State Management
let appState = {
    theme: 'dark',
    currentFile: null,
    currentImageElement: null,
    originalWidth: 0,
    originalHeight: 0,
    ocrData: null,
    activeHoverIndex: -1,
    fontSize: 14,
    history: []
};

// DOM Elements
const docHtml = document.documentElement;
const themeToggle = document.getElementById('theme-toggle');
const historyToggle = document.getElementById('history-toggle');
const historyDrawer = document.getElementById('history-drawer');
const historyClose = document.getElementById('history-close');
const drawerBackdrop = document.getElementById('drawer-backdrop');
const historyList = document.getElementById('history-list');
const historyEmpty = document.getElementById('history-empty');
const clearHistoryBtn = document.getElementById('clear-history-btn');

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const resetWorkspace = document.getElementById('reset-workspace');
const viewerContainer = document.getElementById('viewer-container');
const previewImage = document.getElementById('preview-image');
const overlayCanvas = document.getElementById('overlay-canvas');
const loader = document.getElementById('loader');

const resultsPlaceholder = document.getElementById('results-placeholder');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

const textPane = document.getElementById('tab-text');
const extractedTextView = document.getElementById('extracted-text-view');
const textSearchInput = document.getElementById('text-search');
const searchMatches = document.getElementById('search-matches');
const fontDecrease = document.getElementById('font-decrease');
const fontIncrease = document.getElementById('font-increase');
const fontSizeLabel = document.getElementById('font-size-label');

const elementsTableBody = document.getElementById('elements-table-body');
const jsonOutputView = document.getElementById('json-output-view');

// Metrics elements
const metricStatus = document.getElementById('metric-status');
const metricSpeed = document.getElementById('metric-speed');
const metricConfidence = document.getElementById('metric-confidence');
const metricBlocks = document.getElementById('metric-blocks');
const metricResolution = document.getElementById('metric-resolution');

// Copy/Export buttons
const copyTextBtn = document.getElementById('copy-text-btn');
const downloadTxtBtn = document.getElementById('download-txt-btn');
const downloadCsvBtn = document.getElementById('download-csv-btn');
const copyJsonBtn = document.getElementById('copy-json-btn');
const downloadJsonBtn = document.getElementById('download-json-btn');

const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

/* ==========================================================================
   Initialization
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initHistory();
    setupEventListeners();
});

function setupEventListeners() {
    // Theme Switcher
    themeToggle.addEventListener('click', toggleTheme);

    // History Toggle
    historyToggle.addEventListener('click', openHistoryDrawer);
    historyClose.addEventListener('click', closeHistoryDrawer);
    drawerBackdrop.addEventListener('click', closeHistoryDrawer);
    clearHistoryBtn.addEventListener('click', clearAllHistory);

    // Drag and Drop Area
    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
        }, false);
    });

    dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleSelectedFile(files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleSelectedFile(e.target.files[0]);
        }
    });

    resetWorkspace.addEventListener('click', resetAppWorkspace);

    // Bounding Box Dynamic Canvas Resizing
    window.addEventListener('resize', handleCanvasResize);

    // Canvas Hover Events
    overlayCanvas.addEventListener('mousemove', handleCanvasMouseMove);
    overlayCanvas.addEventListener('mouseleave', handleCanvasMouseLeave);

    // Tabs Management
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.add('hidden'));
            
            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(tabId).classList.remove('hidden');
        });
    });

    // Font Controls
    fontIncrease.addEventListener('click', () => adjustFontSize(2));
    fontDecrease.addEventListener('click', () => adjustFontSize(-2));

    // Search Input
    textSearchInput.addEventListener('input', handleSearch);

    // Clipboard Copy Buttons
    copyTextBtn.addEventListener('click', () => copyToClipboard(extractedTextView.innerText, 'Text copied to clipboard!'));
    copyJsonBtn.addEventListener('click', () => copyToClipboard(jsonOutputView.textContent, 'JSON response copied to clipboard!'));

    // Download Buttons
    downloadTxtBtn.addEventListener('click', downloadTextFile);
    downloadJsonBtn.addEventListener('click', downloadJsonFile);
    downloadCsvBtn.addEventListener('click', downloadCsvFile);
}

/* ==========================================================================
   Theme Management
   ========================================================================== */
function initTheme() {
    const savedTheme = localStorage.getItem('lumina-ocr-theme') || 'dark';
    appState.theme = savedTheme;
    docHtml.setAttribute('data-theme', savedTheme);
    updateThemeIcon();
}

function toggleTheme() {
    appState.theme = appState.theme === 'dark' ? 'light' : 'dark';
    docHtml.setAttribute('data-theme', appState.theme);
    localStorage.setItem('lumina-ocr-theme', appState.theme);
    updateThemeIcon();
    drawCanvasBoxes(); // Redraw boxes to reflect potentially changed accent theme colors
}

function updateThemeIcon() {
    const icon = themeToggle.querySelector('i');
    if (appState.theme === 'light') {
        icon.className = 'fa-solid fa-moon';
    } else {
        icon.className = 'fa-solid fa-sun';
    }
}

/* ==========================================================================
   File & OCR Processing Logic
   ========================================================================== */
function handleSelectedFile(file) {
    if (!file.type.startsWith('image/')) {
        showToast('Error: Please select a valid image file (PNG, JPG, WEBP).', 'error');
        return;
    }
    appState.currentFile = file;
    
    // Toggle views
    dropzone.classList.add('hidden');
    loader.classList.remove('hidden');
    setMetricStatus('Processing', 'active');

    // Run OCR API Request
    performOcrApiCall(file);
}

async function performOcrApiCall(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/ocr', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || 'Failed to process image');
        }

        const result = await response.json();
        if (result.status === 'success') {
            appState.ocrData = result.data;
            
            // Generate visual base64 thumbnail for history item
            const thumbnail = await generateThumbnail(file);
            saveToHistory(file.name, thumbnail, result.data);
            
            // Render the Workspace Image and Canvas
            setupWorkspaceImage(file);
        } else {
            throw new Error('API returned unsuccessful status.');
        }

    } catch (error) {
        console.error(error);
        showToast(`OCR Failed: ${error.message}`, 'error');
        resetAppWorkspace();
    }
}

// Loads the file into the preview image element
function setupWorkspaceImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        previewImage.src = e.target.result;
        previewImage.onload = () => {
            // Store original dimensions
            appState.originalWidth = previewImage.naturalWidth;
            appState.originalHeight = previewImage.naturalHeight;
            appState.currentImageElement = previewImage;
            
            // Switch views
            loader.classList.add('hidden');
            viewerContainer.classList.remove('hidden');
            resetWorkspace.classList.remove('hidden');
            
            // Setup canvas size and draw overlays
            handleCanvasResize();
            
            // Populate Results Panel
            renderResults();
            setMetricStatus('Completed', 'idle');
            showToast('OCR processed successfully!');
        };
    };
    reader.readAsDataURL(file);
}

function resetAppWorkspace() {
    appState.currentFile = null;
    appState.currentImageElement = null;
    appState.ocrData = null;
    appState.activeHoverIndex = -1;
    
    // Clear preview source
    previewImage.src = '';
    
    // Toggle elements visibility
    viewerContainer.classList.add('hidden');
    resetWorkspace.classList.add('hidden');
    loader.classList.add('hidden');
    dropzone.classList.remove('hidden');
    
    // Clear file input
    fileInput.value = '';

    // Clear Results Panels & Metrics
    clearResultsPanel();
}

/* ==========================================================================
   Results Rendering (Text, Table, JSON, Metrics)
   ========================================================================== */
function renderResults() {
    if (!appState.ocrData) return;

    const { elements, full_text, stats } = appState.ocrData;

    // Show result panes
    resultsPlaceholder.classList.add('hidden');
    textPane.classList.remove('hidden');
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
    textPane.classList.remove('hidden'); // default tab
    tabButtons.forEach(b => {
        b.classList.remove('active');
        if (b.getAttribute('data-tab') === 'tab-text') b.classList.add('active');
    });

    // 1. Render Extracted Text tab with spans for linking
    extractedTextView.innerHTML = '';
    if (elements && elements.length > 0) {
        elements.forEach((el, index) => {
            const span = document.createElement('span');
            span.className = 'ocr-block-item';
            span.setAttribute('data-index', index);
            // Append clean text with a line break
            span.textContent = el.text;
            
            // Two-way interaction (Hover on text highlights box)
            span.addEventListener('mouseenter', () => {
                highlightOcrIndex(index);
            });
            span.addEventListener('mouseleave', () => {
                highlightOcrIndex(-1);
            });
            
            extractedTextView.appendChild(span);
            extractedTextView.appendChild(document.createTextNode('\n'));
        });
    } else {
        extractedTextView.textContent = 'No text detected in the image.';
    }

    // Reset search
    textSearchInput.value = '';
    searchMatches.classList.add('hidden');

    // 2. Render Structure Table
    elementsTableBody.innerHTML = '';
    if (elements && elements.length > 0) {
        elements.forEach((el, index) => {
            const tr = document.createElement('tr');
            tr.setAttribute('data-index', index);
            
            const confClass = el.confidence >= 0.85 ? 'conf-high' : (el.confidence >= 0.6 ? 'conf-medium' : 'conf-low');
            const confText = `${(el.confidence * 100).toFixed(1)}%`;

            tr.innerHTML = `
                <td class="index-badge">${index + 1}</td>
                <td>${escapeHTML(el.text)}</td>
                <td><span class="confidence-badge ${confClass}">${confText}</span></td>
            `;

            // Hover interactions
            tr.addEventListener('mouseenter', () => highlightOcrIndex(index));
            tr.addEventListener('mouseleave', () => highlightOcrIndex(-1));
            
            elementsTableBody.appendChild(tr);
        });
    } else {
        elementsTableBody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">No text elements discovered.</td></tr>`;
    }

    // 3. Render JSON payload
    jsonOutputView.textContent = JSON.stringify(appState.ocrData, null, 2);

    // 4. Update Metrics Footer
    metricSpeed.textContent = `${stats.inference_seconds.toFixed(2)}s`;
    metricConfidence.textContent = `${(stats.avg_confidence * 100).toFixed(1)}%`;
    metricBlocks.textContent = stats.line_count;
    metricResolution.textContent = `${stats.image_width} × ${stats.image_height}`;
}

function clearResultsPanel() {
    resultsPlaceholder.classList.remove('hidden');
    tabPanes.forEach(pane => pane.classList.add('hidden'));
    
    // Clear elements
    extractedTextView.innerHTML = '';
    elementsTableBody.innerHTML = '';
    jsonOutputView.textContent = '';
    
    // Reset Metrics
    metricSpeed.textContent = '-';
    metricConfidence.textContent = '-';
    metricBlocks.textContent = '-';
    metricResolution.textContent = '-';
    setMetricStatus('Ready', 'idle');
}

function setMetricStatus(text, stateClass) {
    metricStatus.textContent = text;
    metricStatus.className = `metric-value status-${stateClass}`;
}

/* ==========================================================================
   Interactive Canvas Drawing & Coordinates Scaling
   ========================================================================== */
function handleCanvasResize() {
    if (!appState.currentImageElement || !overlayCanvas) return;

    const img = appState.currentImageElement;
    
    // Set matching aspect ratio canvas dimensions
    overlayCanvas.width = img.clientWidth;
    overlayCanvas.height = img.clientHeight;

    drawCanvasBoxes();
}

function drawCanvasBoxes() {
    if (!appState.ocrData || !overlayCanvas) return;

    const ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    const elements = appState.ocrData.elements;
    if (!elements || elements.length === 0) return;

    const scaleX = overlayCanvas.width / appState.originalWidth;
    const scaleY = overlayCanvas.height / appState.originalHeight;

    elements.forEach((el, index) => {
        const box = el.box; // [[x0, y0], [x1, y1], [x2, y2], [x3, y3]]
        if (!box || box.length < 4) return;

        const isHovered = (index === appState.activeHoverIndex);

        // Get theme primary color
        const accentColor = getComputedStyle(docHtml).getPropertyValue('--color-accent-start').trim() || '#6366f1';
        
        ctx.beginPath();
        // Scale first vertex
        ctx.moveTo(box[0][0] * scaleX, box[0][1] * scaleY);
        ctx.lineTo(box[1][0] * scaleX, box[1][1] * scaleY);
        ctx.lineTo(box[2][0] * scaleX, box[2][1] * scaleY);
        ctx.lineTo(box[3][0] * scaleX, box[3][1] * scaleY);
        ctx.closePath();

        if (isHovered) {
            // Neon glowing stroke
            ctx.strokeStyle = '#22c55e'; // Highlight green on hover
            ctx.lineWidth = 3;
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#22c55e';
            ctx.stroke();

            // Transparent fill
            ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
            ctx.fill();
        } else {
            // Normal subtle border
            ctx.strokeStyle = accentColor;
            ctx.lineWidth = 1.5;
            ctx.shadowBlur = 0; // reset shadow
            ctx.stroke();
            
            // Soft transparent fill
            ctx.fillStyle = 'rgba(99, 102, 241, 0.03)';
            ctx.fill();
        }
        
        // Reset canvas context config
        ctx.shadowBlur = 0;
    });
}

function handleCanvasMouseMove(e) {
    if (!appState.ocrData || !overlayCanvas) return;

    const rect = overlayCanvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const scaleX = overlayCanvas.width / appState.originalWidth;
    const scaleY = overlayCanvas.height / appState.originalHeight;

    const elements = appState.ocrData.elements;
    let foundIndex = -1;

    // Check bottom-up or standard loop to check intersections
    for (let i = 0; i < elements.length; i++) {
        const box = elements[i].box;
        if (!box || box.length < 4) continue;

        // Scale bounding box coordinates to canvas scale
        const scaledPolygon = box.map(pt => [pt[0] * scaleX, pt[1] * scaleY]);

        if (isPointInPolygon([mouseX, mouseY], scaledPolygon)) {
            foundIndex = i;
            break; // Find the first match
        }
    }

    if (foundIndex !== appState.activeHoverIndex) {
        highlightOcrIndex(foundIndex);
    }
}

function handleCanvasMouseLeave() {
    highlightOcrIndex(-1);
}

// Shared highlighter interface (coordinates sync)
function highlightOcrIndex(index) {
    appState.activeHoverIndex = index;
    drawCanvasBoxes();

    // Reset highlighting on all text spans & table rows
    const textSpans = extractedTextView.querySelectorAll('.ocr-block-item');
    const tableRows = elementsTableBody.querySelectorAll('tr');

    textSpans.forEach(span => {
        const spanIndex = parseInt(span.getAttribute('data-index'));
        if (spanIndex === index) {
            span.classList.add('highlight-hover');
            // Scroll span into view smoothly within the text panel container
            if (index !== -1 && span.parentNode) {
                // Check if scroll is needed
            }
        } else {
            span.classList.remove('highlight-hover');
        }
    });

    tableRows.forEach(row => {
        const rowIndex = parseInt(row.getAttribute('data-index'));
        if (rowIndex === index) {
            row.classList.add('highlight-hover');
            // Smooth scroll table row
            if (index !== -1) {
                row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        } else {
            row.classList.remove('highlight-hover');
        }
    });
}

// Ray Casting Algorithm to check point-in-polygon (handles rotated boxes)
function isPointInPolygon(point, polygon) {
    const x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0], yi = polygon[i][1];
        const xj = polygon[j][0], yj = polygon[j][1];
        
        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/* ==========================================================================
   Font Size, Search, & Utilities
   ========================================================================== */
function adjustFontSize(delta) {
    let newSize = appState.fontSize + delta;
    if (newSize >= 10 && newSize <= 28) {
        appState.fontSize = newSize;
        extractedTextView.style.fontSize = `${newSize}px`;
        fontSizeLabel.textContent = `${newSize}px`;
    }
}

function handleSearch(e) {
    const query = e.target.value.trim();
    const textSpans = extractedTextView.querySelectorAll('.ocr-block-item');
    
    if (!query) {
        // Reset views
        searchMatches.classList.add('hidden');
        textSpans.forEach(span => {
            const index = span.getAttribute('data-index');
            const originalText = appState.ocrData.elements[index].text;
            span.textContent = originalText;
        });
        return;
    }

    let matchCount = 0;
    const escapedQuery = escapeRegExp(query);
    const regex = new RegExp(`(${escapedQuery})`, 'gi');

    textSpans.forEach(span => {
        const index = span.getAttribute('data-index');
        const originalText = appState.ocrData.elements[index].text;
        
        if (regex.test(originalText)) {
            // Match found! Highlight inside the text nodes
            const matchesInElement = originalText.match(regex).length;
            matchCount += matchesInElement;

            // Highlight matches by setting innerHTML with <mark> tags
            const highlightedHTML = originalText.replace(regex, '<mark>$1</mark>');
            span.innerHTML = highlightedHTML;
        } else {
            span.textContent = originalText; // Reset to text nodes
        }
    });

    searchMatches.textContent = `${matchCount} match${matchCount !== 1 ? 'es' : ''}`;
    searchMatches.classList.remove('hidden');
}

/* ==========================================================================
   Scan History Storage (localStorage)
   ========================================================================== */
function initHistory() {
    try {
        const storedHistory = localStorage.getItem('lumina-ocr-history');
        if (storedHistory) {
            appState.history = JSON.parse(storedHistory);
        }
    } catch (e) {
        console.error('Failed to load OCR history from local storage', e);
        appState.history = [];
    }
    renderHistoryList();
}

function saveToHistory(filename, thumbnail, ocrData) {
    const historyItem = {
        id: 'hist_' + Date.now(),
        filename: filename,
        date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        thumbnail: thumbnail, // base64 tiny thumbnail
        ocrData: ocrData
    };

    // Limit history queue size to 10 items
    appState.history.unshift(historyItem);
    if (appState.history.length > 10) {
        appState.history.pop();
    }

    localStorage.setItem('lumina-ocr-history', JSON.stringify(appState.history));
    renderHistoryList();
}

function renderHistoryList() {
    if (appState.history.length === 0) {
        historyEmpty.classList.remove('hidden');
        historyList.classList.add('hidden');
        clearHistoryBtn.setAttribute('disabled', 'true');
        return;
    }

    historyEmpty.classList.add('hidden');
    historyList.classList.remove('hidden');
    clearHistoryBtn.removeAttribute('disabled');

    historyList.innerHTML = '';
    appState.history.forEach(item => {
        const li = document.createElement('li');
        li.className = 'history-item';
        
        const thumbnailHtml = item.thumbnail 
            ? `<img src="${item.thumbnail}" alt="thumbnail" style="width: 42px; height: 42px; object-fit: cover; border-radius: 6px; margin-right: 12px; border: 1px solid var(--border-color)">`
            : `<div style="width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.05); border-radius: 6px; margin-right: 12px; border: 1px solid var(--border-color)"><i class="fa-solid fa-file-lines" style="color:var(--text-muted)"></i></div>`;

        li.innerHTML = `
            <div style="display: flex; align-items: center; flex: 1; min-width: 0;">
                ${thumbnailHtml}
                <div class="history-item-details">
                    <div class="history-item-name" title="${item.filename}">${item.filename}</div>
                    <div class="history-item-meta">
                        <span><i class="fa-solid fa-clock"></i> ${item.date}</span>
                        <span><i class="fa-solid fa-paragraph"></i> ${item.ocrData.stats.line_count} lines</span>
                    </div>
                </div>
            </div>
            <button class="btn-delete-history" title="Delete scan" data-id="${item.id}">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;

        // Load item on click (excluding the delete button action)
        li.addEventListener('click', (e) => {
            if (e.target.closest('.btn-delete-history')) return;
            loadHistoryItem(item);
        });

        // Delete button handler
        const delBtn = li.querySelector('.btn-delete-history');
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteHistoryItem(item.id);
        });

        historyList.appendChild(li);
    });
}

function loadHistoryItem(item) {
    appState.ocrData = item.ocrData;
    
    // Toggle loader or visual warning
    loader.classList.add('hidden');
    viewerContainer.classList.remove('hidden');
    resetWorkspace.classList.remove('hidden');
    
    // We render results
    renderResults();
    setMetricStatus('Completed (History)', 'idle');
    
    // Show a placeholder inside canvas because the original full-res image binary isn't stored in history
    const ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    
    // Display thumbnail inside the preview image slot if image is unavailable,
    // or keep a placeholder background
    previewImage.src = item.thumbnail || '';
    appState.originalWidth = item.ocrData.stats.image_width;
    appState.originalHeight = item.ocrData.stats.image_height;
    
    previewImage.onload = () => {
        handleCanvasResize();
    };

    closeHistoryDrawer();
    showToast('Loaded historic scan: ' + item.filename);
}

function deleteHistoryItem(id) {
    appState.history = appState.history.filter(item => item.id !== id);
    localStorage.setItem('lumina-ocr-history', JSON.stringify(appState.history));
    renderHistoryList();
    showToast('Scan deleted from history.');
}

function clearAllHistory() {
    if (confirm('Are you sure you want to clear your entire scan history?')) {
        appState.history = [];
        localStorage.removeItem('lumina-ocr-history');
        renderHistoryList();
        showToast('All scan history cleared.');
    }
}

// Helper to generate a low-resolution Base64 JPEG for localStorage thumbnails (~10-25KB)
function generateThumbnail(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 80;
                const MAX_HEIGHT = 80;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Return high compression JPEG data URL
                resolve(canvas.toDataURL('image/jpeg', 0.6));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// Slide-out Drawer Actions
function openHistoryDrawer() {
    historyDrawer.classList.add('open');
    drawerBackdrop.classList.add('active');
}

function closeHistoryDrawer() {
    historyDrawer.classList.remove('open');
    drawerBackdrop.classList.remove('active');
}

/* ==========================================================================
   Exports (Download text, json, csv)
   ========================================================================== */
function downloadTextFile() {
    if (!appState.ocrData) return;
    const blob = new Blob([appState.ocrData.full_text], { type: 'text/plain' });
    triggerDownload(blob, `${cleanFileName(appState.currentFile?.name || 'ocr_result')}.txt`);
}

function downloadJsonFile() {
    if (!appState.ocrData) return;
    const blob = new Blob([JSON.stringify(appState.ocrData, null, 2)], { type: 'application/json' });
    triggerDownload(blob, `${cleanFileName(appState.currentFile?.name || 'ocr_result')}.json`);
}

function downloadCsvFile() {
    if (!appState.ocrData || !appState.ocrData.elements) return;
    
    // CSV Header
    let csvContent = 'Index,Text,Confidence\n';
    appState.ocrData.elements.forEach((el, index) => {
        // Escape quotes
        const escapedText = el.text.replace(/"/g, '""');
        csvContent += `${index + 1},"${escapedText}",${el.confidence.toFixed(4)}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, `${cleanFileName(appState.currentFile?.name || 'ocr_result')}.csv`);
}

function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('File downloaded successfully!');
}

/* ==========================================================================
   Toasts & Utilities
   ========================================================================== */
function showToast(message, type = 'success') {
    toastMessage.textContent = message;
    const icon = toast.querySelector('.toast-icon');
    
    if (type === 'error') {
        icon.className = 'fa-solid fa-circle-exclamation';
        icon.style.color = 'var(--color-danger)';
    } else {
        icon.className = 'fa-solid fa-circle-check';
        icon.style.color = 'var(--color-success)';
    }

    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function copyToClipboard(text, successMsg) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        showToast(successMsg);
    }).catch(err => {
        console.error('Could not copy text: ', err);
        showToast('Failed to copy to clipboard', 'error');
    });
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

function cleanFileName(name) {
    return name.substring(0, name.lastIndexOf('.')) || name;
}
