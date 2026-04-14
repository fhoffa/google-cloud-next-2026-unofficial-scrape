#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const [, , fixturePathArg, outputPathArg] = process.argv;

if (!fixturePathArg || !outputPathArg) {
  console.error('Usage: node scripts/evaluate_gem_scheduler_output.mjs <fixture.json> <output.txt>');
  process.exit(2);
}

const fixturePath = path.resolve(fixturePathArg);
const outputPath = path.resolve(outputPathArg);
const fixtureName = path.basename(fixturePath);
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const output = fs.readFileSync(outputPath, 'utf8');

const explorerLinkMatch = output.match(/https:\/\/fhoffa\.github\.io\/google-cloud-next-2026-unofficial-scrape\/\?sessionids=([0-9,]+)/i);
const linkIds = explorerLinkMatch ? explorerLinkMatch[1].split(',').filter(Boolean) : [];
const sessionIdsMentioned = [...new Set([...output.matchAll(/\b([3-9]\d{3,})\b/g)].map((match) => match[1]))];
const lower = output.toLowerCase();

function check(name, pass, detail = '') {
  return { name, pass: Boolean(pass), detail };
}

const checks = [];
checks.push(check('mentions only known fixture session ids', sessionIdsMentioned.every((id) => fixture.sessions.some((session) => String(session.id) === id)), `mentioned ids=${sessionIdsMentioned.join(',') || 'none'}`));
checks.push(check('includes explorer link', Boolean(explorerLinkMatch), explorerLinkMatch?.[0] || 'missing'));
checks.push(check('uses fixture ids in explorer link', linkIds.every((id) => fixture.sessions.some((session) => String(session.id) === id)), `link ids=${linkIds.join(',') || 'none'}`));

if (fixtureName === 'gem-scheduler-default-days.json') {
  checks.push(check('defaults to Wednesday', /wednesday, april 22, 2026/i.test(output)));
  checks.push(check('defaults to Thursday', /thursday, april 23, 2026/i.test(output)));
  checks.push(check('defaults to Friday', /friday, april 24, 2026/i.test(output)));
  checks.push(check('includes strong technical anchors', ['3001', '3003', '3005'].every((id) => sessionIdsMentioned.includes(id) || linkIds.includes(id)), `need 3001,3003,3005 got mentions=${sessionIdsMentioned.join(',')} link=${linkIds.join(',')}`));
}

if (fixtureName === 'gem-scheduler-executive-thursday.json') {
  checks.push(check('stays on Thursday only', !/wednesday, april 22, 2026/i.test(output) && !/friday, april 24, 2026/i.test(output)));
  checks.push(check('includes executive anchors', ['5001', '5003'].every((id) => sessionIdsMentioned.includes(id) || linkIds.includes(id)), `need 5001,5003 got mentions=${sessionIdsMentioned.join(',')} link=${linkIds.join(',')}`));
  checks.push(check('avoids technical-first framing', !/kubernetes debugging lab/i.test(lower) || /tradeoff|deprioritized|not chosen/i.test(lower)));
}

if (fixtureName === 'gem-scheduler-full-fallback.json') {
  checks.push(check('handles full primary candidate', sessionIdsMentioned.includes('4001') || linkIds.includes('4001'), `mentions=${sessionIdsMentioned.join(',')} link=${linkIds.join(',')}`));
  checks.push(check('includes same-slot fallback', sessionIdsMentioned.includes('4002') || /alternative/i.test(lower), `mentions=${sessionIdsMentioned.join(',')}`));
  checks.push(check('mentions full status', /\bfull\b/i.test(output)));
  checks.push(check('mentions line up or cancellations guidance', /line up|cancellation/i.test(lower)));
}

const passed = checks.filter((item) => item.pass).length;
const failed = checks.length - passed;
const result = {
  fixture: fixtureName,
  passed,
  failed,
  score: checks.length ? passed / checks.length : 0,
  checks,
};

console.log(JSON.stringify(result, null, 2));
process.exit(failed ? 1 : 0);
