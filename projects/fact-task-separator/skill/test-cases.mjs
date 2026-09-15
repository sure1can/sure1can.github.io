import { analyze, testCases } from './fact-task-separator.js';
for (const test of testCases) {
  const result = analyze({story:test.story, anchor:'上课时背单词'});
  const bad = result.facts.filter((fact) => /(是不是|以后|靠不住|有意见|多了|要求太多)/.test(fact.text) && !/明确说|明确表示/.test(fact.text));
  if (bad.length) throw new Error(test.name + ': 推断被误标为事实: ' + bad.map((item) => item.text).join(' / '));
  if (!result.directAnswer || !result.directAnswer.myTask) throw new Error(test.name + ': 没有直接课题结论');
  if (test.name === '明确事实' && !result.facts.some((fact) => /明确说.*要求太多/.test(fact.text))) throw new Error('明确事实没有保留为事实');
  console.log('✓ ' + test.name + ': facts=' + result.facts.length + ', assumptions=' + result.assumptions_about_others.length + ', future=' + result.future_predictions.length + ', myTask=ok');
}
console.log('All direct-separation checks passed.');