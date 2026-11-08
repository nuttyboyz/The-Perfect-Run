// The "Who's playing?" screen shown before the game starts: Admin, each saved user, Add new user, or Guest.
import { Profile } from './profile.js';
import { PadInput, connectedPads, setFocus } from './pad.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function runLogin() {
  const el = document.getElementById('login');
  const $ = (s) => el.querySelector(s);
  return new Promise((done) => {
    let mode = null, target = null;
    const home = () => {
      mode = null; target = null;
      if (typeof closeOsk === 'function' && typing) { typing = null; osk.classList.remove('on'); }
      $('#lg-home').style.display = ''; $('#lg-form').style.display = 'none';
      const users = Profile.users();
      $('#lg-users').innerHTML = users.map((u) => `<button class="lg-user pad-first" data-id="${esc(u.id)}"><i>${esc(u.name[0].toUpperCase())}</i><b>${esc(u.name)}</b></button>`).join('')
        + `<button class="lg-user admin pad-first" data-admin="1"><i>★</i><b>Admin</b><small>everything unlocked</small></button>`;
      el.querySelectorAll('.lg-user').forEach((b) => (b.onclick = () => (b.dataset.admin ? (Profile.enterAdmin(), finish()) : form('user', users.find((u) => u.id === b.dataset.id)))));
    };
    const form = (m, u) => {
      mode = m; target = u || null;
      $('#lg-home').style.display = 'none'; $('#lg-form').style.display = '';
      $('#lg-err').textContent = '';
      const T = {
        user: ['Welcome back, ' + (u ? u.name : ''), 'Enter your password.', 'Sign in'],
        login: ['Sign in', 'Your name and password. Your account and progress follow you to any device.', 'Sign in'],
        admin: ['Admin', 'Enter the admin password.', 'Sign in'],
        adminSetup: ['Set up Admin', 'Create the admin password for this device. Only you should know it. Admin has everything unlocked and can delete accounts.', 'Create admin'],
        create: ['Add new user', Profile.cloud ? 'Just a name and a password. Your account is saved online for good: sign in on any device and pick up where you left off.' : 'Just a name and a password. Your progress saves to this profile on this device.', 'Create profile'],
      }[m];
      $('#lg-title').textContent = T[0]; $('#lg-sub').textContent = T[1]; $('#lg-go').textContent = T[2];
      $('#lg-name-f').style.display = m === 'create' || m === 'login' ? '' : 'none';
      $('#lg-pw2-f').style.display = m === 'create' || m === 'adminSetup' ? '' : 'none';
      $('#lg-name').value = ''; $('#lg-pw').value = ''; $('#lg-pw2').value = '';
      setTimeout(() => (m === 'create' || m === 'login' ? $('#lg-name') : $('#lg-pw')).focus(), 30);
    };
    // ---- controller: d-pad / stick moves, ✕ selects, ○ goes back; text boxes open an on-screen keyboard ----
    const pad = new PadInput('any');
    const osk = $('#lg-osk'), keysEl = $('#osk-keys'), show = $('#osk-show');
    let typing = null, shift = false, raf = 0, last = performance.now();
    const ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl-', 'zxcvbnm_.!'];
    const drawShow = () => {
      if (!typing) return;
      const v = typing.value, label = typing.closest('.field').querySelector('span').textContent;
      show.innerHTML = `<small>${esc(label)}</small>${esc(typing.type === 'password' ? '•'.repeat(v.length) : v)}<span style="opacity:.6">_</span>`;
    };
    const drawKeys = () => {
      keysEl.innerHTML = ROWS.map((r) => [...r].map((c) => `<button type="button" data-k="${esc(c)}">${esc(shift ? c.toUpperCase() : c)}</button>`).join('')).join('')
        + '<button type="button" class="wide" data-k="shift">⇧ Shift</button><button type="button" class="wide" data-k=" ">Space</button><button type="button" class="wide" data-k="del">⌫ Delete</button><button type="button" class="wide" data-back data-k="cancel">Cancel</button><button type="button" class="wide done" data-k="done">Done ✓</button>';
      keysEl.querySelectorAll('button').forEach((b) => (b.onclick = () => key(b.dataset.k)));
    };
    const closeOsk = (next) => {
      const was = typing; typing = null; osk.classList.remove('on');
      const list = [...el.querySelectorAll('.lg-form .pad-text, #lg-go')].filter((e) => e.offsetParent);
      const i = list.indexOf(was);
      setFocus(el, next && list[i + 1] ? list[i + 1] : was || list[0]);
    };
    const key = (k) => {
      if (!typing) return;
      const max = +typing.maxLength > 0 ? +typing.maxLength : 64;
      if (k === 'shift') { shift = !shift; const f = keysEl.querySelector('.pad-focus'); const idx = f ? [...keysEl.children].indexOf(f) : 0; drawKeys(); setFocus(el, keysEl.children[idx]); return; }
      if (k === 'del') typing.value = typing.value.slice(0, -1);
      else if (k === 'cancel') return closeOsk(false);
      else if (k === 'done') return closeOsk(true);
      else if (typing.value.length < max) typing.value += shift ? k.toUpperCase() : k;
      drawShow();
    };
    el.addEventListener('padtype', (e) => {
      typing = e.target; shift = false; drawKeys(); drawShow(); osk.classList.add('on');
      setFocus(el, keysEl.querySelector('[data-k="q"]'));
    });
    const loop = () => {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
      const has = connectedPads().length > 0;
      $('#lg-padhint').classList.toggle('on', has);
      if (has) pad.nav(el, dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const finish = () => { cancelAnimationFrame(raf); osk.classList.remove('on'); el.querySelectorAll('.pad-focus').forEach((e) => e.classList.remove('pad-focus')); el.classList.remove('on'); done(Profile.cur); };
    $('#lg-new').onclick = () => form('create');
    const si = $('#lg-signin');
    if (si) { si.style.display = Profile.cloud ? '' : 'none'; si.onclick = () => form('login'); }
    $('#lg-guest').onclick = () => { Profile.guest(); finish(); };
    $('#lg-back').onclick = home;
    const go = $('#lg-go');
    $('#lg-form').onsubmit = async (e) => {
      e.preventDefault();
      if (go.disabled) return;
      const pw = $('#lg-pw').value, pw2 = $('#lg-pw2').value;
      $('#lg-err').textContent = '';
      if ((mode === 'create' || mode === 'adminSetup') && pw !== pw2) { $('#lg-err').textContent = 'The two passwords do not match.'; return; }
      go.disabled = true;
      try {
        if (mode === 'create') await Profile.createUser($('#lg-name').value, pw);
        else if (mode === 'user') await Profile.signIn(target.id, pw);
        else if (mode === 'login') await Profile.signIn('n:' + $('#lg-name').value, pw);
        else if (mode === 'admin') await Profile.signInAdmin(pw);
        else if (mode === 'adminSetup') await Profile.setupAdmin(pw);
        finish();
      } catch (err) { $('#lg-err').textContent = err.message || String(err); }
      go.disabled = false;
    };
    home();
    el.classList.add('on');
  });
}
