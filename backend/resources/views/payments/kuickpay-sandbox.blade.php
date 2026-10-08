<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>KuickPay · Secure checkout</title>
<style>
  :root {
    --kp: #ef4b23; --kp-dark: #c23812; --ink: #0f172a; --muted: #64748b; --line: #e2e8f0;
    --bg: #f4f6fb; --card: #ffffff; --ok: #047857; --warn: #b45309; --danger: #b91c1c;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--bg); color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  .ribbon { background: #fff7ed; color: var(--warn); border-bottom: 1px solid #fed7aa; font-size: 12px; font-weight: 600;
    text-align: center; padding: 8px 12px; letter-spacing: .02em; }
  .wrap { max-width: 460px; margin: 0 auto; padding: 18px 16px 40px; }
  .brand { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .logo { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 18px; letter-spacing: -.01em; }
  .logo-mark { width: 30px; height: 30px; border-radius: 9px; background: linear-gradient(135deg, var(--kp), #ff8a3d);
    display: grid; place-items: center; color: #fff; font-size: 15px; }
  .secure { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ok); font-weight: 600; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 18px; box-shadow: 0 6px 24px rgba(15,23,42,.05); }
  .merchant { display: flex; align-items: center; gap: 12px; padding-bottom: 14px; border-bottom: 1px dashed var(--line); }
  .avatar { width: 42px; height: 42px; border-radius: 12px; background: #e8f0f7; color: #1b4f8a; display: grid; place-items: center; font-weight: 800; }
  .merchant-name { font-weight: 700; font-size: 15px; }
  .merchant-sub { color: var(--muted); font-size: 12px; margin-top: 2px; }
  .amount { text-align: center; padding: 18px 0 6px; }
  .amount-label { color: var(--muted); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; }
  .amount-value { font-size: 34px; font-weight: 800; letter-spacing: -.02em; margin-top: 4px; }
  .bill { text-align: center; color: var(--muted); font-size: 13px; }
  .ref { display: inline-block; margin-top: 8px; font-size: 11px; color: var(--muted); background: #f1f5f9; border-radius: 999px; padding: 4px 10px; font-family: ui-monospace, Menlo, monospace; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 22px 2px 10px; }
  .methods { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .method { position: relative; }
  .method input { position: absolute; opacity: 0; pointer-events: none; }
  .method label { display: flex; align-items: center; gap: 10px; border: 1.5px solid var(--line); border-radius: 14px; padding: 12px; background: #fff;
    cursor: pointer; font-weight: 600; font-size: 14px; min-height: 56px; transition: border-color .15s, box-shadow .15s; }
  .method input:checked + label { border-color: var(--kp); box-shadow: 0 0 0 3px rgba(239,75,35,.12); }
  .method input:focus-visible + label { outline: 2px solid var(--kp); outline-offset: 2px; }
  .dot { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; color: #fff; font-size: 12px; font-weight: 800; flex-shrink: 0; }
  .m-easypaisa { background: #12b347; } .m-jazzcash { background: #d71f26; } .m-card { background: #1e3a8a; }
  .m-bank { background: #0f766e; } .m-raast { background: #6d28d9; }
  .fields { margin-top: 14px; display: none; }
  .fields.active { display: block; }
  .field { margin-bottom: 12px; }
  .field label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
  .field input { width: 100%; height: 48px; border-radius: 12px; border: 1.5px solid var(--line); padding: 0 14px; font-size: 16px; background: #fff; color: var(--ink); }
  .field input:focus { outline: none; border-color: var(--kp); box-shadow: 0 0 0 3px rgba(239,75,35,.12); }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .hint { color: var(--muted); font-size: 12px; margin-top: 6px; }
  .error { background: #fef2f2; border: 1px solid #fecaca; color: var(--danger); border-radius: 12px; padding: 10px 12px; font-size: 13px; margin-top: 14px; }
  .pay { margin-top: 18px; width: 100%; height: 54px; border: 0; border-radius: 14px; background: var(--kp); color: #fff; font-size: 16px; font-weight: 700;
    cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; }
  .pay:active { background: var(--kp-dark); }
  .pay[disabled] { opacity: .65; cursor: progress; }
  .spinner { width: 18px; height: 18px; border: 2.5px solid rgba(255,255,255,.4); border-top-color: #fff; border-radius: 50%; animation: spin .8s linear infinite; display: none; }
  .pay[disabled] .spinner { display: inline-block; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .cancel { margin-top: 10px; width: 100%; height: 46px; border-radius: 14px; border: 1px solid var(--line); background: #fff; color: var(--ink); font-size: 14px; font-weight: 600; cursor: pointer; }
  .trust { display: flex; justify-content: center; gap: 14px; margin-top: 16px; color: var(--muted); font-size: 11px; flex-wrap: wrap; }
  .test { margin-top: 18px; border: 1px dashed #fdba74; background: #fffbeb; border-radius: 14px; padding: 12px 14px; font-size: 12px; color: #78350f; line-height: 1.6; }
  .test b { color: #7c2d12; }
  .test code { background: #fff; padding: 1px 6px; border-radius: 6px; border: 1px solid #fde68a; font-family: ui-monospace, Menlo, monospace; }
  .timer { text-align: center; color: var(--muted); font-size: 12px; margin-top: 12px; }
</style>
</head>
<body>
<div class="ribbon">TEST MODE · KuickPay sandbox — no real money moves</div>
<div class="wrap">
  <div class="brand">
    <div class="logo"><span class="logo-mark">K</span> KuickPay</div>
    <span class="secure">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
      Secure checkout
    </span>
  </div>

  <div class="card">
    <div class="merchant">
      <div class="avatar">{{ mb_strtoupper(mb_substr($merchant, 0, 1)) }}</div>
      <div>
        <div class="merchant-name">{{ $merchant }}</div>
        <div class="merchant-sub">via Havena</div>
      </div>
    </div>

    <div class="amount">
      <div class="amount-label">Amount to pay</div>
      <div class="amount-value">Rs {{ number_format($attempt->amount_paisa / 100, $attempt->amount_paisa % 100 === 0 ? 0 : 2) }}</div>
    </div>
    <div class="bill">
      {{ $attempt->title }}@if($attempt->subtitle)<br>{{ $attempt->subtitle }}@endif
      <br><span class="ref">Order {{ $session['order_id'] }}</span>
    </div>

    <form method="post" id="pay-form" novalidate autocomplete="off">
      <h2>Pay with</h2>
      <div class="methods" role="radiogroup" aria-label="Payment method">
        @foreach($methods as $method)
          @php $id = $method['id']; @endphp
          <div class="method">
            <input type="radio" name="method" id="m-{{ $id }}" value="{{ $id }}" @checked($selectedMethod === $id)>
            <label for="m-{{ $id }}">
              <span class="dot m-{{ $id }}">{{ ['easypaisa' => 'ep', 'jazzcash' => 'JC', 'card' => '▭', 'bank' => '⌂', 'raast' => 'R'][$id] ?? '•' }}</span>
              {{ $method['label'] }}
            </label>
          </div>
        @endforeach
      </div>

      <div class="fields" data-for="easypaisa jazzcash">
        <div class="field">
          <label for="wallet_mobile">Mobile account number</label>
          <input id="wallet_mobile" name="wallet_mobile" inputmode="numeric" maxlength="11" placeholder="03XX XXXXXXX" autocomplete="tel">
        </div>
        <div class="field">
          <label for="wallet_pin">MPIN</label>
          <input id="wallet_pin" name="wallet_pin" type="password" inputmode="numeric" maxlength="5" placeholder="•••••" autocomplete="off">
          <div class="hint">You will also approve this on your wallet app in live mode.</div>
        </div>
      </div>

      <div class="fields" data-for="card">
        <div class="field">
          <label for="card_number">Card number</label>
          <input id="card_number" name="card_number" inputmode="numeric" maxlength="19" placeholder="1234 5678 9012 3456" autocomplete="cc-number">
        </div>
        <div class="row">
          <div class="field">
            <label for="card_expiry">Expiry</label>
            <input id="card_expiry" name="card_expiry" inputmode="numeric" maxlength="5" placeholder="MM/YY" autocomplete="cc-exp">
          </div>
          <div class="field">
            <label for="card_cvv">CVV</label>
            <input id="card_cvv" name="card_cvv" type="password" inputmode="numeric" maxlength="4" placeholder="•••" autocomplete="cc-csc">
          </div>
        </div>
      </div>

      <div class="fields" data-for="bank raast">
        <div class="field">
          <label for="bank_account" id="bank_label">Account number or IBAN</label>
          <input id="bank_account" name="bank_account" maxlength="34" placeholder="PK36 SCBL 0000 0011 2345 6702">
        </div>
      </div>

      @if($error)
        <div class="error" role="alert">{{ $error }}</div>
      @endif

      <input type="hidden" name="action" value="pay" id="action">
      <button class="pay" type="submit" id="pay-btn">
        <span class="spinner" aria-hidden="true"></span>
        <span>Pay Rs {{ number_format($attempt->amount_paisa / 100, $attempt->amount_paisa % 100 === 0 ? 0 : 2) }}</span>
      </button>
      <button class="cancel" type="submit" id="cancel-btn" formnovalidate>Cancel and return to Havena</button>
    </form>

    <div class="timer" id="timer"></div>
  </div>

  <div class="trust">
    <span>🔒 256-bit encryption</span><span>1LINK · 1BILL network</span><span>PCI DSS hosted page</span>
  </div>

  <div class="test">
    <b>Sandbox test details</b><br>
    Any wallet number and 4–5 digit MPIN pays successfully.<br>
    Decline: wallet number ending <code>0000</code>, MPIN <code>00000</code>, or card <code>4000 0000 0000 0002</code>.<br>
    Any other card (e.g. <code>4242 4242 4242 4242</code>, <code>12/30</code>, <code>123</code>) succeeds.
  </div>
</div>

<script>
(function () {
  var form = document.getElementById('pay-form');
  var payBtn = document.getElementById('pay-btn');
  var cancelBtn = document.getElementById('cancel-btn');
  var action = document.getElementById('action');
  var bankLabel = document.getElementById('bank_label');

  function sync() {
    var checked = form.querySelector('input[name="method"]:checked');
    var method = checked ? checked.value : 'easypaisa';
    document.querySelectorAll('.fields').forEach(function (block) {
      block.classList.toggle('active', block.getAttribute('data-for').split(' ').indexOf(method) !== -1);
    });
    bankLabel.textContent = method === 'raast' ? 'Raast ID (mobile number) or IBAN' : 'Account number or IBAN';
  }
  form.querySelectorAll('input[name="method"]').forEach(function (radio) { radio.addEventListener('change', sync); });
  if (!form.querySelector('input[name="method"]:checked')) {
    var first = form.querySelector('input[name="method"]');
    if (first) first.checked = true;
  }
  sync();

  var expiry = document.getElementById('card_expiry');
  expiry.addEventListener('input', function () {
    var digits = expiry.value.replace(/\D/g, '').slice(0, 4);
    expiry.value = digits.length > 2 ? digits.slice(0, 2) + '/' + digits.slice(2) : digits;
  });
  var card = document.getElementById('card_number');
  card.addEventListener('input', function () {
    card.value = card.value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
  });

  var submitted = false;
  cancelBtn.addEventListener('click', function () { action.value = 'cancel'; });
  form.addEventListener('submit', function (event) {
    if (submitted) { event.preventDefault(); return; }
    submitted = true;
    payBtn.disabled = true;
    cancelBtn.disabled = true;
  });
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) { submitted = false; payBtn.disabled = false; cancelBtn.disabled = false; action.value = 'pay'; }
  });

  var expiresAt = {{ $attempt->expires_at ? $attempt->expires_at->getTimestamp() * 1000 : 'null' }};
  var timer = document.getElementById('timer');
  if (expiresAt) {
    var tick = function () {
      var left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      var m = Math.floor(left / 60), s = left % 60;
      timer.textContent = left > 0 ? 'This checkout expires in ' + m + ':' + (s < 10 ? '0' : '') + s : 'This checkout has expired. Return to Havena to try again.';
      if (left <= 0) { payBtn.disabled = true; }
    };
    tick();
    setInterval(tick, 1000);
  }
})();
</script>
</body>
</html>
