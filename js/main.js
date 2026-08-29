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


  /* ------------------------------------------------------------ THANKS PAGE
     The thank you page is reached from six different forms: the landing form and
     one per partner. HubSpot redirects each of them to /thanks/, and the partner
     ones carry ?p=<slug> so the page can name who is going to call.

     Three things worth knowing about this.

     The parameter is the only signal that survives. document.referrer does not:
     the submission goes through HubSpot, so it arrives stripped or pointing at
     their domain.

     The slug is looked up in a roster-generated allow-list and the NAME comes
     from that list, never from the URL. Printing ?p= would let anyone put words
     in the mouth of a site carrying a bank's name, and textContent alone would
     not stop that: the string would be inert, but it would still read as ours.

     The page ships with "the Alliance" already in the HTML. This only ever
     narrows it to a partner, so no JS, a stripped parameter, an unknown slug and
     a failed fetch all land on wording that is correct rather than broken.     */
  var who = document.getElementById('thanks-who');

  if (who) {
    try {
      var slug = new URLSearchParams(window.location.search).get('p');
      var source = document.getElementById('partner-names');

      if (slug && source) {
        var names = JSON.parse(source.textContent);

        // hasOwnProperty, not a truthiness check: a slug of "constructor" or
        // "toString" would otherwise resolve up the prototype chain.
        if (Object.prototype.hasOwnProperty.call(names, slug)) {
          who.textContent = names[slug];
        }
      }
    } catch (e) {
      /* Leave the Alliance wording in place. Nothing here is worth breaking the
         page over, and the default is already a correct sentence. */
    }
  }

}());
