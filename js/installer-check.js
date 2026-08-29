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
   ========================================================================= */
(function () {
  'use strict';

  var ENDPOINT = 'https://strongtail-installer-check.bodhi-solar.workers.dev/lookup';
  var STORE_KEY = 'stsa-installer-check-pass';

  var gate = document.getElementById('ic-gate');
  var search = document.getElementById('ic-search');
  if (!gate || !search) return;

  var passField = document.getElementById('ic-pass');
  var queryField = document.getElementById('ic-q');
  var gateNote = document.getElementById('ic-gate-note');
  var searchNote = document.getElementById('ic-note');
  var results = document.getElementById('ic-results');

  var passcode = '';

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

  function ask(payload) {
    return fetch(ENDPOINT, {
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
    ask({ passcode: value }).then(function (res) {
      if (!res.ok) {
        say(gateNote, res.data.error || 'That passcode is not right.');
        return;
      }
      passcode = value;
      try { window.sessionStorage.setItem(STORE_KEY, value); } catch (e) {}
      say(gateNote, '');
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

    say(searchNote, 'Checking', true);
    results.textContent = '';

    ask({ passcode: passcode, q: q }).then(function (res) {
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
      list.appendChild(item);
    }

    results.appendChild(list);

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

  /* ------------------------------------------------------------- returning
     sessionStorage only, not localStorage: the passcode should not outlive the
     browser session on a shared machine. Revalidated rather than trusted, so a
     rotated passcode lands on the gate with an explanation instead of on a
     search box that fails.                                                   */

  var stored = '';
  try { stored = window.sessionStorage.getItem(STORE_KEY) || ''; } catch (e) {}

  if (stored) {
    ask({ passcode: stored }).then(function (res) {
      if (res.ok) { passcode = stored; unlock(); }
      else { try { window.sessionStorage.removeItem(STORE_KEY); } catch (e) {} }
    }).catch(function () { /* Leave the gate up. It is the correct state. */ });
  }

}());
