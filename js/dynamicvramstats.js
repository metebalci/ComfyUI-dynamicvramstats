import { app } from "../../scripts/app.js";

const DEFAULT_POLL_INTERVAL_S = 1;
const PAGE_SIZE_MB = 32;
const DEFAULT_WIDTH = 280;
const INITIAL_HEIGHT_PERCENT = 50;

// Colors
const COLOR_RESIDENT = "#4CAF50";    // green - in VRAM
const COLOR_ABSENT = "#424242";      // dark gray - not in VRAM
const COLOR_PINNED = "#FF9800";      // orange - pinned in VRAM
const COLOR_FREE = "#2a2a2a";        // free VRAM
const COLOR_OTHER = "#7B1FA2";       // purple - non-VBAR VRAM usage
const COLOR_BG = "#1e1e1e";
const COLOR_TEXT = "#cccccc";
const COLOR_TEXT_DIM = "#888888";
const COLOR_HEADER_BG = "#2a2a2a";

// Distinct colors for models in the VRAM bar
const MODEL_COLORS = [
    "#2196F3", "#FF5722", "#009688", "#E91E63",
    "#CDDC39", "#00BCD4", "#FF9800", "#8BC34A",
    "#673AB7", "#FFC107", "#3F51B5", "#795548",
];

// Get the usable grid width from the content area
function getGridWidth(content) {
    // content has 8px padding on each side
    return content.clientWidth - 16;
}

function createPanel() {
    const panel = document.createElement("div");
    panel.id = "dynamicvramstats-panel";
    panel.style.cssText = `
        position: fixed;
        bottom: 10px;
        right: 10px;
        width: ${DEFAULT_WIDTH}px;
        height: ${Math.floor(window.innerHeight * INITIAL_HEIGHT_PERCENT / 100)}px;
        background: ${COLOR_BG};
        border: 1px solid #444;
        border-radius: 8px;
        color: ${COLOR_TEXT};
        font-family: monospace;
        font-size: 12px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        user-select: none;
        resize: both;
        overflow: hidden;
        min-width: 150px;
        min-height: 80px;
        display: flex;
        flex-direction: column;
    `;

    // Header (draggable + collapse toggle)
    const header = document.createElement("div");
    header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 10px;
        background: ${COLOR_HEADER_BG};
        border-radius: 8px 8px 0 0;
        cursor: move;
        border-bottom: 1px solid #444;
    `;
    header.innerHTML = `<span style="font-weight:bold;">Dynamic VRAM Stats</span>`;

    const collapseBtn = document.createElement("span");
    collapseBtn.textContent = "−";
    collapseBtn.style.cssText = `cursor:pointer; font-size:16px; padding:0 4px; color:${COLOR_TEXT_DIM};`;
    header.appendChild(collapseBtn);
    panel.appendChild(header);

    // Content area
    const content = document.createElement("div");
    content.id = "dynamicvramstats-content";
    content.style.cssText = `padding: 8px; flex: 1; overflow-y: auto;`;
    panel.appendChild(content);

    // Collapse toggle
    let collapsed = false;
    let savedHeight = null;
    collapseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        collapsed = !collapsed;
        content.style.display = collapsed ? "none" : "block";
        collapseBtn.textContent = collapsed ? "+" : "−";
        if (collapsed) {
            savedHeight = panel.style.height;
            panel.style.height = "auto";
            panel.style.resize = "none";
            header.style.borderRadius = "8px";
            header.style.borderBottom = "none";
        } else {
            panel.style.height = savedHeight;
            panel.style.resize = "both";
            header.style.borderRadius = "8px 8px 0 0";
            header.style.borderBottom = "1px solid #444";
        }
    });


    // Dragging
    let dragX = 0, dragY = 0, isDragging = false;
    header.addEventListener("mousedown", (e) => {
        isDragging = true;
        dragX = e.clientX - panel.offsetLeft;
        dragY = e.clientY - panel.offsetTop;
        document.addEventListener("mousemove", onDrag);
        document.addEventListener("mouseup", onDragEnd);
    });
    function onDrag(e) {
        if (!isDragging) return;
        panel.style.left = (e.clientX - dragX) + "px";
        panel.style.top = (e.clientY - dragY) + "px";
        panel.style.right = "auto";
        panel.style.bottom = "auto";
    }
    function onDragEnd() {
        isDragging = false;
        document.removeEventListener("mousemove", onDrag);
        document.removeEventListener("mouseup", onDragEnd);
    }

    document.body.appendChild(panel);
    return content;
}

// Compute the largest cell size that fits all model grids within width and availableHeight.
// pageCounts is an array of page counts per visible model.
function computeGridLayout(pageCounts, width, availableHeight) {
    let cellSize = 1;
    let cols = 1;
    for (let trySize = Math.floor(width / 2); trySize >= 1; trySize--) {
        const tryCols = Math.floor(width / trySize);
        let totalRows = 0;
        for (const count of pageCounts) {
            totalRows += Math.ceil(count / tryCols);
        }
        if (totalRows * trySize <= availableHeight) {
            cellSize = trySize;
            cols = tryCols;
            break;
        }
    }
    return { cellSize, cols };
}

function renderModel(container, model, displayName, cellSize, cols, gridWidth) {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "margin-bottom: 8px;";

    const vbar = model.vbar;
    const residentMB = vbar.resident_count * PAGE_SIZE_MB;
    const totalMB = vbar.used_pages * PAGE_SIZE_MB;

    const pages = vbar.residency;
    const count = pages.length;

    // Model header with page count
    const label = document.createElement("div");
    label.style.cssText = "margin-bottom: 4px;";
    label.innerHTML = `
        <div style="display:flex; justify-content:space-between;">
            <span>${displayName} <span style="color:${COLOR_TEXT_DIM}">(${count} pages)</span></span>
            <span style="color:${COLOR_TEXT_DIM}">${residentMB}/${totalMB} MB</span>
        </div>
        ${model.filename ? `<div style="color:${COLOR_TEXT_DIM}; font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${model.filename}</div>` : ""}
    `;
    wrapper.appendChild(label);

    // Hide grid if no pages are resident
    if (count === 0 || vbar.resident_count === 0) {
        container.appendChild(wrapper);
        return;
    }

    const rows = Math.ceil(count / cols);
    const canvasHeight = rows * cellSize;

    const canvas = document.createElement("canvas");
    canvas.width = gridWidth;
    canvas.height = canvasHeight;
    canvas.style.cssText = `border-radius: 3px; width: ${gridWidth}px; height: ${canvasHeight}px;`;

    canvas.title = `${model.name}: ${vbar.resident_count}/${count} pages resident (${PAGE_SIZE_MB}MB each)`;

    const ctx = canvas.getContext("2d");

    // Fill background
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, gridWidth, canvasHeight);

    const gap = cellSize > 2 ? 1 : 0;
    for (let i = 0; i < count; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col * cellSize;
        const y = row * cellSize;
        const status = pages[i];

        if (status & 2) {
            ctx.fillStyle = COLOR_PINNED;
        } else if (status & 1) {
            ctx.fillStyle = COLOR_RESIDENT;
        } else {
            ctx.fillStyle = COLOR_ABSENT;
        }
        ctx.fillRect(x, y, cellSize - gap, cellSize - gap);
    }

    wrapper.appendChild(canvas);
    container.appendChild(wrapper);
}

function renderVramBar(container, data, dynamicModels, displayNames, barWidth) {
    const totalMB = data.total_vram_mb;
    const freeMB = data.free_vram_mb;
    const usedMB = totalMB - freeMB;

    // Calculate per-model resident MB
    let vbarResidentMB = 0;
    const segments = [];
    dynamicModels.forEach((model, i) => {
        const mb = model.vbar.resident_count * PAGE_SIZE_MB;
        vbarResidentMB += mb;
        if (mb > 0) {
            segments.push({
                name: displayNames[i],
                mb,
                color: MODEL_COLORS[i % MODEL_COLORS.length]
            });
        }
    });

    const otherMB = Math.max(0, usedMB - vbarResidentMB);

    const wrapper = document.createElement("div");
    wrapper.style.cssText = "margin-bottom: 10px;";

    // Label
    const label = document.createElement("div");
    label.style.cssText = `margin-bottom: 4px; display:flex; justify-content:space-between;`;
    label.innerHTML = `
        <span>VRAM Usage</span>
        <span style="color:${COLOR_TEXT_DIM}">${usedMB}/${totalMB} MB</span>
    `;
    wrapper.appendChild(label);

    // Stacked bar
    const barHeight = 16;
    const bar = document.createElement("div");
    bar.style.cssText = `
        width: ${barWidth}px;
        height: ${barHeight}px;
        background: ${COLOR_FREE};
        border-radius: 3px;
        overflow: hidden;
        display: flex;
    `;

    for (const seg of segments) {
        const pct = (seg.mb / totalMB) * 100;
        const segEl = document.createElement("div");
        segEl.style.cssText = `width:${pct}%; height:100%; background:${seg.color};`;
        segEl.title = `${seg.name}: ${seg.mb} MB`;
        bar.appendChild(segEl);
    }

    if (otherMB > 0) {
        const pct = (otherMB / totalMB) * 100;
        const segEl = document.createElement("div");
        segEl.style.cssText = `width:${pct}%; height:100%; background:${COLOR_OTHER};`;
        segEl.title = `Other: ${otherMB} MB`;
        bar.appendChild(segEl);
    }

    wrapper.appendChild(bar);

    // Bar legend (model names with colors)
    const barLegend = document.createElement("div");
    barLegend.style.cssText = `margin-top: 4px; font-size: 10px; color: ${COLOR_TEXT_DIM};`;
    let legendItems = segments.map(s =>
        `<span style="white-space:nowrap;"><span style="color:${s.color};">■</span> ${s.name}</span>`
    );
    if (otherMB > 0) {
        legendItems.push(`<span style="white-space:nowrap;"><span style="color:${COLOR_OTHER};">■</span> Other</span>`);
    }
    legendItems.push(`<span style="white-space:nowrap;"><span style="color:${COLOR_FREE};">■</span> Free</span>`);
    barLegend.innerHTML = legendItems.join(" &nbsp;");
    wrapper.appendChild(barLegend);

    container.appendChild(wrapper);
}

function renderStatus(container, data) {
    container.innerHTML = "";

    if (!data.aimdo_enabled) {
        container.innerHTML = `<div style="color:${COLOR_TEXT_DIM}; padding: 8px;">Dynamic VRAM not active</div>`;
        return;
    }

    const gridWidth = getGridWidth(container);
    const dynamicModels = data.models.filter(m => m.is_dynamic && m.vbar);

    // Compute deduped display names
    const nameCounts = {};
    dynamicModels.forEach((model) => {
        nameCounts[model.name] = (nameCounts[model.name] || 0) + 1;
    });
    const nameIndex = {};
    const displayNames = dynamicModels.map((model) => {
        if (nameCounts[model.name] > 1) {
            nameIndex[model.name] = (nameIndex[model.name] || 0) + 1;
            return `${model.name} #${nameIndex[model.name]}`;
        }
        return model.name;
    });

    // VRAM usage bar — always visible
    renderVramBar(container, data, dynamicModels, displayNames, gridWidth);

    if (dynamicModels.length === 0) {
        container.innerHTML += `<div style="color:${COLOR_TEXT_DIM}; padding: 4px;">No models loaded yet</div>`;
        return;
    }

    // Separator
    const sep = document.createElement("div");
    sep.style.cssText = "border-top: 1px solid #333; margin-bottom: 8px;";
    container.appendChild(sep);

    // Page legend
    const legend = document.createElement("div");
    legend.style.cssText = `
        display: flex;
        gap: 10px;
        margin-bottom: 10px;
        font-size: 10px;
        color: ${COLOR_TEXT_DIM};
    `;
    legend.innerHTML = `
        <span title="Resident: the page is currently loaded in VRAM"><span style="color:${COLOR_RESIDENT};">■</span> Resident</span>
        <span title="Absent: the page is not in VRAM, will be loaded on demand"><span style="color:${COLOR_ABSENT};">■</span> Absent</span>
        <span title="Pinned: the page is in VRAM and locked for active use"><span style="color:${COLOR_PINNED};">■</span> Pinned</span>
    `;
    container.appendChild(legend);

    // Count models that will have visible grids
    const visibleGridModels = dynamicModels.filter(
        m => m.vbar.residency.length > 0 && m.vbar.resident_count > 0
    );

    // Measure actual height used by rendered children (VRAM bar, separator, legend)
    let usedHeight = 0;
    for (const child of container.children) {
        usedHeight += child.offsetHeight;
        const style = getComputedStyle(child);
        usedHeight += parseFloat(style.marginTop) + parseFloat(style.marginBottom);
    }
    // Add container padding (8px top + 8px bottom)
    usedHeight += 16;
    // Per-model label overhead: name line + filename + margins
    const perModelOverhead = 42;
    const availableGridHeight = Math.max(20,
        container.clientHeight - usedHeight - dynamicModels.length * perModelOverhead
    );

    // Compute shared cell size to fit all grids in available height
    const pageCounts = visibleGridModels.map(m => m.vbar.residency.length);
    const { cellSize, cols } = computeGridLayout(pageCounts, gridWidth, availableGridHeight);

    dynamicModels.forEach((model, i) => {
        renderModel(container, model, displayNames[i], cellSize, cols, gridWidth);
    });
}

let lastData = null;

async function pollStatus(container) {
    try {
        const resp = await fetch("/dynamicvramstats/status");
        if (resp.ok) {
            lastData = await resp.json();
            renderStatus(container, lastData);
        }
    } catch (e) {
        // Silently ignore fetch errors
    }
}

app.registerExtension({
    name: "dynamicvramstats",
    settings: [
        {
            id: "dynamicvramstats.pollInterval",
            name: "Poll interval (seconds)",
            type: "number",
            defaultValue: DEFAULT_POLL_INTERVAL_S,
            tooltip: "How often to poll VRAM status, in seconds",
        },
    ],
    async setup() {
        // Check if aimdo introspection is available
        try {
            const resp = await fetch("/dynamicvramstats/status");
            if (!resp.ok) return;
            const data = await resp.json();
            if (data.aimdo_available === false) {
                console.warn("[dynamicvramstats] Required aimdo functions not found. Plugin disabled.");
                return;
            }
            lastData = data;
        } catch (e) {
            return;
        }

        const content = createPanel();
        const panel = content.parentElement;

        let intervalId = null;
        function startPolling() {
            if (intervalId) clearInterval(intervalId);
            const seconds = app.extensionManager.setting.get("dynamicvramstats.pollInterval") || DEFAULT_POLL_INTERVAL_S;
            intervalId = setInterval(() => pollStatus(content), seconds * 1000);
        }

        renderStatus(content, lastData);
        startPolling();

        // Re-render on panel resize so grids adapt to new width
        const observer = new ResizeObserver(() => {
            if (lastData) {
                renderStatus(content, lastData);
            }
        });
        observer.observe(panel);
    }
});
