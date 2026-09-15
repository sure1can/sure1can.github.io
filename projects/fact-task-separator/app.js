const OTHER_GUESS = /(是不是|觉得|认为|嫌|不在乎|不愿意|讨厌|烦我|对我有意见|靠不住|不可靠|不喜欢|针对我|看不起我|故意)/;
const FUTURE_GUESS = /(以后|将来|未来|一定会|肯定会|再也|总会|会不会|迟早|最后会)/;
const FEELING_WORDS = /(不安|害怕|焦虑|担心|失落|难过|生气|委屈|恐惧|紧张|羞愧|内耗|烦|压力大|伤心|崩溃|心里堵)/;
const SELF_CONCLUSION = /(我要求太多|我太贪心|我不该|我很麻烦|我没用|我不值得|我是不是错了|都是我的错|我太敏感|我做不好)/;
const DECISION_WORDS = /(我决定|我已经决定|我会|我打算|我选择|我答应|我说了|我提出|我发了|我问了|我拒绝|我同意)/;
const UNKNOWN_WORDS = /(不知道|还没|没有回复|未回复|没看到|不确定|尚未|没有确认|没告诉我|无法确定)/;
const ACTION_WORDS = /(发|问|提出|说明|答应|给了|收到|回复|联系|见面|搬|住|工作|上课|支付|转账|签|预约|吵|打断|拒绝|同意|改变)/;
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const quote = (value, max = 130) => String(value).length > max ? String(value).slice(0, max) + '…' : String(value);
const splitUnits = (text) => {
  const sentences = String(text).replace(/\n+/g, '。').split(/[。！？!?；;]+/).map((s) => s.trim()).filter(Boolean);
  const units = [];
  sentences.forEach((sentence) => {
    const pieces = sentence.split(/(?=(?:所以|因此|但我还是|我还是|我觉得|我想|我担心|我害怕|我怀疑|是不是|可能|也许|会不会))/).map((s) => s.trim()).filter(Boolean);
    pieces.forEach((piece) => units.push(piece));
  });
  return units;
};
const makeItem = (text, kind, note, evidence = text) => ({ text:quote(text), kind, note, evidence:quote(evidence), confidence:kind === 'fact' || kind === 'decision' ? '高' : text.length > 16 ? '中' : '低' });
const isExplicitFact = (text) => /明确说|明确表示|原话|说[：:「“"]/.test(text);
const factPart = (text) => {
  const match = text.match(/^(.+?)(?:，|,|\s)(?:所以|因此|但我还是|我还是|我觉得|我想|我担心|我害怕|我怀疑|是不是|可能|也许|会不会).+$/);
  return match ? match[1].trim() : text;
};

function analyze({ story = '', boundary = '', anchor = '固定锚点行为' } = {}) {
  const text = String(story).trim();
  const units = splitUnits(text);
  const facts = [], feelings = [], interpretations = [], others = [], future = [], decisions = [], unknowns = [];
  units.forEach((unit) => {
    const explicit = isExplicitFact(unit);
    const hasFuture = FUTURE_GUESS.test(unit);
    const hasOtherGuess = OTHER_GUESS.test(unit) && !explicit;
    const hasFeeling = FEELING_WORDS.test(unit);
    const hasSelfConclusion = SELF_CONCLUSION.test(unit);
    const hasDecision = DECISION_WORDS.test(unit);
    const hasUnknown = UNKNOWN_WORDS.test(unit);
    if (hasFeeling) feelings.push(makeItem(unit, 'feeling', '这是你此刻真实的感受，但它不自动证明外部结论。'));
    if (hasFuture) future.push(makeItem(unit, 'future', '这件事还没有发生，先放进未来课题，不提前当成事实。'));
    if (hasOtherGuess) others.push(makeItem(unit, 'assumption', '这是对他人想法或态度的推断，需要对方原话或行为才能确认。'));
    if (hasSelfConclusion && !hasOtherGuess) interpretations.push(makeItem(unit, 'interpretation', '这是对自己的评价或结论，不等同于事件本身。'));
    if (hasDecision) decisions.push(makeItem(unit, 'decision', '这是你已经表达、做过或决定过的部分，属于你的课题。'));
    if (hasUnknown) unknowns.push(makeItem(unit, 'unknown', '这里确实缺少信息，未知不需要被想象填满。'));
    const observable = explicit || ACTION_WORDS.test(unit) || /\d|今天|昨天|前天|上午|下午|晚上|小时|分钟|几天|上周|本周/.test(unit);
    const canBeFact = explicit || observable;
    if (explicit) {
      facts.push(makeItem(unit, 'fact', '这是对方明确说出的原话，先按事实保留。', unit));
    } else if (canBeFact && !hasFuture && !hasOtherGuess && !hasSelfConclusion && !hasFeeling) {
      facts.push(makeItem(factPart(unit), 'fact', '可以通过记录、聊天原话、金额、时间或可观察行为核对。', unit));
    } else if (canBeFact && (hasOtherGuess || hasSelfConclusion || hasFuture || hasFeeling)) {
      const clean = factPart(unit);
      if (clean && clean !== unit && !/可能|也许|会不会/.test(clean)) facts.push(makeItem(clean, 'fact', '这是同一句中可以被单独核对的部分。', unit));
    }
  });
  if (!facts.length && units.length) facts.push(makeItem('目前没有足够具体的可核对事实。', 'fact', '请补充时间、原话、金额、行为或结果。', text));
  if (!unknowns.length && (others.length || future.length)) unknowns.push(makeItem('对方真实想法和后续结果，目前都还未知。', 'unknown', '没有新信息时，不把未知写成结论。'));
  const assumptions = others.concat(interpretations, future);
  const mutation = units.find((unit) => OTHER_GUESS.test(unit) || FUTURE_GUESS.test(unit) || SELF_CONCLUSION.test(unit));
  const hasReply = /没有回复|未回复|没回|还没回|等待|没看见/.test(text);
  const sharedSignal = /(共同|伴侣|室友|家人|合作|团队|一起|规则|费用|支出)/.test(text);
  const mixedProblems = [];
  if (facts.length) mixedProblems.push({ title:'发生了什么', detail:'先保留可观察的行为、原话、时间和数量。', confidence:'高' });
  if (others.length || interpretations.length || future.length) mixedProblems.push({ title:'我在事件上加了什么结论', detail:'把对他人的猜测、对自己的评价和未来预测单独放置。', confidence:'中' });
  if (feelings.length) mixedProblems.push({ title:'我的感受', detail:'情绪需要被承认，但不负责替你证明结论。', confidence:'高' });
  if (hasReply || sharedSignal || decisions.length) mixedProblems.push({ title:'下一步课题', detail:'只处理现在能由你完成或与他人共同确认的部分。', confidence:'高' });
  if (!mixedProblems.length) mixedProblems.push({ title:'信息还不够具体', detail:'先补充一条可以被别人复核的事实。', confidence:'高' });
  const directTask = hasReply
    ? '记录消息发送时间，并设一个明确的再次查看时间；在这之前不补发、不替对方解释。'
    : /钱|生活费|贷款|支出|现金|费用|花/.test(text)
      ? '把已知金额、截止时间和必须支出列成三行，只核对数字，不先判断谁对谁错。'
      : /室友|邻居|吵|噪音|打扰/.test(text)
        ? '写下你需要的具体行为和时间，例如“23点后降低音量”，准备好一次清楚表达。'
        : decisions.length
          ? '把你已经做过的决定写成一句可核对的记录，再确认还缺哪一条新信息。'
          : '选一个今天能完成、5分钟内结束的动作，完成后停止继续推演。';
  const myTasks = [{ text:directTask, reason:'你可以直接控制或完成' }];
  const othersTasks = [{ text:'对方是否回复、如何理解、是否愿意，以及对方最终怎么选择，归对方负责。', reason:'不能替别人完成决定' }];
  const sharedTasks = sharedSignal ? [{ text:'涉及共同规则、共同支出或合作的部分，要等双方拿到事实后一起确认。', reason:'共同课题需要双方参与' }] : [];
  const futureTasks = future.length ? future.map((item) => ({ text:item.text, reason:'尚未发生，不是今天必须解决的课题' })) : [{ text:'目前没有需要提前解决的未来事件。', reason:'先回到今天的事实' }];
  const boundaryCrossings = [];
  if (others.some((item) => /觉得我|对我有意见|烦我|不喜欢|看不起我/.test(item.text))) boundaryCrossings.push('你正在替对方定义内心：只能记录对方的行为或原话，不能代替对方确认想法。');
  if (others.some((item) => /要求太多|麻烦|不愿意|拒绝/.test(item.text)) || interpretations.length) boundaryCrossings.push('你正在替别人或替自己下结论：先把“发生了什么”和“这说明什么”拆开。');
  if (future.length) boundaryCrossings.push('你把未来课题带到了今天：今天只需要处理可控制的下一步。');
  const waitingType = hasReply ? '有效等待' : '现在可行动';
  const reasoning = assumptions.map((item) => ({ conclusion:item.text, supportingFacts:facts.slice(0, 3).map((fact) => fact.text), enough:false, missing:item.kind === 'future' ? '未来是否真的发生，以及中间的新信息' : item.kind === 'interpretation' ? '对自己的评价不能靠这件事直接证明' : '对方的明确回应、原话或可观察行为', confidence:'低' }));
  const chain = [];
  if (facts[0]) chain.push({ type:'fact', label:'事实', text:facts[0].text });
  if (feelings[0]) chain.push({ type:'feeling', label:'感受', text:feelings[0].text });
  if (others[0]) chain.push({ type:'assumption', label:'对他人的猜测', text:others[0].text });
  if (interpretations[0]) chain.push({ type:'interpretation', label:'对自己的结论', text:interpretations[0].text });
  if (future[0]) chain.push({ type:'future', label:'未来预测', text:future[0].text });
  const response = {
    schemaVersion:'0.2',
    input:{ story:text, boundary:String(boundary).trim(), anchor:String(anchor).trim() || '固定锚点行为' },
    directAnswer:{
      facts:facts.map((item) => item.text),
      assumptions:assumptions.map((item) => item.text),
      myTask:myTasks[0].text,
      notMyTask:othersTasks[0].text,
      futureTask:futureTasks[0].text
    },
    mixedProblems, mutationPoint:mutation ? { text:mutation.text, explanation:'从这里开始，叙述从事件转向解释、评价或预测。', confidence:'中' } : { text:'暂未发现明显转折点。', explanation:'当前内容主要是事实或感受。', confidence:'中' },
    facts, feelings, interpretations, assumptions_about_others:others, future_predictions:future, decisions, unknowns,
    evidenceChains:reasoning, assumptionChains:chain, myTasks, othersTasks, sharedTasks, futureTasks,
    boundaryCrossings,
    validEmotions:feelings.length ? feelings.map((item) => ({ text:item.text, reason:'感受有现实来源，但不自动证明最后的结论' })) : [{ text:'情绪尚未被明确写出', reason:'可以先处理事实，不需要强行命名情绪' }],
    unsupportedConclusions:assumptions.map((item) => item.text),
    waitingType,
    thinkingStopReason:hasReply ? '你能做的动作已经明确，剩余信息只能来自对方；继续猜不会产生新事实。' : assumptions.length ? '已经到达证据边界；剩余内容需要新信息，不是继续想象。' : '先完成一个可核对的小动作，再决定是否需要下一步。',
    oneSmallAction:directTask,
    reasoning_evidence:reasoning,
    confidence:'中'
  };
  return response;
}

function tag(kind, label) { return '<span class="tag ' + kind + '">' + label + '</span>'; }
function itemHtml(item, index) {
  const kind = item.kind === 'fact' ? 'fact' : item.kind === 'future' ? 'future' : item.kind === 'assumption' ? 'assumption' : item.kind === 'interpretation' ? 'other' : 'other';
  const label = item.kind === 'fact' ? '事实' : item.kind === 'future' ? '未来预测' : item.kind === 'assumption' ? '对他人的猜测' : item.kind === 'interpretation' ? '对自己的评价' : item.kind === 'feeling' ? '感受' : item.kind === 'decision' ? '我的决定' : '未知';
  return '<div class="evidence-item"><div class="evidence-meta">' + tag(kind, label) + '<span class="confidence">确定度：' + esc(item.confidence || '中') + '</span></div><p>' + esc(item.text) + '</p><div class="item-note">' + esc(item.note || '') + '</div>' + (item.kind === 'fact' ? '' : '<button class="why-button" data-evidence="' + index + '">为什么这样分？</button>') + '</div>';
}
function accordion(title, body, open) { return '<details class="accordion" ' + (open ? 'open' : '') + '><summary><strong>' + title + '</strong><span class="chevron">⌄</span></summary><div class="accordion-body">' + body + '</div></details>'; }
function taskCard(title, text, className, reason) { return '<div class="task-box ' + className + '"><h4>' + title + '</h4><p>' + esc(text) + '</p><small>' + esc(reason || '') + '</small></div>'; }
function directCard(title, text, className, kicker) { return '<div class="direct-card ' + className + '"><div class="direct-kicker">' + kicker + '</div><h3>' + title + '</h3><p>' + esc(text) + '</p></div>'; }

function render(result) {
  $('#resultsSection').classList.remove('hidden');
  $('#resultTime').textContent = new Date().toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
  const firstFact = result.facts[0] ? result.facts[0].text : '待补充';
  const firstAssumption = result.directAnswer.assumptions[0] || '暂无。当前没有把未知写成结论。';
  $('#summaryGrid').innerHTML = '<div class="summary-card summary-primary"><div class="summary-label"><i class="legend-dot fact-dot"></i>我替你确认的事实</div><h3>' + esc(firstFact) + '</h3><p>这是目前可以直接核对的部分。</p></div><div class="summary-card"><div class="summary-label"><i class="legend-dot assumption-dot"></i>混进去的推断</div><h3>' + esc(firstAssumption) + '</h3><p>先不把它当成事实。</p></div><div class="summary-card"><div class="summary-label"><i class="legend-dot other-dot"></i>真正归你的课题</div><h3>1 个</h3><p>' + esc(result.myTasks[0].text) + '</p></div><div class="summary-card"><div class="summary-label"><i class="legend-dot future-dot"></i>现在不用背的</div><h3>先放下</h3><p>对方的反应和未来结果，不是你现在能控制的。</p></div>';
  $('#stopStrip').innerHTML = '<b>先看结论</b><span><strong>你现在先做：</strong>' + esc(result.myTasks[0].text) + '<br /><strong>你现在不用做：</strong>' + esc(result.othersTasks[0].text) + '</span>';
  const directBody = '<div class="direct-grid">' +
    directCard('事实：真的发生了什么', result.directAnswer.facts.join('；') || '暂时没有足够事实。', 'direct-fact', 'A · FACT') +
    directCard('推断：哪些是脑内补上的', result.directAnswer.assumptions.join('；') || '暂时没有识别到推断。', 'direct-assumption', 'B · INFERENCE') +
    directCard('课题：现在归你处理什么', result.directAnswer.myTask, 'direct-mine', 'C · MY TASK') +
    directCard('课题：现在不归你处理什么', result.directAnswer.notMyTask, 'direct-other', 'D · NOT YOUR TASK') +
    '</div>';
  const problemBody = '<div class="item-list">' + result.mixedProblems.map((problem) => '<div class="evidence-item"><div class="evidence-meta"><strong>' + esc(problem.title) + '</strong>' + tag(problem.confidence === '高' ? 'fact' : 'assumption', problem.confidence + '确定') + '</div><p>' + esc(problem.detail) + '</p></div>').join('') + '</div><div class="evidence-item mutation-box"><div class="evidence-meta"><strong>分界线在哪里</strong>' + tag('assumption', '推断 ' + result.mutationPoint.confidence) + '</div><p>' + esc(result.mutationPoint.text) + '<br /><span class="muted">' + esc(result.mutationPoint.explanation) + '</span></p></div>';
  const factsBody = '<p class="section-intro">事实只放可以被记录、原话、金额、时间或行为核对的内容。</p><div class="item-list">' + result.facts.map((item, index) => itemHtml(item, index)).join('') + '</div><div class="item-list secondary-list">' + result.unknowns.map((item, index) => itemHtml(item, index + 100)).join('') + '</div>';
  const inferenceItems = result.assumptions_about_others.concat(result.interpretations, result.future_predictions);
  const inferenceBody = '<p class="section-intro">这些内容不一定错，但目前不能替事实说话。</p><div class="item-list">' + (inferenceItems.map((item, index) => itemHtml(item, index)).join('') || '<div class="empty-state">目前没有识别到需要降级为推断的内容。</div>') + '</div>';
  const chainBody = result.assumptionChains.length ? '<p class="section-intro">从“发生了什么”到“这说明什么”，中间多出来的就是需要证据的那一步。</p><div class="chain">' + result.assumptionChains.map((node) => '<div class="chain-node ' + node.type + '"><div class="chain-marker"><i></i></div><div class="chain-content">' + tag(node.type === 'interpretation' ? 'other' : node.type, node.label) + '<p>' + esc(node.text) + '</p></div></div>').join('') + '</div>' : '<div class="empty-state">目前还没有形成假设链。</div>';
  const tasksBody = '<div class="task-columns">' + taskCard('我的课题', result.myTasks[0].text, 'mine', '你可以完成或控制') + taskCard('对方的课题', result.othersTasks[0].text, 'other', '不能替对方完成') + (result.sharedTasks.length ? taskCard('共同课题', result.sharedTasks[0].text, 'shared', '需要双方确认') : taskCard('共同课题', '目前没有识别到必须共同处理的部分。', 'shared', '暂不单独处理')) + taskCard('未来课题', result.futureTasks[0].text, 'future-box', '尚未发生，先不提前解决') + '</div>' + (result.boundaryCrossings.length ? '<div class="emotion-note boundary-note"><h3>课题越界提醒</h3><p>' + result.boundaryCrossings.map(esc).join('<br />') + '</p></div>' : '');
  const emotionBody = '<div class="task-columns">' + taskCard('允许存在的情绪', result.validEmotions[0].text, '', '情绪本身不需要被消灭') + taskCard('情绪不能自动证明', result.validEmotions[0].reason, '', '感受和事实分开放') + '</div>';
  $('#detailMain').innerHTML = '<div class="direct-answer-block"><div class="direct-answer-title"><span>已经替你拆开</span><small>先读这四格，不用自己再分类</small></div>' + directBody + '</div>' + accordion('01 · 这件事混合了哪些小问题', problemBody, true) + accordion('02 · 逐条核对：事实与推断', factsBody + inferenceBody, true) + accordion('03 · 假设链：哪一步需要证据', chainBody, false) + accordion('04 · 课题分离：谁负责什么', tasksBody, true) + accordion('05 · 情绪和责任分离', emotionBody, false);
  $('#actionAside').innerHTML = '<div class="action-aside"><div class="action-card action-card-direct"><div class="action-kicker">现在就做这一件</div><p class="big-action">' + esc(result.myTasks[0].text) + '</p><div class="action-meta"><b>固定锚点保留：</b>' + esc(result.input.anchor) + '</div></div><div class="emotion-note"><h3>' + esc(result.waitingType) + '</h3><p>' + esc(result.thinkingStopReason) + '</p></div></div>';
  document.querySelectorAll('[data-evidence]').forEach((button) => button.addEventListener('click', () => {
    const index = Number(button.dataset.evidence);
    const evidence = result.reasoning_evidence[index] || result.reasoning_evidence[0];
    toast(evidence ? '依据：' + (evidence.supportingFacts.join('；') || '目前没有直接支持它的事实') + '。缺少：' + evidence.missing : '这条内容没有额外证据链。');
  }));
  $('#resultsSection').scrollIntoView({ behavior:'smooth', block:'start' });
}

const HISTORY_KEY = 'fact-task-separator-history';
const SETTINGS_KEY = 'fact-task-separator-settings';
function loadHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; } }
function updateHistoryCount() { $('#historyCount').textContent = loadHistory().length; }
function saveHistory(result) { const history = loadHistory(); history.unshift({ id:Date.now(), story:result.input.story, result, at:new Date().toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }) }); localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 12))); updateHistoryCount(); }
function toast(message) { const node = $('#toast'); node.textContent = message; node.classList.remove('hidden'); clearTimeout(window.__toast); window.__toast = setTimeout(() => node.classList.add('hidden'), 3600); }
function runAnalysis() { const story = $('#storyInput').value.trim(); if (!story) { toast('先写下这件事，再开始拆解'); $('#storyInput').focus(); return; } const anchor = $('#anchorInput').value.trim() || $('#defaultAnchor').value.trim() || '固定锚点行为'; const result = analyze({ story, boundary:$('#boundaryInput').value.trim(), anchor }); saveHistory(result); render(result); toast('已经替你拆开：事实、推断和课题都标好了'); }
function openHistory() { const history = loadHistory(); $('#historyList').innerHTML = history.length ? history.map((entry) => '<div class="history-entry"><div><p>' + esc(quote(entry.story, 55)) + '</p><small>' + esc(entry.at) + '</small></div><button data-load="' + entry.id + '">打开案例</button></div>').join('') : '<div class="empty-state">还没有保存的案例。完成一次分析后，它会出现在这里。</div>'; $('#historyModal').classList.remove('hidden'); document.querySelectorAll('[data-load]').forEach((button) => button.addEventListener('click', () => { const entry = history.find((item) => item.id == button.dataset.load); if (entry) { $('#storyInput').value = entry.result.input.story; $('#boundaryInput').value = entry.result.input.boundary; $('#anchorInput').value = entry.result.input.anchor; $('#storyInput').dispatchEvent(new Event('input')); render(entry.result); $('#historyModal').classList.add('hidden'); } })); }
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
document.querySelector('[data-example="dad"]').addEventListener('click', () => { $('#storyInput').value = '爸爸问我生活费要2500还是3000，我说3000，因为最近医疗支出比较多。但是他半天没回复。我还是会想是不是我要多了。'; $('#storyInput').dispatchEvent(new Event('input')); $('#anchorInput').value = $('#defaultAnchor').value || '上课时背单词'; $('#storyInput').focus(); });
loadSettings(); updateHistoryCount();