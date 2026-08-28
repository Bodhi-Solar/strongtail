/* ============================================================================
   Strong Tail Solar Alliance — js/main.js

   Deliberately small. Everything that can work without JavaScript does: the
   roster is generated into the HTML by tools/sync-partners.mjs, the FAQ is
   native <details>, and the form is native HTML. If this file fails to load,
   the page still works.
   ========================================================================= */
(function () {
  'use strict';

  /* --------------------------------------------------------------- HEADER
     Transparent over the hero, then fades in the white glass bar once the
     reader is past it. 420px and the `stuck` class are the contract with
     `.site-header.stuck` in styles/site.css; changing either means changing
     both.                                                                  */
  var header = document.getElementById('hdr');

  if (header) {
    var ticking = false;

    function syncHeader() {
      header.classList.toggle('stuck', window.scrollY > 420);
      ticking = false;
    }

    window.addEventListener('scroll', function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(syncHeader);
      }
    }, { passive: true });

    syncHeader();
  }

  /* ----------------------------------------------------------------- FORM
     The native form is the fallback. When the HubSpot embed is wired up in
     index.html, `hbspt` renders into #hubspot-form and this hands over to it:
     HubSpot then owns validation, spam protection and the three-way
     thank-you redirect, and the block below can be deleted with the native
     form it guards.                                                        */
  var native = document.getElementById('join-form');
  var embed = document.getElementById('hubspot-form');
  var note = document.getElementById('form-note');

  if (native && embed && window.hbspt) {
    embed.hidden = false;
    native.hidden = true;
    return;
  }

  /* TEMPORARY, until HubSpot is wired. The form must not look broken and must
     not silently swallow a real submission, so it validates natively and says
     plainly that it is not connected yet. */
  if (native && note) {
    native.addEventListener('submit', function (event) {
      event.preventDefault();

      // novalidate is set in the markup so the message below is reachable;
      // ask the browser for its own validation explicitly.
      if (!native.checkValidity()) {
        native.reportValidity();
        return;
      }

      note.textContent = 'This form is not connected yet. It will submit to HubSpot before launch.';
    });
  }

}());
