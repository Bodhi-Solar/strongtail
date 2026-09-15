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
     The thank you page is reached from seven different forms: the landing form and
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
     a failed fetch all land on wording that is correct rather than broken.

     Since 2 Sep 2026 the same lookup narrows the Book a call button's href and
     label, from a second generated table. Same rule: the URL comes from the
     table, never from the URL.

     Since 10 Sept 2026 some slugs are handed to a different partner's calendar,
     and get a different sentence with it. See HANDOFF below.                 */
  var who = document.getElementById('thanks-who');
  var book = document.getElementById('thanks-book');
  var lede = document.getElementById('thanks-lede');

  /* The partners who do not take the booking themselves. JA Solar reps reach out
     directly, and a Scanifly rep contacts the installer the same way, so offering
     a calendar of theirs would be offering something that does not exist, and
     falling back to a button reading "with the Alliance" would bury the person
     who can actually help. Their readers are handed to Climate First Bank for the
     financing side instead, and the sentence says so rather than leaving the
     button to explain itself.

     The two reasons are not identical even though the code path is. JA Solar keep
     no booking calendar at all; Scanifly have simply sent none. That matters only
     for how each one retires, below, and not for what the reader sees.

     A special case on purpose, not a mechanism, and still one at two partners.
     Both entries point at the same calendar, so this is one arrangement that two
     partners share rather than two arrangements. A general handoff table in
     data/meetings.json would still be four moving parts, a shape, a validator, a
     generator branch and a third JSON tag in the page, standing in for one line
     that grew by one key: the mechanism's cost is fixed and the map's is one line
     per partner. The mechanism becomes the right answer when the targets stop
     being the same, or when the rule stops fitting on this line, not when the
     count goes up. Every value is a SLUG, keys into the two generated tables at
     the foot of the page, so the rule the rest of this block is built on is
     untouched: no URL and no partner name is written here, and a crafted ?p= can
     still only ever miss.

     They retire themselves, and independently. The handoff is only taken while
     that partner has no link of their own, so the day either calendar lands in
     data/meetings.json its entry stops applying and the page goes back to naming
     them. Without that, adding a URL would silently do nothing. */
  var HANDOFF = { 'ja-solar': 'climate-first-bank', 'scanifly': 'climate-first-bank' };

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

          /* The button ships pointed at the Alliance's own calendar, which is
             right for the landing form, for an unknown slug, and for a partner
             who has not sent a link. This narrows it to the partner's own
             calendar, and only when there is one: #partner-booking holds only
             partners with a link, so absence from it IS the no-link state.
             A slug in HANDOFF narrows to somebody else's calendar instead, and
             absence from this same table is what makes that possible.

             The href and the label narrow together or not at all, so the button
             never names a calendar it is not opening.

             The slug is a KEY here and nowhere else. It is never concatenated
             into markup and never assigned to href. Everything that reaches the
             DOM, the name, the URL and the handoff sentence's two names, comes
             out of blocks tools/sync-partners.mjs wrote from data/partners.json
             and data/meetings.json, so a crafted ?p= can only ever miss.

             The https test is for the one case the generator cannot see, a
             hand-edited generated block. Three lines is cheap next to a
             javascript: URL in an href. indexOf rather than startsWith, to match
             the rest of this file.

             Deliberately AFTER the name is set: a malformed booking table throws
             into the catch below having already left the sentence right, which is
             the same principle as the shipped default.                         */
          var booking = document.getElementById('partner-booking');

          if (book && booking) {
            var bookings = JSON.parse(booking.textContent);

            /* Whose calendar this reader is being offered. That is the partner
               they enrolled with, except for a slug in HANDOFF above, and then
               only while that partner has sent no link of their own: a real
               link always wins over the special case. */
            var target = slug;

            if (
              Object.prototype.hasOwnProperty.call(HANDOFF, slug) &&
              !Object.prototype.hasOwnProperty.call(bookings, slug) &&
              Object.prototype.hasOwnProperty.call(names, HANDOFF[slug])
            ) {
              target = HANDOFF[slug];
            }

            if (Object.prototype.hasOwnProperty.call(bookings, target)) {
              var url = String(bookings[target]);

              if (url.indexOf('https://') === 0) {
                book.href = url;
                book.textContent = 'Book a call with ' + names[target];

                /* Inside this branch and nowhere else. The sentence only gets to
                   promise a Climate First Bank rep once the button above it is
                   actually opening a Climate First Bank calendar, which is the
                   same "together or not at all" rule the label and the href
                   already follow. A failed lookup leaves the shipped sentence,
                   which is correct rather than broken.

                   Both names come out of the allow-list for the same reason the
                   one in the span does. */
                if (target !== slug && lede) {
                  lede.textContent =
                    'A ' + names[slug] + ' rep will reach out to you directly. Or start with a ' +
                    names[target] + ' rep who can sort out the financing side and point you to the rest.';
                }
              }
            }
          }
        }
      }
    } catch (e) {
      /* Leave the Alliance wording in place. Nothing here is worth breaking the
         page over, and the default is already a correct sentence and a working
         button. */
    }
  }

  /* ---------------------------------------------------------- VIDEO
     Two callers now. The founding partner video on the partner detail pages,
     and the welcome video on the homepage: the pill in the hero opens the same
     lightbox, and the rail beside the Compact runs its own muted loop.

     The card in the rail is a real link to the video on YouTube. This turns it
     into a lightbox, and does it as an upgrade rather than as the mechanism: if
     this file never loads, or the src was not a YouTube URL the generator could
     parse, the anchor is still there and still plays the video. Same rule as the
     rest of the page.

     NOTHING IS REQUESTED FROM YOUTUBE UNTIL A CLICK. The poster is a local image
     and the iframe is built here, on demand, so a reader who never presses play
     never touches youtube.com and is handed no cookie by it. That is the whole
     reason the card is a poster and a link rather than an embed, and it is worth
     keeping: dropping an iframe into the page instead would load about a megabyte
     of player on every partner page whether or not anyone watches.

     autoplay=1 is not the autoplay `docs-internal/CLAUDE.md` rule 2 bans. That
     rule governs page load, and nothing here moves until someone deliberately
     presses a play control. Starting the video is what the press MEANS; making
     them press play twice would be the bug.

     nocookie is youtube.com's own privacy-enhanced host. rel=0 no longer removes
     end-cards, it restricts them to the same channel, which is the behaviour we
     want here anyway: that channel is Bodhi's, and what sits beside a partner
     video is the rest of the Alliance's educational library.                 */
  var vidCards = document.querySelectorAll('a.vid[data-yt]');
  var welcomePill = document.querySelector('[data-welcome-open]');
  var welcomeRail = document.getElementById('welcome-rail');

  /* OPENED STRAIGHT OFF DISK, NOTHING HERE CAN PLAY. YouTube's player refuses to
     configure itself when the embedding page's origin is null, which is exactly
     what file:// gives it, and paints "Video player configuration error" over a
     black box instead. No embed parameter fixes that: the page has to be served
     over http or https for any of these embeds to work.

     That matters here rather than being a curiosity, because these pages are
     meant to open off disk. Asset paths are relative for that reason and
     tools/qa.mjs renders them from file:// on purpose. So the pages keep
     working, they just send you to YouTube instead of embedding it: the partner
     cards are already real links and simply navigate, and the two homepage
     controls open the watch page in a new tab. A broken player is worse than an
     honest link.

     To see the embeds locally, serve the folder:
         python3 -m http.server 8765
         open http://127.0.0.1:8765/                                          */
  var ytEmbeddable = window.location.protocol !== 'file:';

  function ytWatch(id) {
    return 'https://www.youtube.com/watch?v=' + encodeURIComponent(id);
  }

  if (vidCards.length || welcomePill || welcomeRail) {
    var vlb = null;      /* the overlay, built once and reused */
    var vlbFrame = null; /* the 9:16 plate the iframe goes into */
    var vlbClose = null;
    var vlbOpener = null; /* the card that opened it, so focus can go home */

    function vlbBuild() {
      vlb = document.createElement('div');
      vlb.className = 'vlb';
      vlb.setAttribute('role', 'dialog');
      vlb.setAttribute('aria-modal', 'true');
      vlb.hidden = true;

      vlbFrame = document.createElement('div');
      vlbFrame.className = 'vlb__frame';

      vlbClose = document.createElement('button');
      vlbClose.type = 'button';
      vlbClose.className = 'vlb__x';
      vlbClose.setAttribute('aria-label', 'Close video');

      vlb.appendChild(vlbFrame);
      vlb.appendChild(vlbClose);
      document.body.appendChild(vlb);

      vlbClose.addEventListener('click', vlbHide);

      /* Backdrop only. A click that lands on the video itself is a click on the
         player, not a request to leave. */
      vlb.addEventListener('click', function (e) {
        if (e.target === vlb) vlbHide();
      });

      /* Esc closes, and Tab cycles between the two things in here: the close
         button and the player. Without the trap, tabbing walks straight out of
         an open dialog into the page behind it, which is still scroll-locked. */
      vlb.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          vlbHide();
          return;
        }

        if (e.key !== 'Tab') return;

        var stops = vlb.querySelectorAll('button, iframe');
        if (!stops.length) return;

        var first = stops[0];
        var last = stops[stops.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      });
    }

    function vlbHide() {
      if (!vlb || vlb.hidden) return;

      /* Removing the iframe is what actually stops the sound. Hiding it does not. */
      vlbFrame.innerHTML = '';
      vlb.hidden = true;
      document.documentElement.classList.remove('vlb-open');

      if (vlbOpener) {
        vlbOpener.focus();
        vlbOpener = null;
      }
    }

    function vlbShow(card) {
      var id = card.getAttribute('data-yt');
      if (!id) return false;

      /* Refuse rather than open a dialog around a player that cannot start. A
         partner card returning false here keeps its own href and target, so the
         click just follows the link, which is the fallback the card was built
         with in the first place. */
      if (!ytEmbeddable) return false;

      if (!vlb) vlbBuild();

      var frame = document.createElement('iframe');
      frame.src =
        'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) +
        '?autoplay=1&rel=0&playsinline=1&modestbranding=1&cc_load_policy=0';
      frame.setAttribute('title', card.getAttribute('aria-label') || 'Partner video');
      frame.setAttribute('allow', 'accelerometer; autoplay; encrypted-media; picture-in-picture; web-share');
      frame.setAttribute('allowfullscreen', '');
      frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');

      vlbFrame.innerHTML = '';
      vlbFrame.appendChild(frame);

      vlb.setAttribute('aria-label', card.getAttribute('aria-label') || 'Partner video');
      vlb.hidden = false;
      document.documentElement.classList.add('vlb-open');

      vlbOpener = card;
      vlbClose.focus();
      return true;
    }

    for (var vi = 0; vi < vidCards.length; vi++) {
      /* An empty data-yt means the generator could not parse an id out of the
         src. Leave that card entirely alone: it stays the plain link it already
         is, which still reaches the video. */
      if (!vidCards[vi].getAttribute('data-yt')) continue;

      vidCards[vi].addEventListener('click', function (e) {
        /* Let the modified clicks through. Someone holding a modifier is asking
           for a new tab or window, and the href is a real YouTube URL, so the
           right thing to do is nothing. */
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

        try {
          if (vlbShow(this)) e.preventDefault();
        } catch (err) {
          /* Leave the anchor to do its job. A lightbox that fails to open is not
             worth a partner video that will not play. */
        }
      });
    }

    /* ------------------------------------------------ the hero Welcome pill
       Straight into the same lightbox the partner cards use. vlbShow reads
       data-yt and aria-label off whatever element it is handed, so the pill
       needs nothing of its own. It is a button, so Enter and Space both fire
       click for free and there is no href to suppress. */
    if (welcomePill && welcomePill.getAttribute('data-yt')) {
      welcomePill.addEventListener('click', function () {
        try {
          /* A button has no href of its own to fall back to, so off disk it
             hands the reader to YouTube rather than opening a dialog that
             cannot play. */
          if (!vlbShow(this)) {
            window.open(ytWatch(this.getAttribute('data-yt')), '_blank', 'noopener');
          }
        } catch (err) {
          /* A failed lightbox must not take the rest of the page with it. */
        }
      });
    }

    /* ------------------------------------------------ videos that play themselves
       Every video on the site: the muted loop beside the Compact on the homepage
       and, since 15 Sept 2026 on Scott's call, every partner card too. One
       function drives both, because they are the same object in two places.

       docs-internal/CLAUDE.md rule 2 was widened for this. The two guardrails
       that bought it are here:

       NOTHING LOADS ON PAGE LOAD. The observer holds the roughly one megabyte of
       YouTube player back until the video is near the viewport, so a reader who
       never scrolls that far never pays for it and never touches youtube.com.
       The poster is what they see until then.

       AND NO YOUTUBE CHROME REACHES THE PAGE while it is muted. controls=0 plus
       pointer-events:none in the stylesheet make the iframe decoration.

       loop=1 does nothing on its own; playlist= is what actually repeats a single
       video, so the two go together or neither works.

       cc_load_policy=0 is not enough to stop YouTube's own captions. Measured:
       they still rendered in five of nine samples with it set, because it states
       a preference and the module loads anyway. THE VIDEOS ALREADY HAVE CAPTIONS
       BURNED IN, so a second set lands on top of the first and mishears the name
       as "Scott Wynn". unloadModule through the player's postMessage interface is
       what actually turns them off, and enablejsapi=1 is what buys that. The real
       fix is to disable the auto-captions on the uploads. */
    function livePlayer(host) {
      var id = host.getAttribute('data-yt');
      if (!id) return;

      var loud = false;

      /* The homepage rail ships its button in the HTML, because it is a bare div
         with no link of its own and the button is its only control. A partner
         card is an anchor that already works without JavaScript, so its button is
         created here instead: rendering an inert one would promise a control that
         does nothing when this file fails to load. It hangs off .vidwrap rather
         than the card, because a button inside an anchor is invalid markup. */
      var btn = host.querySelector('.vsound');

      /* Opened off disk nothing can play, so stop before the observer and the
         iframe. No button is CREATED here either: a partner card is already an
         anchor that reaches the video, and a control promising sound it cannot
         deliver is worse than no control. One that is already in the markup, as
         the homepage rail's is, still has to do something, so it becomes the way
         out to YouTube. */
      if (!ytEmbeddable) {
        if (btn) {
          btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            window.open(ytWatch(id), '_blank', 'noopener');
          });
        }
        return;
      }

      if (!btn) {
        var mount = host.parentNode;
        if (!mount) return;
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'vsound';
        btn.innerHTML =
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
          '<path d="M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/></svg>' +
          '<span class="vsound__label">Unmute</span>';
        mount.appendChild(btn);
      }

      var label = btn.querySelector('.vsound__label');

      function src() {
        var base = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?';

        if (loud) {
          /* Controls come back with the sound. Someone who has chosen to listen
             should be able to pause and scrub, and .is-loud in the stylesheet is
             what lets the pointer actually reach them. No loop: a deliberate watch
             should end rather than start again. */
          return base + 'autoplay=1&mute=0&start=0&controls=1&modestbranding=1&rel=0' +
            '&playsinline=1&cc_load_policy=0';
        }

        return base + 'autoplay=1&mute=1&loop=1&playlist=' + encodeURIComponent(id) +
          '&controls=0&modestbranding=1&rel=0&playsinline=1&disablekb=1&fs=0' +
          '&iv_load_policy=3&cc_load_policy=0';
      }

      /* Sent repeatedly rather than once. The player ignores commands until it is
         ready, there is no ready event without the API script, and a caption track
         can load late, so a short ladder of attempts is the reliable shape. */
      function killCaptions(frame) {
        var send = function () {
          try {
            frame.contentWindow.postMessage(
              '{"event":"command","func":"unloadModule","args":["captions"]}', '*');
            frame.contentWindow.postMessage(
              '{"event":"command","func":"unloadModule","args":["cc"]}', '*');
          } catch (e) {}
        };
        var waits = [300, 800, 1500, 2600, 4200, 6500, 9000];
        for (var i = 0; i < waits.length; i++) window.setTimeout(send, waits[i]);
        frame.addEventListener('load', send);
      }

      function mountFrame() {
        var old = host.querySelector('iframe');
        if (old) old.parentNode.removeChild(old);

        var f = document.createElement('iframe');
        /* enablejsapi is here only so killCaptions can reach the player; origin is
           what YouTube wants alongside it. */
        f.src = src() + '&enablejsapi=1&origin=' + encodeURIComponent(window.location.origin);
        f.setAttribute('title', host.getAttribute('aria-label') || 'Alliance video');
        f.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
        f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        f.setAttribute('tabindex', '-1');
        host.appendChild(f);
        host.classList.add('is-live');
        host.classList.toggle('is-loud', loud);
        killCaptions(f);
      }

      btn.addEventListener('click', function (e) {
        /* The partner card is an anchor and this button sits inside it visually,
           so a click here must not also follow the link or open the lightbox. */
        e.preventDefault();
        e.stopPropagation();

        /* Destroy and recreate rather than pull in YouTube's IFrame API for one
           button. The API is another script and another dependency. */
        loud = !loud;
        mountFrame();
        if (label) label.textContent = loud ? 'Mute' : 'Unmute';
        btn.setAttribute('aria-label', loud ? 'Mute the video' : 'Play the video with sound');
      });

      /* Reduced motion gets the poster and the button and nothing moving. The
         button still works, because pressing it is a choice rather than motion the
         reader did not ask for. The lightbox is unaffected, for the same reason. */
      var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (!still && 'IntersectionObserver' in window) {
        var obs = new IntersectionObserver(function (entries) {
          for (var i = 0; i < entries.length; i++) {
            if (entries[i].isIntersecting) {
              obs.disconnect();
              mountFrame();
              return;
            }
          }
        }, { rootMargin: '200px 0px' });

        obs.observe(host);
      }
    }

    if (welcomeRail) livePlayer(welcomeRail);
    for (var pv = 0; pv < vidCards.length; pv++) livePlayer(vidCards[pv]);
  }

}());
