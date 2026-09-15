import { analyze, testCases } from './fact-task-separator.js';
for (const test of testCases) {
  const result = analyze({story:test.story, anchor:'上课时背单词'});
  const mistaken = result.facts.filter(f => !/明确说|明确表示/.test(f.text) && /(是不是|以后|靠不住|有意见|多了|要求太多)/.test(f.text));
  if (mistaken.length) throw new Error(`${test.name}: 猜测被误标为事实: ${mistaken.map(x=>x.text).join(' / ')}`);
  if (test.name === '明确事实' && !result.facts.some(f => /明确说.*要求太多/.test(f.text))) throw new Error('明确事实: 对方的明确原话没有保留为事实');
  console.log(`✓ ${test.name}: facts=${result.facts.length}, assumptions=${result.assumptions_about_others.length}, future=${result.future_predictions.length}`);
}
console.log('All fact-boundary checks passed.');

