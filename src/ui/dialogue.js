(() => {
  'use strict';
  const LW = window.LW;

  function Dialogue() {
    this.panel = document.getElementById('panelDialogue');
    this.title = document.getElementById('dlgTitle');
    this.body = document.getElementById('dlgBody');
    this.choices = document.getElementById('dlgChoices');
    this.btnClose = document.getElementById('btnDlgClose');

    this.active = false;
    this._onClose = null;

    this.btnClose.addEventListener('click', (e) => {
      e.preventDefault();
      this.close();
    });
  }

  Dialogue.prototype.open = function ({ title, body, choices, onClose }) {
    this.active = true;
    this._onClose = onClose || null;
    this.title.textContent = title || 'Dialogue';
    this.body.textContent = body || '';

    // Clear choices
    while (this.choices.firstChild) this.choices.removeChild(this.choices.firstChild);

    (choices || []).forEach((c) => {
      const btn = document.createElement('button');
      btn.className = 'btn btnWide';
      btn.textContent = c.label;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (c.onPick) c.onPick();
      });
      this.choices.appendChild(btn);
    });

    this.panel.classList.add('show');
  };

  Dialogue.prototype.close = function () {
    if (!this.active) return;
    this.active = false;
    this.panel.classList.remove('show');
    if (this._onClose) this._onClose();
    this._onClose = null;
  };

  LW.Dialogue = Dialogue;
})();

