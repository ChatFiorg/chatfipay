import { validateTheme } from './lib/theme/validateTheme.ts';

async function run() {
  console.log('--- Test 1: Malicious script tag ---');
  const bad = await validateTheme(
    '<div>{{store.name}}</div><script>alert("hacked")</script>{{products}}',
    'body { color: red; }'
  );
  console.log(JSON.stringify(bad, null, 2));

  console.log('\n--- Test 2: Clean valid theme ---');
  const good = await validateTheme(
    '<div><h1>{{store.name}}</h1><div>{{products}}</div></div>',
    'h1 { color: lime; }'
  );
  console.log(JSON.stringify(good, null, 2));

  console.log('\n--- Test 3: Missing placeholder ---');
  const missing = await validateTheme(
    '<div><h1>{{store.name}}</h1></div>',
    'h1 { color: lime; }'
  );
  console.log(JSON.stringify(missing, null, 2));

  console.log('\n--- Test 4: External CSS import ---');
  const badCss = await validateTheme(
    '<div>{{store.name}}{{products}}</div>',
    '@import url("https://evil.com/steal.css"); body { color: blue; }'
  );
  console.log(JSON.stringify(badCss, null, 2));
}

run();
