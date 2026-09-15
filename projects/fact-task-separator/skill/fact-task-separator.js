/**
 * Fact & Task Separator — direct separation engine.
 * Deterministic reference implementation for the local-first MVP.
 */
const OTHER_GUESS = /(是不是|觉得|认为|嫌|不在乎|不愿意|讨厌|烦我|对我有意见|靠不住|不可靠|不喜欢|针对我|看不起我|故意)/;
const FUTURE_GUESS = /(以后|将来|未来|一定会|肯定会|再也|总会|会不会|迟早|最后会)/;
const FEELING_WORDS = /(不安|害怕|焦虑|担心|失落|难过|生气|委屈|恐惧|紧张|羞愧|内耗|烦|压力大|伤心|崩溃|心里堵)/;
const SELF_CONCLUSION = /(我要求太多|我太贪心|我不该|我很麻烦|我没用|我不值得|我是不是错了|都是我的错|我太敏感|我做不好)/;
const DECISION_WORDS = /(我决定|我已经决定|我会|我打算|我选择|我答应|我说了|我提出|我发了|我问了|我拒绝|我同意)/;
const UNKNOWN_WORDS = /(不知道|还没|没有回复|未回复|没看到|不确定|尚未|没有确认|没告诉我|无法确定)/;
const ACTION_WORDS = /(发|问|提出|说明|答应|给了|收到|回复|联系|见面|搬|住|工作|上课|支付|转账|签|预约|吵|打断|拒绝|同意|改变)/;
const splitUnits = (text) => String(text).replace(/\n+/g, '。').split(/[。！？!?；;]+/).flatMap((sentence) => sentence.split(/(?=(?:所以|因此|但我还是|我还是|我觉得|我想|我担心|我害怕|我怀疑|是不是|可能|也许|会不会))/)).map((s) => s.trim()).filter(Boolean);
const isExplicitFact = (text) => /明确说|明确表示|原话|说[：:「“"]/.test(text);
const factPart = (text) => { const match = text.match(/^(.+?)(?:，|,|\s)(?:所以|因此|但我还是|我还是|我觉得|我想|我担心|我害怕|我怀疑|是不是|可能|也许|会不会).+$/); return match ? match[1].trim() : text; };
const item = (text, kind, note, evidence = text) => ({text:String(text), kind, note, evidence:String(evidence), confidence:kind === 'fact' || kind === 'decision' ? '高' : String(text).length > 16 ? '中' : '低'});
export function analyze(input = {}) {
  const text = String(input.story || '').trim(), units = splitUnits(text), anchor = String(input.anchor || '固定锚点行为').trim() || '固定锚点行为', boundary = String(input.boundary || '').trim();
  const facts=[], feelings=[], interpretations=[], others=[], future=[], decisions=[], unknowns=[];
  for (const unit of units) {
    const explicit=isExplicitFact(unit), hasFuture=FUTURE_GUESS.test(unit), hasOther=OTHER_GUESS.test(unit)&&!explicit, hasFeeling=FEELING_WORDS.test(unit), hasSelf=SELF_CONCLUSION.test(unit), hasDecision=DECISION_WORDS.test(unit), hasUnknown=UNKNOWN_WORDS.test(unit);
    if (hasFeeling) feelings.push(item(unit,'feeling','这是感受，不自动证明外部结论。'));
    if (hasFuture) future.push(item(unit,'future','尚未发生，先放进未来课题。'));
    if (hasOther) others.push(item(unit,'assumption','涉及他人心理或态度，需要对方原话或行为确认。'));
    if (hasSelf&&!hasOther) interpretations.push(item(unit,'interpretation','这是对自己的评价，不等于事件本身。'));
    if (hasDecision) decisions.push(item(unit,'decision','这是你已经做过或决定过的部分。'));
    if (hasUnknown) unknowns.push(item(unit,'unknown','当前缺少可以确认它的信息。'));
    const observable=explicit||ACTION_WORDS.test(unit)||/\d|今天|昨天|前天|上午|下午|晚上|小时|分钟|几天|上周|本周/.test(unit);
    const clean=factPart(unit);
    if (explicit) facts.push(item(unit,'fact','这是对方明确说出的原话，先按事实保留。',unit));
    else if (observable && !hasFuture&&!hasOther&&!hasSelf&&!hasFeeling) facts.push(item(clean,'fact','可由记录、原话、时间、金额或行为核对。',unit));
    else if (observable && clean!==unit && !/可能|也许|会不会/.test(clean)) facts.push(item(clean,'fact','这是同一句中可单独核对的部分。',unit));
  }
  if (!facts.length&&units.length) facts.push(item('目前没有足够具体的可核对事实。','fact','请补充时间、原话、金额、行为或结果。',text));
  if (!unknowns.length&&(others.length||future.length)) unknowns.push(item('对方真实想法和后续结果，目前都还未知。','unknown','没有新信息时，不把未知写成结论。'));
  const assumptions=others.concat(interpretations,future), hasReply=/没有回复|未回复|没回|还没回|等待|没看见/.test(text), sharedSignal=/(共同|伴侣|室友|家人|合作|团队|一起|规则|费用|支出)/.test(text);
  const mixedProblems=[];
  if(facts.length)mixedProblems.push({title:'发生了什么',detail:'先保留可观察的行为、原话、时间和数量。',confidence:'高'});
  if(assumptions.length)mixedProblems.push({title:'我在事件上加了什么结论',detail:'把对他人的猜测、对自己的评价和未来预测单独放置。',confidence:'中'});
  if(feelings.length)mixedProblems.push({title:'我的感受',detail:'情绪需要被承认，但不负责替你证明结论。',confidence:'高'});
  if(hasReply||sharedSignal||decisions.length)mixedProblems.push({title:'下一步课题',detail:'只处理现在能由你完成或与他人共同确认的部分。',confidence:'高'});
  if(!mixedProblems.length)mixedProblems.push({title:'信息还不够具体',detail:'先补充一条可以被别人复核的事实。',confidence:'高'});
  const myTask=hasReply?'记录消息发送时间，并设一个明确的再次查看时间；在这之前不补发、不替对方解释。':/钱|生活费|贷款|支出|现金|费用|花/.test(text)?'把已知金额、截止时间和必须支出列成三行，只核对数字，不先判断谁对谁错。':/室友|邻居|吵|噪音|打扰/.test(text)?'写下你需要的具体行为和时间，例如“23点后降低音量”，准备好一次清楚表达。':decisions.length?'把你已经做过的决定写成一句可核对的记录，再确认还缺哪一条新信息。':'选一个今天能完成、5分钟内结束的动作，完成后停止继续推演。';
  const myTasks=[{text:myTask,reason:'你可以直接控制或完成'}], othersTasks=[{text:'对方是否回复、如何理解、是否愿意，以及对方最终怎么选择，归对方负责。',reason:'不能替对方完成决定'}], sharedTasks=sharedSignal?[{text:'涉及共同规则、共同支出或合作的部分，要等双方拿到事实后一起确认。',reason:'共同课题需要双方参与'}]:[];
  const futureTasks=future.length?future.map((f)=>({text:f.text,reason:'尚未发生，不是今天必须解决的课题'})):[{text:'目前没有需要提前解决的未来事件。',reason:'先回到今天的事实'}];
  const boundaryCrossings=[]; if(others.some((x)=>/觉得我|对我有意见|烦我|不喜欢|看不起我/.test(x.text)))boundaryCrossings.push('你正在替对方定义内心：只能记录对方的行为或原话，不能代替对方确认想法。'); if(others.some((x)=>/要求太多|麻烦|不愿意|拒绝/.test(x.text))||interpretations.length)boundaryCrossings.push('你正在替别人或替自己下结论：先把“发生了什么”和“这说明什么”拆开。'); if(future.length)boundaryCrossings.push('你把未来课题带到了今天：今天只需要处理可控制的下一步。');
  const reasoning=assumptions.map((a)=>({conclusion:a.text,supportingFacts:facts.slice(0,3).map((f)=>f.text),enough:false,missing:a.kind==='future'?'未来是否真的发生，以及中间的新信息':a.kind==='interpretation'?'对自己的评价不能靠这件事直接证明':'对方的明确回应、原话或可观察行为',confidence:'低'}));
  return {schemaVersion:'0.2',input:{story:text,boundary,anchor},directAnswer:{facts:facts.map((f)=>f.text),assumptions:assumptions.map((a)=>a.text),myTask,notMyTask:othersTasks[0].text,futureTask:futureTasks[0].text},mixedProblems,mutationPoint:(units.find((u)=>OTHER_GUESS.test(u)||FUTURE_GUESS.test(u)||SELF_CONCLUSION.test(u))?{text:units.find((u)=>OTHER_GUESS.test(u)||FUTURE_GUESS.test(u)||SELF_CONCLUSION.test(u)),explanation:'从这里开始，叙述从事件转向解释、评价或预测。',confidence:'中'}:{text:'暂未发现明显转折点。',explanation:'当前内容主要是事实或感受。',confidence:'中'}),facts,feelings,interpretations,assumptions_about_others:others,future_predictions:future,decisions,unknowns,evidenceChains:reasoning,assumptionChains:[],myTasks,othersTasks,sharedTasks,futureTasks,boundaryCrossings,validEmotions:feelings.length?feelings.map((f)=>({text:f.text,reason:'感受有现实来源，但不自动证明最后的结论'})):[{text:'情绪尚未被明确写出',reason:'可以先处理事实，不需要强行命名情绪'}],unsupportedConclusions:assumptions.map((a)=>a.text),waitingType:hasReply?'有效等待':'现在可行动',thinkingStopReason:hasReply?'你能做的动作已经明确，剩余信息只能来自对方；继续猜不会产生新事实。':assumptions.length?'已经到达证据边界；剩余内容需要新信息，不是继续想象。':'先完成一个可核对的小动作，再决定是否需要下一步。',oneSmallAction:myTask,reasoning_evidence:reasoning,confidence:'中'};
}
export const testCases=[
{name:'爸爸没有回复',story:'爸爸问我生活费要2500还是3000，我说3000，因为最近医疗支出比较多。但是他半天没回复。我还是会想是不是我要多了。'},
{name:'承诺金额变化',story:'对方答应给2000，最后给了1000。我很失落，也担心以后出大事他也靠不住。'},
{name:'室友吵闹',story:'室友晚上吵，我提出晚上安静一点的需求，室友不爽。我怀疑是不是我要求太多。'},
{name:'领导未回复',story:'工作消息发出几个小时没回复，我开始猜领导是不是对我有意见。'},
{name:'明确事实',story:'对方明确说：“你的要求太多了”。'}
];