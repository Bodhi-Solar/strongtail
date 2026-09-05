/* ============================================================================
   Strong Tail Solar Alliance — js/installer-check.js

   Drives /installer-check/ only, which is why it is a second file rather than
   more of js/main.js: the other six pages should not carry it.

   Unlike everything else on this site, this page genuinely cannot work without
   JavaScript. There is no server on GitHub Pages to post a form to. So the page
   ships with the gate visible and the search hidden, and the no-JS reader sees
   a form that does nothing rather than a broken result list. The <noscript>
   line in the markup is what tells them why.

   Two things to keep in mind if you change this file:

     1. Names come from Airtable, which is not a trusted source of markup. Every
        value is written with textContent. Never innerHTML. Same reasoning as
        the ?p= handling in js/main.js.
     2. The passcode in sessionStorage is a convenience so a partner is not
        retyping it per search. It is not a security boundary. The Worker checks
        it on every request, so nothing here needs to be trusted.
     3. The log form posts back a record id the Worker gave us, and nothing
        else. No id is ever constructed here, and the Worker refuses any value
        that is not a bare Airtable record id. Added 3 Sep 2026.
     4. Interest is an array from Airtable and is joined into one string HERE,
        not in the Worker. It is still textContent, it is still never a class
        name, and it is deliberately not filtered against PARTNERS. See
        interestLine(). Added 3 Sep 2026.
   ========================================================================= */
(function () {
  'use strict';

  /* Still the one value that lives in two places, this and the Worker's own
     deployed URL. A base now, because there are two routes. */
  var ENDPOINT = 'https://strongtail-installer-check.bodhi-solar.workers.dev';
  var STORE_KEY = 'stsa-installer-check-pass';

  var gate = document.getElementById('ic-gate');
  var search = document.getElementById('ic-search');
  if (!gate || !search) return;

  var passField = document.getElementById('ic-pass');
  var queryField = document.getElementById('ic-q');
  var gateNote = document.getElementById('ic-gate-note');
  var searchNote = document.getElementById('ic-note');
  var results = document.getElementById('ic-results');

  var logForm = document.getElementById('ic-log');
  var callBox = document.getElementById('ic-kind-call');
  var actBox = document.getElementById('ic-kind-act');
  var partnerField = document.getElementById('ic-partner');
  var dateField = document.getElementById('ic-date');
  var detailsWrap = document.getElementById('ic-details-f');
  var toast = document.getElementById('ic-toast');
  var toastTimer = null;
  var detailsField = document.getElementById('ic-details');
  var byField = document.getElementById('ic-by');
  var logNote = document.getElementById('ic-log-note');

  var passcode = '';
  /* Remembered so a successful log can re-render the card from a fresh
     /lookup rather than patching the DOM and hoping it matches Airtable. */
  var lastQuery = '';
  var allianceOn = false;

  /* Character for character the Worker's PARTNERS list and the Airtable
     Activated options. Other is intro-call only: Activated is a six-option
     multi-select and the Worker sends typecast:false, so Other would 422. */
  var PARTNERS = ['JA Solar', 'Scanifly', 'Damaris Solutions', 'Bodhi',
                  'Climate First Bank', 'Krannich Solar'];

  /* ------------------------------------------------------------------ notes
     .form-note collapses when empty and is --accent-text, which is the error
     colour. The quiet modifier is for "Checking", which is not an error.     */

  function say(node, message, quiet) {
    node.textContent = message || '';
    node.classList.toggle('form-note--quiet', !!quiet);
  }

  /* ------------------------------------------------------------------- api
     One shape for every call. `q` is omitted entirely for the gate check; the
     Worker treats a missing key as passcode-only and an empty string as a
     search for nothing.                                                     */

  function ask(path, payload) {
    return fetch(ENDPOINT + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  function unlock() {
    gate.hidden = true;
    search.hidden = false;
    queryField.focus();
  }

  function lock(message) {
    passcode = '';
    try { window.sessionStorage.removeItem(STORE_KEY); } catch (e) {}
    search.hidden = true;
    results.textContent = '';
    hideLog();
    say(searchNote, '');
    gate.hidden = false;
    say(gateNote, message);
    passField.value = '';
    passField.focus();
  }

  /* ------------------------------------------------------------------ gate */

  gate.addEventListener('submit', function (event) {
    event.preventDefault();
    var value = passField.value.trim();
    if (!value) { say(gateNote, 'Enter the partner passcode.'); return; }

    say(gateNote, 'Checking', true);
    ask('/lookup', { passcode: value }).then(function (res) {
      if (!res.ok) {
        say(gateNote, res.data.error || 'That passcode is not right.');
        return;
      }
      passcode = value;
      try { window.sessionStorage.setItem(STORE_KEY, value); } catch (e) {}
      say(gateNote, '');
      applyAlliance(res.data);
      unlock();
    }).catch(function () {
      say(gateNote, 'Could not reach the lookup. Check your connection and try again.');
    });
  });

  /* ---------------------------------------------------------------- search */

  search.addEventListener('submit', function (event) {
    event.preventDefault();
    var q = queryField.value.trim();
    if (!q) { say(searchNote, 'Type a company name or a website.'); return; }

    lastQuery = q;
    say(searchNote, 'Checking', true);
    results.textContent = '';

    ask('/lookup', { passcode: passcode, q: q }).then(function (res) {
      /* The passcode was accepted a moment ago and is not now. It was rotated
         mid-session, so send them back to the gate rather than leaving a search
         box that will fail on every attempt. */
      if (res.status === 401) {
        lock('That passcode is no longer valid. Ask Bodhi for the current one.');
        return;
      }
      if (!res.ok) {
        say(searchNote, res.data.error || 'Something went wrong. Try again shortly.');
        return;
      }
      say(searchNote, '');
      render(res.data);
    }).catch(function () {
      say(searchNote, 'Could not reach the lookup. Check your connection and try again.');
    });
  });

  /* ---------------------------------------------------------------- render
     Every string below is set with textContent. The only thing this function
     takes from the response and puts into a class name is `tone`, which is
     checked against a closed list first.                                    */

  var TONES = { yes: 1, warn: 1, no: 1, info: 1 };

  /* One label and value pair on a result card. Every value goes in with
     textContent. The class name is always a literal from this file and never a
     value from the response, which is the same discipline TONES enforces on the
     one response value that does reach a class name. `extra` is an element
     appended after the text, which is how the enrolled list gets inside its own
     <dd>. */
  function fact(dl, label, value, cls, extra) {
    var dt = document.createElement('dt');
    dt.className = 'eyebrow';
    dt.textContent = label;
    var dd = document.createElement('dd');
    dd.className = cls ? 'small ' + cls : 'small';
    if (value) dd.textContent = value;
    if (extra) dd.appendChild(extra);
    dl.appendChild(dt);
    dl.appendChild(dd);
  }

  /* Three states, not two. An installer whose Alliance row exists but whose
     status formula has not resolved is not the same thing as one with no row,
     and saying "No Alliance record yet" for both is false for the first: it
     would send a partner to log a call against a row that already exists. */
  function allianceLine(row) {
    var st = String((row && row.alliance_status) || '');
    if (st) return st;
    return (row && row.alliance_id)
      ? 'Alliance record on file, status not set'
      : 'No Alliance record yet';
  }

  /* Interest is an array of Airtable multi-select labels: arbitrary text from a
     source that is not trusted to be markup. Joined into one string and written
     with textContent like every other value, never reaching a class name, an
     href or any attribute.

     NOT filtered against PARTNERS, deliberately. A seventh option is expected,
     and a filter would silently hide the first installer who asked for that
     partner, which is the opposite of the point. Shape is enforced instead, and
     both caps are against a malformed row rather than an attacker: one 4KB
     label must not push five cards off the screen. */
  var MAX_INTEREST = 10;

  function interestLine(list) {
    if (!Array.isArray(list)) return '';
    var out = [];
    for (var i = 0; i < list.length && out.length < MAX_INTEREST; i++) {
      var v = String(list[i] == null ? '' : list[i]).replace(/\s+/g, ' ').trim().slice(0, 60);
      if (v) out.push(v);
    }
    return out.join(', ');
  }

  function render(data) {
    var rows = (data && data.results) || [];
    results.textContent = '';
    applyAlliance(data);
    hideLog();

    if (!rows.length) {
      results.appendChild(message(
        'No record found for that name. That does not necessarily mean they have not ' +
        'applied. Try a shorter part of the name, or their website.'));
      return;
    }

    var list = document.createElement('ul');
    list.className = 'ic-list';

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i] || {};
      var tone = Object.prototype.hasOwnProperty.call(TONES, row.tone) ? row.tone : 'info';

      var item = document.createElement('li');
      item.className = 'ic-card ic-card--' + tone;

      var name = document.createElement('p');
      name.className = 'ic-name';
      name.textContent = String(row.name || '');
      item.appendChild(name);

      /* A labelled list, not a run of paragraphs. Two same-sized fragments in a
         list, with only append order saying which system each came from, is the
         ambiguity this card exists to remove: position is not a label. It also
         makes absence unambiguous, where a missing Website line and a missing
         Interest line would otherwise look identical. */
      var facts = document.createElement('dl');
      facts.className = 'ic-facts';
      item.appendChild(facts);

      /* Omitted, not blanked. A dash under a WEBSITE label reads as "we looked
         and there is none", which is more than we know. */
      var domain = String(row.domain || '');
      if (domain) fact(facts, 'Website', domain, 'ic-dom');

      /* The label is what lets this value stop naming its own system, which is
         why the copy could drop the words "Alliance installer". Those words used
         to appear here AND on the line below, meaning two different things. */
      fact(facts, 'OneEthos', String(row.status || ''), 'ic-status');

      /* Appended only when the Worker says the table exists, so with
         ALLIANCE_TABLE_ID unset the card is the name, the website and the
         OneEthos line, and nothing below runs. */
      if (allianceOn) {
        fact(facts, 'Alliance', allianceLine(row), 'ic-alliance');

        var interest = interestLine(row.interest);
        if (interest) fact(facts, 'Interest', interest, '');

        var acts = (row && row.activations) || [];
        if (acts.length) {
          var ul = document.createElement('ul');
          ul.className = 'ic-acts';
          for (var j = 0; j < acts.length; j++) {
            var li = document.createElement('li');
            li.className = 'small';
            li.textContent = String(acts[j].partner || '') + ', ' +
                             fmtDate(String(acts[j].date || ''));
            ul.appendChild(li);
          }
          fact(facts, 'Enrolled', '', '', ul);
        } else if (row.alliance_id) {
          fact(facts, 'Enrolled', 'None logged yet', '');
        }
      }

      list.appendChild(item);
    }

    results.appendChild(list);

    /* "Shown under a result", singular. With five results there is no single
       row to log against, so the form stays down and says why. The id shape is
       checked against a closed pattern, the same discipline as TONES. */
    if (allianceOn) {
      if (rows.length === 1 && /^rec[A-Za-z0-9]{14}$/.test(String(rows[0].alliance_id || ''))) {
        showLog(rows[0].alliance_id);
      } else if (rows.length > 1) {
        results.appendChild(message('Narrow to one installer to log a call or an enrollment.'));
      }
    }

    if (data.truncated) {
      results.appendChild(message(
        'More than five installers matched. Only the closest five are shown, so ' +
        'add a word or use the website to narrow it.'));
    }
  }

  function message(text) {
    var p = document.createElement('p');
    p.className = 'small ic-msg';
    p.textContent = text;
    return p;
  }

  /* --------------------------------------------------------------- alliance
     One boolean from the Worker drives the whole second half of this page. It
     rides on the gate response too, so the rail is correct before the first
     search rather than after it.

     While it is false the log form can never appear, so the two steps that
     describe logging would be instructions for a control that is not there.
     They get dimmed and marked instead. Nothing here needs changing when the
     Airtable table lands: the Worker starts saying true and the page follows. */

  var STEP_SOON = ['ic-step-log', 'ic-step-become'];

  function applyAlliance(data) {
    allianceOn = !!(data && data.alliance === true);
    for (var i = 0; i < STEP_SOON.length; i++) {
      var el = document.getElementById(STEP_SOON[i]);
      if (!el) continue;
      el.classList.toggle('ic-step--soon', !allianceOn);
      var flag = el.querySelector('.ic-soon');
      if (!allianceOn && !flag) {
        var span = document.createElement('span');
        span.className = 'small ic-soon';
        span.textContent = 'Available shortly.';
        el.querySelector('div').appendChild(span);
      } else if (allianceOn && flag) {
        flag.parentNode.removeChild(flag);
      }
    }
  }

  /* --------------------------------------------------------------- toast */

  /* Outcomes float; problems stay put. A confirmation is read once and wants to
     be out of the way, and it has to outlive the result card re-rendering
     underneath it. A validation message is something to act on, so it belongs
     beside the control that caused it and must not time out. */
  function toastSay(message) {
    if (!toast || !message) return;
    toast.textContent = message;
    toast.classList.add('is-on');
    if (toastTimer) clearTimeout(toastTimer);
    /* Three seconds, which is what these are worth: the confirmations are short
       and the state they confirm is visible on the card behind anyway.

       The two partial-duplicate lines run past seventy characters and wrap to
       three or four on a phone, and three seconds is not enough to read that
       without hurrying, so those get a little longer. Length is the honest
       signal here, not the kind of message. */
    var hold = message.length > 60 ? 4500 : 3000;
    /* Cleared as well as hidden, so the live region cannot re-announce a stale
       line later and :empty keeps an empty box off the screen. The inner wait
       matches the CSS transition, so the text goes only once it has faded. */
    toastTimer = setTimeout(function () {
      toast.classList.remove('is-on');
      setTimeout(function () { if (!toast.classList.contains('is-on')) toast.textContent = ''; }, 300);
    }, hold);
  }

  /* One sentence when both halves did the same thing, because "Intro call
     logged. Enrollment logged." is two sentences saying one thing. Separate
     sentences only when the outcomes genuinely differ. */
  function logOutcome(d) {
    var call = d.intro_call, act = d.activation;

    if (call === 'written' && act === 'written') return 'Intro call and enrollment successfully logged';
    if (call === 'written' && act === null) return 'Intro call successfully logged';
    if (act === 'written' && call === null) return 'Enrollment successfully logged';

    if (call === 'unchanged' && act === 'written') return 'Enrollment logged. The intro call was already recorded.';
    if (call === 'written' && act === 'duplicate') return 'Intro call logged. That enrollment was already logged in the last 30 days.';
    if (call === 'unchanged' && act === 'duplicate') return 'Nothing to add. Both were already logged.';

    if (call === 'unchanged') return 'The intro call was already recorded.';
    if (act === 'duplicate') return 'That enrollment was already logged in the last 30 days.';
    return 'Logged';
  }

  /* ------------------------------------------------------------- log form */

  var logId = '';

  function fillPartners() {
    /* Other only survives while the enrollment half is off: Activated is a
       six-option multi-select written with typecast:false, so Other would 422.
       Ticking Enrollment removes it, and clears it if it was already picked. */
    var wantAct = actBox.checked;
    var opts = PARTNERS.slice();
    if (!wantAct) opts.push('Other');
    var keep = partnerField.value;
    partnerField.textContent = '';
    for (var i = 0; i < opts.length; i++) {
      var o = document.createElement('option');
      o.value = opts[i];
      o.textContent = opts[i];
      partnerField.appendChild(o);
    }
    if (opts.indexOf(keep) !== -1) partnerField.value = keep;
    /* The wire value stays `activation` and the Airtable field stays Activated;
       only the word a partner reads changes. That mapping is in
       INSTALLER-CHECK.md, because three vocabularies for one event is exactly
       the sort of thing that wastes an afternoon later.

       The label no longer changes. It is "Your company" in both states, since
       both boxes can be ticked and there is no single kind to key off. */
    detailsWrap.hidden = !wantAct;
  }

  function showLog(id) {
    logId = String(id);
    fillPartners();
    say(logNote, '');
    logForm.hidden = false;
  }

  function hideLog() {
    logId = '';
    logForm.hidden = true;
    say(logNote, '');
  }

  /* A closed month list, never new Date(str). Parsing '2026-09-20' as a Date
     and formatting it locally shifts the day backwards anywhere west of UTC. */
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function fmtDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return s;
    return String(Number(m[3])) + ' ' + (MONTHS[Number(m[2]) - 1] || '') + ' ' + m[1];
  }

  function todayET() {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  if (callBox && actBox) {
    callBox.addEventListener('change', fillPartners);
    actBox.addEventListener('change', fillPartners);
    dateField.value = todayET();
    fillPartners();
  }

  if (logForm) {
    logForm.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!logId) return;

      var kinds = [];
      if (callBox.checked) kinds.push('intro_call');
      if (actBox.checked) kinds.push('activation');
      if (!kinds.length) { say(logNote, 'Tick what you are logging.'); return; }

      var by = byField.value.trim();
      if (!by) { say(logNote, 'Enter your email so the log says who logged it.'); return; }

      say(logNote, 'Logging', true);
      ask('/log', {
        passcode: passcode,
        alliance_id: logId,
        kinds: kinds,
        partner: partnerField.value,
        date: dateField.value,
        details: detailsField.value.trim(),
        submitted_by: by
      }).then(function (res) {
        if (res.status === 401) {
          lock('That passcode is no longer valid. Ask Bodhi for the current one.');
          return;
        }
        /* Nothing else. No re-render, no reset: the doc is explicit that a
           duplicate shows this and only this. */
        if (res.data && res.data.duplicate === true) {
          /* Still no re-render: nothing was written, so there is nothing new for
             the card to show. The wording moves to the toast because it is an
             outcome, not something to fix. */
          say(logNote, '');
          toastSay('That enrollment was already logged in the last 30 days.');
          return;
        }
        if (!res.ok) {
          say(logNote, res.data.error || 'Could not log that. Try again shortly.');
          return;
        }
        /* The toast, not the form note. render() below runs hideLog() then
           showLog(), and showLog clears the note, so a confirmation put there
           is erased by the refresh that just proved the write worked. */
        say(logNote, '');
        toastSay(logOutcome(res.data || {}));
        detailsField.value = '';
        /* Re-read rather than patch, so the card shows what Airtable actually
           holds. The Worker invalidated its Alliance cache on the write. */
        if (lastQuery) {
          ask('/lookup', { passcode: passcode, q: lastQuery }).then(function (r2) {
            if (r2.ok) render(r2.data);
          }).catch(function () {});
        }
      }).catch(function () {
        say(logNote, 'Could not reach the lookup. Check your connection and try again.');
      });
    });
  }

  /* ------------------------------------------------------------- returning
     sessionStorage only, not localStorage: the passcode should not outlive the
     browser session on a shared machine. Revalidated rather than trusted, so a
     rotated passcode lands on the gate with an explanation instead of on a
     search box that fails.                                                   */

  var stored = '';
  try { stored = window.sessionStorage.getItem(STORE_KEY) || ''; } catch (e) {}

  if (stored) {
    ask('/lookup', { passcode: stored }).then(function (res) {
      if (res.ok) { passcode = stored; applyAlliance(res.data); unlock(); }
      else { try { window.sessionStorage.removeItem(STORE_KEY); } catch (e) {} }
    }).catch(function () { /* Leave the gate up. It is the correct state. */ });
  }

}());
