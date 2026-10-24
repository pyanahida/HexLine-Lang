// dialog.js
function showDialog(promptText, isMasked) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'hexline-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'hexline-dialog';

    const label = document.createElement('div');
    label.className = 'hexline-dialog-label';
    label.textContent = promptText;

    const input = document.createElement('input');
    input.type = isMasked ? 'text' : 'text'; // 后续可以拓展为 password
    input.className = 'hexline-dialog-input';

    const btn = document.createElement('button');
    btn.textContent = 'Submit';
    btn.className = 'hexline-dialog-btn';

    const submit = () => {
      const val = input.value;
      document.body.removeChild(overlay);
      resolve(val);
    };

    btn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });

    dialog.appendChild(label);
    dialog.appendChild(input);
    dialog.appendChild(btn);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    input.focus();
  });
}
