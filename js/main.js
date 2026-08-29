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
     HubSpot's v4 loader has a silent failure mode worth catching. If its render
     endpoint errors, it rewrites our `hs-form-html` class to `hs-form-frame` and
     loads the IFRAMED embed instead. The form still submits, so nothing looks
     broken, but every style in the HubSpot block of site.css stops applying and
     the page ships looking like stock HubSpot.

     HubSpot always inserts one hidden iframe as the POST target, so a *visible*
     one is the tell. Checked once after the embed has had time to settle.      */
  var embed = document.getElementById('hubspot-form');

  if (embed) {
    /* Poll rather than checking once on a deadline. A fixed timeout cries wolf
       on any slow connection, which trains people to ignore it. This resolves
       the moment the form appears and only complains if it never does. */
    var waited = 0;
    var LIMIT = 15000;

    var poll = setInterval(function () {
      waited += 500;

      var host = embed.querySelector('.hs-form-html, .hs-form-frame');

      /* The real failure signal: HubSpot's loader rewrites the class and loads
         the iframed embed when its render endpoint errors. The form still
         submits; every style in the HubSpot block of site.css stops applying. */
      if (host && host.classList.contains('hs-form-frame')) {
        clearInterval(poll);
        console.error(
          '[strongtail] HubSpot fell back to the iframed embed, so the form is unstyled. ' +
          'Its render endpoint failed. See BUILD-SPEC.md, The form.'
        );
        return;
      }

      if (embed.querySelector('form')) {
        clearInterval(poll);

        /* HubSpot always inserts one hidden iframe as the POST target, so a
           visible one would mean something else rendered the form. */
        var visible = [].filter.call(embed.querySelectorAll('iframe'), function (f) {
          return getComputedStyle(f).display !== 'none';
        });

        if (visible.length) {
          console.error(
            '[strongtail] A visible iframe appeared inside #hubspot-form. Only the hidden ' +
            'submission frame is expected; the form is probably unstyled.'
          );
        }
        return;
      }

      if (waited >= LIMIT) {
        clearInterval(poll);
        console.error(
          '[strongtail] The HubSpot form did not render within ' + LIMIT / 1000 +
          's. Check the portal and form IDs on #hubspot-form.'
        );
      }
    }, 500);
  }


  /* The five partner pages still carry the native stand-in while their HubSpot
     form IDs are outstanding. It has no action, so without this a submit would
     reload the page with every field in the query string. Delete this block with
     the last stand-in. */
  var native = document.getElementById('join-form');

  if (native) {
    native.addEventListener('submit', function (event) {
      event.preventDefault();

      // novalidate is set in the markup so the message below is reachable;
      // ask the browser for its own validation explicitly.
      if (!native.checkValidity()) {
        native.reportValidity();
        return;
      }

      /* Appended, not written into #form-note: on a partner page that element
         carries a real line about where the details go, and overwriting it would
         throw away information the reader needs. */
      var status = native.querySelector('.js-standin-status');

      if (!status) {
        status = document.createElement('p');
        status.className = 'note-sm js-standin-status';
        status.setAttribute('role', 'status');
        native.appendChild(status);
      }

      status.textContent = 'This form is not connected yet. It will submit to HubSpot before launch.';
    });
  }

}());
