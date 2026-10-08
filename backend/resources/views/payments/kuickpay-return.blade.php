@php
  $tone = $payload['tone'] ?? 'muted';
  $heading = $title ?? ($payload['status_label'] ?? 'Returning to Havena');
  $copy = $body ?? ($payload['message'] ?? 'You can close this page and return to Havena.');
  $colors = [
    'success' => ['#047857', '#ecfdf5', '#a7f3d0'],
    'pending' => ['#b45309', '#fffbeb', '#fde68a'],
    'danger' => ['#b91c1c', '#fef2f2', '#fecaca'],
    'muted' => ['#334155', '#f1f5f9', '#e2e8f0'],
  ][$tone] ?? ['#334155', '#f1f5f9', '#e2e8f0'];
@endphp
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>{{ $heading }} · Havena</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f6fb; color: #0f172a;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; padding: 24px 16px; }
  .card { width: 100%; max-width: 420px; background: #fff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 28px 22px; text-align: center;
    box-shadow: 0 10px 30px rgba(15,23,42,.06); }
  .badge { width: 64px; height: 64px; margin: 0 auto 14px; border-radius: 50%; display: grid; place-items: center;
    background: {{ $colors[1] }}; border: 1px solid {{ $colors[2] }}; color: {{ $colors[0] }}; font-size: 28px; font-weight: 800; }
  h1 { font-size: 20px; margin: 0 0 8px; letter-spacing: -.01em; }
  p { margin: 0; color: #475569; font-size: 14px; line-height: 1.55; }
  .amount { font-size: 26px; font-weight: 800; margin: 16px 0 4px; }
  .meta { color: #64748b; font-size: 12px; }
  .ref { display: inline-block; margin-top: 10px; font-family: ui-monospace, Menlo, monospace; font-size: 12px; background: #f1f5f9; border-radius: 999px; padding: 4px 10px; color: #334155; }
  a.btn { display: flex; align-items: center; justify-content: center; margin-top: 22px; height: 50px; border-radius: 14px; background: #1b4f8a; color: #fff;
    font-weight: 700; text-decoration: none; font-size: 15px; }
  .small { margin-top: 12px; font-size: 12px; color: #94a3b8; }
</style>
</head>
<body>
<main class="card">
  <div class="badge" aria-hidden="true">{{ ['success' => '✓', 'pending' => '…', 'danger' => '!', 'muted' => 'i'][$tone] ?? 'i' }}</div>
  <h1>{{ $heading }}</h1>
  <p>{{ $copy }}</p>
  @if(!empty($payload))
    <div class="amount">{{ $payload['formatted_amount'] }}</div>
    <div class="meta">{{ $payload['title'] }}</div>
    <span class="ref">{{ $payload['reference'] }}</span>
  @endif
  @if(!empty($target))
    <a class="btn" href="{{ $target }}" id="back">Return to Havena</a>
    <div class="small">Taking you back automatically…</div>
  @endif
</main>
@if(!empty($target))
<script>
  setTimeout(function () { window.location.replace(@json($target)); }, 600);
</script>
@endif
</body>
</html>
