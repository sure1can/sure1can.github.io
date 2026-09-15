const OTHER_GUESS = /(是不是|觉得|认为|嫌|不在乎|不愿意|讨厌|烦我|对我有意见|靠不住|不可靠|不喜欢)/;
const FUTURE_GUESS = /(以后|将来|未来|一定会|肯定会|再也|总会|会不会)/;
const FEELING_WORDS = /(不安|害怕|焦虑|担心|失落|难过|生气|委屈|恐惧|紧张|羞愧|内耗|烦|压力大)/;
const DECISION_WORDS = /(我决定|我已经决定|我会|我打算|我选择|我答应|我说了|我提出|我发了|我问了)/;
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const quote = (value, max = 90) => String(value).length > max ? String(value).slice(0, max) + '…' : String(value);
const splitSentences = (text) => text.replace(/\n+/g, '。').split(/[。！？!?；;]+/).map((s) => s.trim()).filter(Boolean);
const makeItem = (text, kind, note) => ({ text: quote(text), kind, confidence: kind === 'fact' ? '高' : String(text).length > 14 ? '中' : '低', note });

function analyze({ story = '', boundary = '', anchor = '固定锚点行为' } = {}) {
  const sentences = splitSentences(story);
  const facts = [], feelings = [], others = [], future = [], decisions = [], unknowns = [];
  sentences.forEach((sentence) => {
    const explicitQuote = /明确说|明确表示|说[：:「“\"]/.test(sentence);
    const isGuess = !explicitQuote && (OTHER_GUESS.test(sentence) || FUTURE_GUESS.test(sentence) || /我很麻烦|我要求太多|我不该|我太贪心/.test(sentence));
    if (FEELING_WORDS.test(sentence)) feelings.push(makeItem(sentence, 'feeling', '感受不等于外部事实。'));
    if (FUTURE_GUESS.test(sentence)) future.push(makeItem(sentence, 'future', '尚未发生的未来，不能从当前信息直接推出。'));
    if (OTHER_GUESS.test(sentence) && !explicitQuote) others.push(makeItem(sentence, 'assumption', '涉及别人心理或态度，先作为假设。'));
    if (DECISION_WORDS.test(sentence)) decisions.push(makeItem(sentence, 'decision', '这是你明确做过或决定过的事。'));
    if (!isGuess && !FEELING_WORDS.test(sentence) && !/可能|也许|也有可能|不知道/.test(sentence)) facts.push(makeItem(sentence, 'fact', '接近可由记录、行为或明确说法确认的内容。'));
    if (/不知道|还没|没有回复|未回复|没看到|不确定|尚未/.test(sentence)) unknowns.push(makeItem(sentence, 'unknown', '当前缺少可以确认它的信息。'));
  });
  if (!facts.length && sentences.length) facts.push(makeItem('输入中暂时没有足够明确、可核对的事实。', 'fact', '需要先补充时间、行为、原话或结果。'));
  if (!unknowns.length && (others.length || future.length)) unknowns.push(makeItem('对方真实想法、后续结果目前未知。', 'unknown', '没有新信息时，不把未知填成结论。'));
  const allAssumptions = [...others, ...future];
  const mutationIndex = sentences.findIndex((s) => OTHER_GUESS.test(s) || FUTURE_GUESS.test(s) || /我要求太多|我很麻烦|我不该/.test(s));
  const mixedProblems = [];
  if (/钱|生活费|贷款|支出|现金|费用|花/.test(story)) mixedProblems.push({ title:'现实资金与支出', detail:'现在能否覆盖已知支出，需要用金额和时间核对。', confidence:'高' });
  if (/回复|消息|联系|说|答应|给|帮助|领导|爸爸|伴侣|室友|对方/.test(story)) mixedProblems.push({ title:'一次具体的回应或承诺', detail:'谁说了什么、做了什么，以及现在还缺哪条回应。', confidence:'高' });
  if (allAssumptions.length) mixedProblems.push({ title:'对他人态度的判断', detail:'“他怎么想”目前是待验证假设，不与行为本身混写。', confidence:'低' });
  if (feelings.length) mixedProblems.push({ title:'我的情绪与责任感', detail:'感受可以被承认，但不自动决定谁该负责。', confidence:'中' });
  if (decisions.length) mixedProblems.push({ title:'我已经做出的决定', detail:'保留用户边界，只检查下一步是否有可验证动作。', confidence:'高' });
  if (!mixedProblems.length) mixedProblems.push({ title:'把混合叙述拆成可处理的小块', detail:'先补充可观察的时间、原话和已完成动作。', confidence:'高' });
  const evidenceChains = allAssumptions.map((assumption) => ({ conclusion:assumption.text, supportingFacts:facts.slice(0, 2).map((f) => f.text), enough:false, missing:assumption.kind === 'future' ? '未来是否真的发生，以及中间的新信息' : '对方的明确回应、原话或可观察行为', confidence:'低' }));
  const assumptionChains = [];
  if (facts[0]) assumptionChains.push({ type:'fact', label:'事实', text:facts[0].text });
  if (others[0]) assumptionChains.push({ type:'assumption', label:'猜测', text:others[0].text });
  if (future[0]) assumptionChains.push({ type:'future', label:'预测', text:future[0].text });
  if (feelings[0]) assumptionChains.push({ type:'feeling', label:'情绪', text:feelings[0].text });
  const boundaryCrossings = [];
  if (others.some((x) => /要求太多|麻烦|不愿意|拒绝/.test(x.text))) boundaryCrossings.push('替别人拒绝自己：对方还没有明确拒绝，你已经先替对方下结论。');
  if (others.some((x) => /觉得我|对我有意见|烦我/.test(x.text))) boundaryCrossings.push('替别人定义心理：你可以观察行为，但不能代替对方确认内心。');
  if (future.length) boundaryCrossings.push('把未来问题提前背到今天：未来课题先标记，不需要现在一次解决。');
  const waitingType = /没有回复|未回复|等待|还没回|没看见/.test(story) ? '有效等待' : '待确认';
  const oneSmallAction = /消息|回复|没回|未回复/.test(story) ? '在你设定的合理等待时间到了之后，只发送一次：“你看到我上一条了吗？”' : /桌面|房间|乱/.test(story) ? '整理眼前最乱的一小块桌面，完成后就停。' : /文件|资料/.test(story) ? '把一个文件夹里最明显的 5 个文件归位，完成后就停。' : /明天|衣服/.test(story) ? '准备好明天要穿的一套衣服，完成后就停。' : '做一件 5 分钟内能结束的具体小事：把眼前一个杯子洗好并放回原位。';
  return { input:{ story, boundary, anchor }, mixedProblems, mutationPoint:{ text:mutationIndex >= 0 ? sentences[mutationIndex] : '暂未发现明显转折点。', explanation:mutationIndex >= 0 ? '从这句话开始，叙述从可观察事件转向对他人、未来或自己的结论。' : '当前输入主要停留在可观察事件或感受层面。', confidence:'中' }, facts, feelings, interpretations:[], assumptions_about_others:others, future_predictions:future, decisions, unknowns, evidenceChains, assumptionChains, myTasks:[{ text:decisions.length ? '确认自己已经表达过的需求或决定，并记录下一步最小验证动作。' : '把能由你确认的一项现实信息写下来。' }], othersTasks:[{ text:'对方是否回应、如何理解或是否愿意，是对方需要决定的部分。' }], sharedTasks:[], futureTasks:future.map((f) => ({ text:f.text, reason:'尚未发生，目前不需要提前解决' })), boundaryCrossings, validEmotions:feelings.length ? feelings.map((f) => ({ text:f.text, reason:'感受有现实来源，但不自动证明最后的结论' })) : [{ text:'情绪尚未被明确写出', reason:'可以先只处理事实，不需要强行命名感受' }], unsupportedConclusions:allAssumptions.map((a) => a.text), waitingType, thinkingStopReason:waitingType === '有效等待' ? '你能处理的部分已经处理完成，剩余信息需要等待对方回复；继续推演不会增加新的事实。' : '当前推演已经到达证据边界；剩余内容需要新信息，而不是继续想象。', oneSmallAction, reasoning_evidence:evidenceChains, confidence:'中' };
}

function tag(kind, label) { return `<span class="tag ${kind}">${label}</span>`; }
function evidenceButton(index) { return `<button class="why-button" data-evidence="${index}">这个判断证据是什么？</button>`; }
function itemHtml(item, index) { const kind = item.kind === 'fact' ? 'fact' : item.kind === 'future' ? 'future' : item.kind === 'assumption' ? 'assumption' : 'other'; const label = item.kind === 'fact' ? '事实' : item.kind === 'future' ? '未来预测' : item.kind === 'assumption' ? '推测' : item.kind === 'feeling' ? '感受' : item.kind === 'decision' ? '已决定' : '未知'; return `<div class="evidence-item"><div class="evidence-meta">${tag(kind, label)} <span class="confidence">强度：${esc(item.confidence || '中')}</span></div><p>${esc(item.text)}</p>${evidenceButton(index)}</div>`; }
function accordion(title, body, open = false) { return `<details class="accordion" ${open ? 'open' : ''}><summary><strong>${title}</strong><span class="chevron">⌄</span></summary><div class="accordion-body">${body}</div></details>`; }
function problemHtml(problem) { const kind = problem.confidence === '低' ? 'assumption' : 'fact'; return `<div class="evidence-item"><div class="evidence-meta"><strong>${esc(problem.title)}</strong>${tag(kind, '推断 ' + esc(problem.confidence))}</div><p>${esc(problem.detail)}</p></div>`; }
function chainHtml(node) { return `<div class="chain-node ${node.type}"><div class="chain-marker"><i></i></div><div class="chain-content">${tag(node.type, node.label)}<p>${esc(node.text)}</p></div></div>`; }
function taskHtml(title, text, className) { return `<div class="task-box ${className}"><h4>${title}</h4><p>${esc(text)}</p></div>`; }

function render(result) {
  $('#resultsSection').classList.remove('hidden');
  $('#resultTime').textContent = new Date().toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
  const keyAssumption = result.assumptions_about_others[0] || result.future_predictions[0];
  $('#summaryGrid').innerHTML = `<div class="summary-card"><div class="summary-label"><i class="legend-dot fact-dot"></i>混合问题</div><h3>${result.mixedProblems.length} 个</h3><p>先拆开，再分别处理。</p></div><div class="summary-card"><div class="summary-label"><i class="legend-dot fact-dot"></i>关键事实</div><h3>${esc(result.facts[0]?.text || '待补充')}</h3><p>强度：高 · 可继续核对</p></div><div class="summary-card"><div class="summary-label"><i class="legend-dot assumption-dot"></i>关键假设</div><h3>${esc(keyAssumption?.text || '暂无')}</h3><p>目前证据不足，不能写成事实。</p></div><div class="summary-card"><div class="summary-label"><i class="legend-dot fact-dot"></i>现在属于我</div><h3>1 个最小动作</h3><p>${esc(result.oneSmallAction)}</p></div>`;
  $('#stopStrip').innerHTML = `<b>∥</b><span><strong>思考终止点：</strong>${esc(result.thinkingStopReason)}</span>`;
  const problemsBody = `<div class="item-list">${result.mixedProblems.map(problemHtml).join('')}</div><div class="evidence-item" style="margin-top:12px"><div class="evidence-meta"><strong>问题从哪里开始变质？</strong>${tag('assumption', '推断 ' + esc(result.mutationPoint.confidence))}</div><p>${esc(result.mutationPoint.text)}<br /><span style="color:#667085">${esc(result.mutationPoint.explanation)}</span></p></div>`;
  const factsBody = `<p class="section-intro">只有摄像机、聊天记录或银行流水能确认的内容，才放在这里。</p><div class="item-list">${result.facts.map(itemHtml).join('')}</div>`;
  const assumptions = [...result.assumptions_about_others, ...result.future_predictions, ...result.unknowns];
  const assumptionsBody = `<p class="section-intro">情绪可以是真的；最后那个结论仍然需要证据。</p><div class="item-list">${assumptions.map(itemHtml).join('') || '<div class="empty-state">目前没有需要降级为假设的内容。</div>'}</div>`;
  const chainBody = result.assumptionChains.length ? `<p class="section-intro">这里标出从行为走向结论的那一步。</p><div class="chain">${result.assumptionChains.map(chainHtml).join('')}</div><p class="section-intro" style="margin:10px 0 0">你的情绪是真的，但让你产生情绪的最后那个结论，目前不一定是真的。</p>` : '<div class="empty-state">输入中还没有形成一条假设链。</div>';
  const tasksBody = `<div class="task-columns">${taskHtml('我的课题', result.myTasks[0].text, 'mine')}${taskHtml('对方的课题', result.othersTasks[0].text, 'other')}${taskHtml('共同课题', '若涉及共同规则、共同支出或合作，等拿到新信息后双方协商。', 'shared')}${taskHtml('未来课题', result.futureTasks[0]?.text || '尚未发现需要提前处理的未来事件。', 'future-box')}</div>${result.boundaryCrossings.length ? `<div class="emotion-note" style="margin-top:13px"><h3>课题越界提醒</h3><p>${result.boundaryCrossings.map(esc).join('<br />')}</p></div>` : ''}`;
  const emotionBody = `<div class="task-columns">${taskHtml('允许存在的情绪', result.validEmotions[0]?.text || '可以先不命名情绪。', '')}${taskHtml('这个情绪不能自动证明什么', result.validEmotions[0]?.reason || '感受不等于事实。', '')}</div>`;
  $('#detailMain').innerHTML = accordion('01 · 你现在实际上有几个问题', problemsBody, true) + accordion('02 · 事实 / 未知 / 解释', factsBody + assumptionsBody, true) + accordion('03 · 假设链', chainBody, true) + accordion('04 · 开始课题分离', tasksBody) + accordion('05 · 情绪和责任分离', emotionBody);
  $('#actionAside').innerHTML = `<div class="action-aside"><div class="action-card"><h3>今天只额外做这一件</h3><p class="big-action">${esc(result.oneSmallAction)}</p><div class="action-meta"><b>固定锚点保留：</b>${esc(result.input.anchor || '未设置')}</div></div><div class="emotion-note"><h3>${esc(result.waitingType)}</h3><p>如果你已经完成自己的动作，就不需要用更多猜测填充等待。</p></div></div>`;
  document.querySelectorAll('[data-evidence]').forEach((button) => button.addEventListener('click', () => showEvidence(result, Number(button.dataset.evidence))));
  $('#resultsSection').scrollIntoView({ behavior:'smooth', block:'start' });
}

const HISTORY_KEY = 'fact-task-separator-history';
const SETTINGS_KEY = 'fact-task-separator-settings';
function loadHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; } }
function updateHistoryCount() { $('#historyCount').textContent = loadHistory().length; }
function saveHistory(result) { const history = loadHistory(); history.unshift({ id:Date.now(), story:result.input.story, result, at:new Date().toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }) }); localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 12))); updateHistoryCount(); }
function toast(message) { const node = $('#toast'); node.textContent = message; node.classList.remove('hidden'); clearTimeout(window.__toast); window.__toast = setTimeout(() => node.classList.add('hidden'), 3600); }
function showEvidence(result, index) { const evidence = result.reasoning_evidence[index] || result.reasoning_evidence[0]; if (!evidence) return toast('这条内容没有额外证据链'); toast(`证据：${evidence.supportingFacts.join('；') || '暂无直接事实'} · 目前证据不足 · 强度：${evidence.confidence}`); }
function runAnalysis() { const story = $('#storyInput').value.trim(); if (!story) { toast('先写下这件事，再开始拆解'); $('#storyInput').focus(); return; } const anchor = $('#anchorInput').value.trim() || $('#defaultAnchor').value.trim() || '固定锚点行为'; const result = analyze({ story, boundary:$('#boundaryInput').value.trim(), anchor }); saveHistory(result); render(result); toast('已完成一次结构化拆解'); }
function openHistory() { const history = loadHistory(); $('#historyList').innerHTML = history.length ? history.map((entry) => `<div class="history-entry"><div><p>${esc(quote(entry.story, 55))}</p><small>${esc(entry.at)}</small></div><button data-load="${entry.id}">打开案例</button></div>`).join('') : '<div class="empty-state">还没有保存的案例。完成一次分析后，它会出现在这里。</div>'; $('#historyModal').classList.remove('hidden'); document.querySelectorAll('[data-load]').forEach((button) => button.addEventListener('click', () => { const entry = history.find((item) => item.id == button.dataset.load); if (entry) { $('#storyInput').value = entry.result.input.story; $('#boundaryInput').value = entry.result.input.boundary; $('#anchorInput').value = entry.result.input.anchor; render(entry.result); $('#historyModal').classList.add('hidden'); } })); }
function loadSettings() { try { const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); if (settings.anchor) { $('#defaultAnchor').value = settings.anchor; $('#anchorInput').value = settings.anchor; } } catch {} }
function closeModal(id) { $('#' + id).classList.add('hidden'); }

$('#storyInput').addEventListener('input', () => { $('#charCount').textContent = $('#storyInput').value.length + ' 字'; });
$('#analyzeButton').addEventListener('click', runAnalysis);
$('#historyButton').addEventListener('click', openHistory);
$('#settingsButton').addEventListener('click', () => $('#settingsModal').classList.remove('hidden'));
$('#saveSettingsButton').addEventListener('click', () => { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ anchor:$('#defaultAnchor').value.trim() })); closeModal('settingsModal'); toast('设置已保存'); });
document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', () => closeModal(button.dataset.closeModal)));
document.querySelectorAll('.modal-backdrop').forEach((modal) => modal.addEventListener('click', (event) => { if (event.target === modal) modal.classList.add('hidden'); }));
$('#clearButton').addEventListener('click', () => { $('#resultsSection').classList.add('hidden'); window.scrollTo({ top:0, behavior:'smooth' }); toast('结果已收起，输入内容仍保留'); });
$('#newInfoButton').addEventListener('click', () => { $('#storyInput').focus(); toast('把新发生的事实补在原文后面，再重新拆解'); });
document.querySelector('[data-example="dad"]').addEventListener('click', () => { $('#storyInput').value = '爸爸问我生活费要2500还是3000，我说3000，因为最近医疗支出比较多。但是他半天没回复。我知道他也可能只是没看见，但我还是会想是不是我要多了。'; $('#storyInput').dispatchEvent(new Event('input')); $('#anchorInput').value = $('#defaultAnchor').value || '上课时背单词'; $('#storyInput').focus(); });
loadSettings(); updateHistoryCount();

