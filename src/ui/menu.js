(() => {
  'use strict';
  const LW = window.LW;

  function Menu(app) {
    this.app = app;
    this.panel = document.getElementById('panelMenu');
    this.panelHelp = document.getElementById('panelHelp');
    this.panelArrest = document.getElementById('panelArrest');

    this.btnMenu = document.getElementById('btnMenu');
    this.btnHelp = document.getElementById('btnHelp');
    this.btnDebug = document.getElementById('btnDebug');

    this.btnContinue = document.getElementById('btnContinue');
    this.btnNew = document.getElementById('btnNew');
    this.btnCloseMenu = document.getElementById('btnCloseMenu');

    this.btnCloseHelp = document.getElementById('btnCloseHelp');
    this.toggleLowPower = document.getElementById('toggleLowPower');

    this.btnComply = document.getElementById('btnComply');
    this.btnResist = document.getElementById('btnResist');

    this.btnMenu.addEventListener('click', (e) => {
      e.preventDefault();
      this.openMenu();
    });
    this.btnHelp.addEventListener('click', (e) => {
      e.preventDefault();
      this.openHelp();
    });
    this.btnDebug.addEventListener('click', (e) => {
      e.preventDefault();
      LW.flags.debug = !LW.flags.debug;
      this.app.ui.toast(LW.flags.debug ? 'Debug overlay ON' : 'Debug overlay OFF');
    });

    this.btnCloseMenu.addEventListener('click', (e) => {
      e.preventDefault();
      this.closeMenu();
    });
    this.btnCloseHelp.addEventListener('click', (e) => {
      e.preventDefault();
      this.closeHelp();
    });

    this.btnNew.addEventListener('click', (e) => {
      e.preventDefault();
      this.app.newGame();
      this.closeMenu();
    });
    this.btnContinue.addEventListener('click', (e) => {
      e.preventDefault();
      this.app.continueGame();
      this.closeMenu();
    });

    this.toggleLowPower.addEventListener('change', () => {
      LW.flags.lowPower = !!this.toggleLowPower.checked;
      LW.storage.saveOptions({ lowPower: LW.flags.lowPower });
      this.app.ui.toast(LW.flags.lowPower ? 'Low power mode ON' : 'Low power mode OFF');
    });

    // Arrest panel (wired later by law system)
    this.btnComply.addEventListener('click', (e) => {
      e.preventDefault();
      this.hideArrest();
      this.app.ui.toast('You comply. (Arrest flow not yet wired.)');
    });
    this.btnResist.addEventListener('click', (e) => {
      e.preventDefault();
      this.hideArrest();
      this.app.ui.toast('You resist. (Combat escalation not yet wired.)');
    });
  }

  Menu.prototype.sync = function () {
    this.btnContinue.disabled = !LW.storage.hasSave();
    const opts = LW.storage.loadOptions();
    if (opts && typeof opts.lowPower === 'boolean') {
      LW.flags.lowPower = opts.lowPower;
      this.toggleLowPower.checked = !!opts.lowPower;
    }
  };

  Menu.prototype.openMenu = function () {
    this.sync();
    this.panel.classList.add('show');
  };
  Menu.prototype.closeMenu = function () {
    this.panel.classList.remove('show');
  };

  Menu.prototype.openHelp = function () {
    this.panelHelp.classList.add('show');
  };
  Menu.prototype.closeHelp = function () {
    this.panelHelp.classList.remove('show');
  };

  Menu.prototype.showArrest = function (text) {
    const body = document.getElementById('arrestBody');
    body.textContent = text || 'A guard blocks your path.';
    this.panelArrest.classList.add('show');
  };
  Menu.prototype.hideArrest = function () {
    this.panelArrest.classList.remove('show');
  };

  LW.Menu = Menu;
})();

