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
  var kindField = document.getElementById('ic-kind');
  var partnerField = document.getElementById('ic-partner');
  var partnerLabel = document.getElementById('ic-partner-label');
  var dateField = document.getElementById('ic-date');
  var detailsWrap = document.getElementById('ic-details-f');
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

      var status = document.createElement('p');
      status.className = 'small ic-status';
      status.textContent = String(row.status || '');

      item.appendChild(name);
      item.appendChild(status);

      /* The Alliance half. Appended only when the Worker says the table
         exists, so with ALLIANCE_TABLE_ID unset this is byte for byte the card
         this page has always drawn. */
      if (allianceOn) {
        var standing = document.createElement('p');
        standing.className = 'small ic-alliance';
        standing.textContent = String(row.alliance_status || 'No Alliance record yet.');
        item.appendChild(standing);

        var acts = (row && row.activations) || [];
        if (acts.length) {
          var ul = document.createElement('ul');
          ul.className = 'ic-acts';
          for (var j = 0; j < acts.length; j++) {
            var li = document.createElement('li');
            li.className = 'small';
            li.textContent = String(acts[j].partner || '') + ', ' + fmtDate(String(acts[j].date || ''));
            ul.appendChild(li);
          }
          item.appendChild(ul);
        } else if (row.alliance_id) {
          var noneP = document.createElement('p');
          noneP.className = 'small ic-acts-none';
          noneP.textContent = 'No activations logged yet';
          item.appendChild(noneP);
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
        results.appendChild(message('Narrow to one installer to log a call or an activation.'));
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

  /* ------------------------------------------------------------- log form */

  var logId = '';

  function fillPartners() {
    var kind = kindField.value;
    var opts = PARTNERS.slice();
    if (kind === 'intro_call') opts.push('Other');
    var keep = partnerField.value;
    partnerField.textContent = '';
    for (var i = 0; i < opts.length; i++) {
      var o = document.createElement('option');
      o.value = opts[i];
      o.textContent = opts[i];
      partnerField.appendChild(o);
    }
    if (opts.indexOf(keep) !== -1) partnerField.value = keep;
    partnerLabel.textContent = kind === 'activation'
      ? 'Whose offer did they take?'
      : 'Your partner';
    detailsWrap.hidden = kind !== 'activation';
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

  if (kindField) {
    kindField.addEventListener('change', fillPartners);
    dateField.value = todayET();
    fillPartners();
  }

  if (logForm) {
    logForm.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!logId) return;

      var by = byField.value.trim();
      if (!by) { say(logNote, 'Enter your email so the log says who logged it.'); return; }

      say(logNote, 'Logging', true);
      ask('/log', {
        passcode: passcode,
        alliance_id: logId,
        kind: kindField.value,
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
          say(logNote, 'Already logged in the last 30 days');
          return;
        }
        if (!res.ok) {
          say(logNote, res.data.error || 'Could not log that. Try again shortly.');
          return;
        }
        say(logNote, '');
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
