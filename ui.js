const $file = document.getElementById('fileInput');
const $run = document.getElementById('runBtn');
const $code = document.getElementById('codeBox');
const $con = document.getElementById('console');
const $exampleSelect = document.getElementById('exampleSelect');

$file.addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => { $code.value = r.result; };
  r.readAsText(f, 'utf-8');
});

// 修复：在点击按钮时，重置所有状态并正确调用异步的 runLoop
$run.addEventListener('click', async () => {
  $con.textContent = '';
  vars = {}; labels = {}; pc = 0; running = true; pendingInput = null;
  areaStack = [];
  if (globalThis.loopCounters) globalThis.loopCounters = {};

  try {
    const res = parse($code.value);
    if (res.err) { err(0, res.err); return; }
    currentProg = res.prog;
    currentEncoding = res.encoding;

    for (const ins of currentProg) {
      const m = ins.text.match(/^label\s+(#[a-zA-Z0-9_]+)$/);
      if (m) labels[m[1]] = currentProg.indexOf(ins);
    }

    const match = buildMatches(currentProg);
    if (match.err) { err(match.err.line, match.err.msg); return; }
    currentMatch = match;

    // 注意这里：因为 runLoop 是 async 的，需要 await 或者直接调用让它自己跑
    await runLoop();
  } catch (e) {
    err(0, 'Fatal Error: ' + e.message);
  }
});

function out(s) { 
  $con.textContent += s; 
  $con.scrollTop = $con.scrollHeight;
}

function err(line, msg) {
  $con.textContent += (($con.textContent && !$con.textContent.endsWith('\n')) ? '\n' : '') + `Error line ${line}: ${msg}\n`;
  $con.scrollTop = $con.scrollHeight;
  running = false;
}

async function loadExamples() {
  try {
    let apiUrl = '';
    if (location.hostname.includes('github.io')) {
      const user = location.hostname.split('.')[0];
      const repo = location.pathname.split('/')[1];
      apiUrl = `https://api.github.com/repos/${user}/${repo}/contents/example`;
    }
    if (!apiUrl) return;

    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error('Directory not found');
    const files = await res.json();
    if (Array.isArray(files)) {
      const hxlFiles = files.filter(f => f.name.endsWith('.hxl') && f.type === 'file');
      hxlFiles.forEach(file => {
        const opt = document.createElement('option');
        opt.value = file.download_url; 
        opt.textContent = file.name;
        $exampleSelect.appendChild(opt);
      });
    }
  } catch (e) {
    console.log('No examples found.');
  }
}

loadExamples();

$exampleSelect.addEventListener('change', async (e) => {
  const url = e.target.value;
  if (!url) return;
  try {
    const res = await fetch(url);
    if (res.ok) $code.value = await res.text();
    else alert('Failed to load example file.');
  } catch (err) { alert('Error loading example.'); }
});
