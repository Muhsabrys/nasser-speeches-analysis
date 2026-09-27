let rawCorpus = [];
let filteredCorpus = [];
let sources = [];
let categoryLabels = {};
let summary = {};
let activeLayer = 'all';
let activeDate = 'all';
let activeSource = 'all';
let searchQuery = '';
let timelineChart = null;

const COLORS = {
  dynamic_tags: '#b4232a', rhetoric: '#a15c00', ideology: '#1f5f99',
  power_authority: '#227a5b', geopolitics: '#6b4bb8', narrative: '#087d8f',
  audience_positioning: '#667085'
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const response = await fetch('data.json');
    const data = await response.json();
    rawCorpus = data.discourse_units || [];
    filteredCorpus = [...rawCorpus];
    sources = data.sources || [];
    categoryLabels = data.category_labels || {};
    summary = data.summary || {};

    document.getElementById('subtitle').innerText = data.corpus_metadata.subtitle_ar;

    buildFilters();
    renderTopTags();
    initTimeline();
    renderAll();
    attachListeners();
  } catch (error) {
    document.getElementById('discourseCardsContainer').innerHTML = '<div class="empty">تعذر تحميل البيانات. شغّل الصفحة عبر خادم محلي بسيط مثل: python3 -m http.server</div>';
    console.error(error);
  }
});

function buildFilters() {
  const layerBox = document.getElementById('layerFilterContainer');
  const counts = countCategories(rawCorpus);
  layerBox.innerHTML = `<button data-layer="all" class="layer-btn active"><span>كل الطبقات</span><b>${rawCorpus.length}</b></button>` +
    Object.entries(categoryLabels).map(([key, label]) => `<button data-layer="${key}" class="layer-btn"><span>${label}</span><b>${counts[key] || 0}</b></button>`).join('');

  const dateSelect = document.getElementById('dateFilterSelect');
  const dates = [...new Map(rawCorpus.map(u => [u.date, u.date_ar])).entries()];
  dateSelect.innerHTML = '<option value="all">كل التواريخ</option>' + dates.map(([date, label]) => `<option value="${date}">${label}</option>`).join('');

  const sourceSelect = document.getElementById('sourceFilterSelect');
  sourceSelect.innerHTML = '<option value="all">كل الملفات</option>' + sources.map(s => `<option value="${s.file}">${s.file} · ${s.unit_count} وحدة</option>`).join('');
}

function renderTopTags() {
  const box = document.getElementById('topTags');
  box.innerHTML = (summary.top_tags || []).slice(0, 10).map(t => `<button class="pill" data-search="${t.label_ar}">${t.label_ar} · ${t.count}</button>`).join('');
}

function attachListeners() {
  document.querySelectorAll('.layer-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeLayer = btn.dataset.layer;
    applyFilters();
  }));
  document.getElementById('dateFilterSelect').addEventListener('change', e => { activeDate = e.target.value; applyFilters(); });
  document.getElementById('sourceFilterSelect').addEventListener('change', e => { activeSource = e.target.value; applyFilters(); });
  document.getElementById('searchInput').addEventListener('input', e => { searchQuery = e.target.value.trim(); applyFilters(); });
  document.getElementById('resetFiltersBtn').addEventListener('click', resetFilters);
  document.querySelectorAll('[data-search]').forEach(btn => btn.addEventListener('click', () => {
    document.getElementById('searchInput').value = btn.dataset.search;
    searchQuery = btn.dataset.search;
    applyFilters();
  }));
}

function resetFilters() {
  activeLayer = 'all'; activeDate = 'all'; activeSource = 'all'; searchQuery = '';
  document.getElementById('searchInput').value = '';
  document.getElementById('dateFilterSelect').value = 'all';
  document.getElementById('sourceFilterSelect').value = 'all';
  document.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.layer-btn[data-layer="all"]').classList.add('active');
  closeInspector();
  applyFilters();
}

function applyFilters() {
  const q = normalize(searchQuery);
  filteredCorpus = rawCorpus.filter(unit => {
    if (activeDate !== 'all' && unit.date !== activeDate) return false;
    if (activeSource !== 'all' && unit.source_file !== activeSource) return false;
    if (activeLayer !== 'all' && !unit.annotations.some(a => a.category === activeLayer)) return false;
    if (!q) return true;
    const hay = normalize([unit.text, unit.date_ar, unit.source_file, ...unit.annotations.flatMap(a => [a.tag_ar, a.category_ar, a.explanation_ar])].join(' '));
    return hay.includes(q);
  });
  renderAll();
}

function renderAll() {
  updateStats();
  renderCards();
  updateInsight();
  updateTimeline();
  updateHeatmap();
  updateNetwork();
}

function updateStats() {}

function updateInsight() {
  const top = Object.entries(countCategories(filteredCorpus)).sort((a,b) => b[1]-a[1])[0];
  const dates = new Set(filteredCorpus.map(u => u.date)).size;
  document.getElementById('mainInsight').innerText = filteredCorpus.length
    ? `تقرأ الآن ${filteredCorpus.length} مقطعًا عبر ${dates} تاريخ/تواريخ. الطبقة الأبرز في العينة الحالية هي «${top ? categoryLabels[top[0]] : 'غير محددة'}»، وهي مفتاح جيد لفهم زاوية هذا الجزء من corpus.`
    : 'لا توجد نتائج مطابقة للفلاتر الحالية.';
}

function renderCards() {
  const container = document.getElementById('discourseCardsContainer');
  if (!filteredCorpus.length) {
    container.innerHTML = '<div class="empty">لا توجد مقاطع مطابقة. جرّب تخفيف البحث أو إعادة ضبط الفلاتر.</div>';
    return;
  }
  container.innerHTML = filteredCorpus.map(unit => `
    <article class="card">
      <div class="card-meta"><span>${unit.date_ar}</span><span>${unit.source_file}</span><span>${unit.unit_id}</span></div>
      <div class="arabic-text">${buildAnnotatedText(unit)}</div>
      <div class="card-tags">${unit.annotations.slice(0, 7).map(a => `<span>${a.tag_ar}</span>`).join('')}</div>
    </article>
  `).join('');
}

function buildAnnotatedText(unit) {
  let html = escapeHtml(unit.text);
  const anns = [...unit.annotations].sort((a,b) => (b.span || '').length - (a.span || '').length);
  anns.forEach((ann, index) => {
    const span = escapeHtml(ann.span || '');
    if (!span || !html.includes(span)) return;
    const payload = encodeURIComponent(JSON.stringify({ tag: ann.tag_ar, category: ann.category_ar, explanation: ann.explanation_ar, span: ann.span }));
    html = html.replace(span, `<span class="tag-span span-${ann.category}" onclick="inspectSpan('${payload}')">${span}</span>`);
  });
  return html.replace(/\n/g, '<br>');
}

function inspectSpan(payload) {
  const data = JSON.parse(decodeURIComponent(payload));
  document.getElementById('inspectorBanner').classList.remove('hidden');
  document.getElementById('inspectTag').innerText = data.tag;
  document.getElementById('inspectCategory').innerText = data.category;
  document.getElementById('inspectExplanation').innerText = data.explanation;
  document.getElementById('inspectSpan').innerText = data.span;
}
function closeInspector() { document.getElementById('inspectorBanner').classList.add('hidden'); }

function initTimeline() {
  const ctx = document.getElementById('timelineStreamChart').getContext('2d');
  timelineChart = new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { font: { family: 'Noto Kufi Arabic' }, usePointStyle: true, boxWidth: 8 } },
        tooltip: { rtl: true, titleAlign: 'right', bodyAlign: 'right' }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, font: { family: 'Noto Kufi Arabic' } } },
        y: { beginAtZero: true, grid: { color: 'rgba(102,112,133,.16)' }, ticks: { precision: 0 } }
      }
    }
  });
}

function updateTimeline() {
  if (!timelineChart) return;
  const dates = [...new Map(filteredCorpus.map(u => [u.date, u.date_ar])).entries()];
  const cats = Object.keys(categoryLabels);
  timelineChart.data.labels = dates.map(d => d[1]);
  timelineChart.data.datasets = cats.map(cat => ({
    label: categoryLabels[cat],
    data: dates.map(([date]) => filteredCorpus.filter(u => u.date === date).reduce((sum,u) => sum + u.annotations.filter(a => a.category === cat).length, 0)),
    borderColor: COLORS[cat] || '#98a2b3',
    backgroundColor: alphaColor(COLORS[cat] || '#98a2b3', 0.12),
    fill: true,
    tension: 0.38,
    borderWidth: 2,
    pointRadius: 3,
    pointHoverRadius: 6,
    pointBackgroundColor: COLORS[cat] || '#98a2b3'
  })).filter(ds => ds.data.some(Boolean));
  timelineChart.update();
}

function updateHeatmap() {
  const container = document.getElementById('matrixHeatmap');
  if (!container) return;
  const dates = [...new Map(filteredCorpus.map(u => [u.date, u.date_ar])).entries()];
  const cats = Object.keys(categoryLabels);
  container.innerHTML = '';
  if (!dates.length) {
    container.innerHTML = '<div class="empty">لا توجد بيانات كافية لرسم البصمة.</div>';
    return;
  }

  const values = new Map();
  let max = 1;
  cats.forEach(cat => {
    dates.forEach(([date]) => {
      const value = filteredCorpus
        .filter(u => u.date === date)
        .reduce((sum, u) => sum + u.annotations.filter(a => a.category === cat).length, 0);
      values.set(`${cat}|${date}`, value);
      max = Math.max(max, value);
    });
  });

  const grid = document.createElement('div');
  grid.className = 'heatmap-grid';
  grid.style.setProperty('--date-count', dates.length);
  grid.innerHTML = `
    <div class="heatmap-corner">طبقة التحليل</div>
    ${dates.map(([, label]) => `<div class="heatmap-date">${label}</div>`).join('')}
    ${cats.map(cat => `
      <div class="heatmap-label">${categoryLabels[cat]}</div>
      ${dates.map(([date]) => {
        const value = values.get(`${cat}|${date}`) || 0;
        const opacity = value ? 0.12 + (value / max) * 0.72 : 0.035;
        return `<button class="heatmap-cell" style="background:${alphaColor(COLORS[cat] || '#667085', opacity)}" title="${categoryLabels[cat]} · ${value}">${value || ''}</button>`;
      }).join('')}
    `).join('')}
  `;
  container.appendChild(grid);
}

function updateNetwork() {
  const container = document.getElementById('d3NetworkGraph');
  const width = container.clientWidth || 520;
  const height = container.clientHeight || 330;
  d3.select(container).selectAll('*').remove();
  const tagCounts = new Map();
  filteredCorpus.forEach(u => u.annotations.forEach(a => {
    const item = tagCounts.get(a.tag_ar) || { id: a.tag_ar, category: a.category, count: 0 };
    item.count += 1;
    tagCounts.set(a.tag_ar, item);
  }));
  const nodes = [...tagCounts.values()].sort((a,b)=>b.count-a.count).slice(0, 38);
  const nodeIds = new Set(nodes.map(n => n.id));
  const links = [];
  filteredCorpus.forEach(u => {
    const present = [...new Set(u.annotations.map(a => a.tag_ar).filter(t => nodeIds.has(t)))];
    for (let i=0; i<present.length-1; i++) links.push({ source: present[i], target: present[i+1], value: 1 });
  });
  if (!nodes.length) {
    container.innerHTML = '<div class="empty">لا توجد وسوم كافية لرسم الخريطة.</div>';
    return;
  }
  const svg = d3.select(container).append('svg').attr('width','100%').attr('height','100%').attr('viewBox',[0,0,width,height]);
  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d=>d.id).distance(70))
    .force('charge', d3.forceManyBody().strength(-120))
    .force('center', d3.forceCenter(width/2, height/2))
    .force('collision', d3.forceCollide().radius(d => 12 + d.count));
  const link = svg.append('g').selectAll('line').data(links).join('line').attr('class','link').attr('stroke-width', .8);
  const node = svg.append('g').selectAll('g').data(nodes).join('g').attr('class','node').style('cursor','pointer').on('click', (_, d) => {
    document.getElementById('searchInput').value = d.id; searchQuery = d.id; applyFilters();
  });
  node.append('circle').attr('r', d => Math.min(8 + d.count, 24)).attr('fill', d => COLORS[d.category] || '#98a2b3').attr('opacity', .9);
  node.append('text').text(d => d.id).attr('x', 12).attr('y', 4).attr('font-size','11px').attr('fill','#172033');
  sim.on('tick', () => {
    link.attr('x1', d=>d.source.x).attr('y1', d=>d.source.y).attr('x2', d=>d.target.x).attr('y2', d=>d.target.y);
    node.attr('transform', d=>`translate(${d.x},${d.y})`);
  });
}

function countCategories(corpus) {
  return corpus.reduce((acc, u) => {
    new Set(u.annotations.map(a => a.category)).forEach(cat => acc[cat] = (acc[cat] || 0) + 1);
    return acc;
  }, {});
}
function alphaColor(hex, alpha) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function normalize(s) { return (s || '').toString().toLowerCase().replace(/[إأآا]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[ًٌٍَُِّْـ]/g,''); }
function escapeHtml(s) { return (s || '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])); }
