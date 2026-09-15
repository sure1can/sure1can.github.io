/**
 * Fact & Task Separator — standalone, model-agnostic analysis skill.
 * The MVP UI uses the deterministic reference implementation below so its
 * most important safety rule can be tested without exposing an API key.
 * A future server route can replace analyze() with a JSON-schema model call.
 */
const OTHER_GUESS = /(是不是|觉得|认为|嫌|不在乎|不愿意|讨厌|烦我|对我有意见|靠不住|不可靠|不喜欢)/;
const FUTURE_GUESS = /(以后|将来|未来|一定会|肯定会|再也|总会|会不会)/;
const FEELING_WORDS = /(不安|害怕|焦虑|担心|失落|难过|生气|委屈|恐惧|紧张|羞愧|内耗|烦|压力大)/;
const DECISION_WORDS = /(我决定|我已经决定|我会|我打算|我选择|我答应|我说了|我提出|我发了|我问了)/;

function splitSentences(text) {
  return text.replace(/\n+/g, '。').split(/[。！？!?；;]+/).map(s => s.trim()).filter(Boolean);
}
function quote(s, max = 80) { return s.length > max ? s.slice(0, max) + '…' : s; }
function hasAny(s, re) { return re.test(s); }
function confidence(type, source) { return type === 'fact' ? '高' : source.length > 14 ? '中' : '低'; }
function item(text, kind, evidence, note) { return { text: quote(text), kind, evidence: quote(evidence || text), note: note || '', confidence: confidence(kind, text) }; }

export function analyze(input = {}) {
  const text = String(input.story || '').trim();
  const sentences = splitSentences(text);
  const anchor = String(input.anchor || '固定锚点行为').trim() || '固定锚点行为';
  const boundary = String(input.boundary || '').trim();
  const facts = [], feelings = [], interpretations = [], others = [], future = [], decisions = [], unknowns = [];
  sentences.forEach(s => {
    if (hasAny(s, FEELING_WORDS)) feelings.push(item(s, 'feeling', s, '这是你正在经历的感受，不等于外部事实。'));
    if (hasAny(s, FUTURE_GUESS)) future.push(item(s, 'future', s, '尚未发生的未来，不能从当前信息直接推出。'));
    if (hasAny(s, OTHER_GUESS)) others.push(item(s, 'assumption', s, '涉及别人心理或态度，除非对方明确说过，否则先作为假设。'));
    if (hasAny(s, DECISION_WORDS)) decisions.push(item(s, 'decision', s, '这是你明确做过或决定过的事。'));
    const explicitQuote = /明确说|明确表示|说[：:「“\"]/.test(s);
    const isGuess = !explicitQuote && (hasAny(s, OTHER_GUESS) || hasAny(s, FUTURE_GUESS) || /我很麻烦|我要求太多|我不该|我太贪心/.test(s));
    const isFeeling = hasAny(s, FEELING_WORDS);
    if (!isGuess && !isFeeling && !/可能|也许|也有可能|不知道/.test(s)) facts.push(item(s, 'fact', s, '接近可由聊天记录、行为或明确说法确认的内容。'));
    if (/不知道|还没|没有回复|未回复|没看到|不确定|尚未/.test(s)) unknowns.push(item(s, 'unknown', s, '当前缺少可以确认它的信息。'));
  });
  if (!facts.length && sentences.length) facts.push(item('输入中暂时没有足够明确、可核对的事实。', 'fact', text, '需要先补充时间、行为、原话或结果。'));
  if (!unknowns.length && (others.length || future.length)) unknowns.push(item('对方真实想法、后续结果目前未知。', 'unknown', others[0]?.text || future[0]?.text || text, '没有新信息时，不把未知填成结论。'));
  const allAssumptions = [...others, ...future];
  const keyAssumption = allAssumptions[0] || item('目前没有识别到明确的他人动机或未来预测。', 'assumption', text || '暂无输入', '如果没有证据，就不需要强行补一个结论。');
  const mutationPoint = findMutationPoint(sentences);
  const mixedProblems = buildProblems(text, facts, feelings, allAssumptions, decisions);
  const evidence = allAssumptions.map(a => ({ conclusion: a.text, supportingFacts: facts.slice(0, 2).map(f => f.text), enough: false, missing: a.kind === 'future' ? '未来是否真的发生，以及中间的新信息' : '对方的明确回应、原话或可观察行为', confidence: '低' }));
  const chain = buildChain(facts, others, future, feelings);
  const isWaiting = /没有回复|未回复|等待|还没回|没看见/.test(text) && !/我问了|我发了|我提出/.test(text) ? '有效等待' : (/没有回复|未回复|等待|还没回|没看见/.test(text) ? '有效等待' : '待确认');
  const myTasks = [{ text: decisions.length ? '确认自己已经表达过的需求或决定，并记录下一步最小验证动作。' : '把能由你确认的一项现实信息写下来。', reason: decisions[0]?.text || '当前输入' }];
  const otherTasks = [{ text: '对方是否回应、如何理解或是否愿意，是对方需要决定的部分。', reason: others[0]?.text || '他人的心理不能由你代替确认' }];
  const shared = mixedProblems.some(p => /(共同|伴侣|室友|合作|支出|规则)/.test(p.title)) ? [{ text: '如果涉及共同规则、共同支出或合作，需要双方拿到新信息后协商。', reason: '共同课题不能被一方单方面推断' }] : [];
  const boundaryCrossings = detectBoundaryCrossings(text, others, future);
  const oneSmallAction = pickAction(text, facts, anchor);
  const thinkingStopReason = isWaiting === '有效等待' ? '你能处理的部分已经处理完成，剩余信息需要等待对方回复；继续推演不会增加新的事实。' : allAssumptions.length ? '当前推演已经到达证据边界；剩余内容需要新信息，而不是继续想象。' : '先把当前可核对的信息整理好，再决定是否需要下一步。';
  return { schemaVersion:'0.1', input:{story:text,boundary,anchor}, mixedProblems, mutationPoint, facts, feelings, interpretations, assumptions_about_others:others, future_predictions:future, decisions, unknowns, evidenceChains:evidence, assumptionChains:chain, myTasks, othersTasks:otherTasks, sharedTasks:shared, futureTasks:future.map(f=>({text:f.text,reason:'尚未发生，目前不需要提前解决'})), boundaryCrossings, validEmotions:feelings.length ? feelings.map(f=>({text:f.text,reason:'感受有现实来源，但不自动证明最后的结论'})) : [{text:'情绪尚未被明确写出',reason:'可以先只处理事实，不需要强行命名感受'}], unsupportedConclusions:allAssumptions.map(a=>a.text), needs_action_now:myTasks, does_not_need_action_now:[...otherTasks,...future.map(f=>({text:f.text,reason:'未来课题'}))], waitingType:isWaiting, thinkingStopReason, oneSmallAction, reasoning_evidence:evidence, confidence:'中' };
}
function findMutationPoint(ss) { const index = ss.findIndex(s => hasAny(s, OTHER_GUESS) || hasAny(s, FUTURE_GUESS) || /我要求太多|我很麻烦|我不该/.test(s)); return index >= 0 ? { text:ss[index], index, explanation:'从这句话开始，叙述从可观察事件转向对他人、未来或自己的结论。', confidence:'中' } : { text:'暂未发现明显转折点。', index:-1, explanation:'当前输入主要停留在可观察事件或感受层面。', confidence:'中' }; }
function buildProblems(text, facts, feelings, assumptions, decisions) { const out=[]; if (/钱|生活费|贷款|支出|现金|费用|花/.test(text)) out.push({title:'现实资金与支出',detail:'现在能否覆盖已知支出，需要用金额和时间核对。',confidence:'高'}); if (/回复|消息|联系|说|答应|给|帮助|领导|爸爸|伴侣|室友|对方/.test(text)) out.push({title:'一次具体的回应或承诺',detail:'谁说了什么、做了什么，以及现在还缺哪条回应。',confidence:'高'}); if (assumptions.length) out.push({title:'对他人态度的判断',detail:'“他怎么想”目前是待验证假设，不与行为本身混写。',confidence:'低'}); if (feelings.length) out.push({title:'我的情绪与责任感',detail:'感受可以被承认，但不自动决定谁该负责。',confidence:'中'}); if (decisions.length) out.push({title:'我已经做出的决定',detail:'保留用户边界，只检查下一步是否有可验证动作。',confidence:'高'}); return out.length ? out : [{title:'把混合叙述拆成可处理的小块',detail:'先补充可观察的时间、原话和已完成动作。',confidence:'高'}]; }
function buildChain(facts, others, future, feelings) { const chain=[]; if(facts[0]) chain.push({type:'fact',label:'事实',text:facts[0].text}); if(others[0]) chain.push({type:'assumption',label:'猜测',text:others[0].text}); if(future[0]) chain.push({type:'future',label:'预测',text:future[0].text}); if(feelings[0]) chain.push({type:'feeling',label:'情绪',text:feelings[0].text}); return chain; }
function detectBoundaryCrossings(text, others, future) { const out=[]; if(others.some(x=>/要求太多|麻烦|不愿意|拒绝/.test(x.text))) out.push('替别人拒绝自己：对方还没有明确拒绝，你已经先替对方下结论。'); if(others.some(x=>/觉得我|对我有意见|烦我/.test(x.text))) out.push('替别人定义心理：你可以观察行为，但不能代替对方确认内心。'); if(future.length) out.push('把未来问题提前背到今天：未来课题先标记，不需要现在一次解决。'); return out; }
function pickAction(text, facts, anchor) { if(/消息|回复|没回|未回复/.test(text)) return '在你设定的合理等待时间到了之后，只发送一次：“你看到我上一条了吗？”'; if(/桌面|房间|乱/.test(text)) return '整理眼前最乱的一小块桌面，完成后就停。'; if(/文件|资料/.test(text)) return '把一个文件夹里最明显的 5 个文件归位，完成后就停。'; if(/明天|衣服/.test(text)) return '准备好明天要穿的一套衣服，完成后就停。'; return '做一件 5 分钟内能结束的具体小事：把眼前一个杯子洗好并放回原位。'; }

export const testCases = [
  {name:'爸爸没有回复',story:'爸爸问我生活费要2500还是3000，我说3000，因为最近医疗支出比较多。但是他半天没回复。我还是会想是不是我要多了。'},
  {name:'承诺金额变化',story:'对方答应给2000，最后给了1000。我很失落，也担心以后出大事他也靠不住。'},
  {name:'室友吵闹',story:'室友晚上吵，我提出晚上安静一点的需求，室友不爽。我怀疑是不是我要求太多。'},
  {name:'领导未回复',story:'工作消息发出几个小时没回复，我开始猜领导是不是对我有意见。'},
  {name:'明确事实',story:'对方明确说：“你的要求太多了”。'}
];

if (typeof window === 'undefined') {
  // Node smoke test: node skill/fact-task-separator.js is intentionally not the runner
  // because this file is an ES module consumed by the browser and test harness.
}

