<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Invite QR code — Havena</title>
    <style>
        body {
            margin: 0;
            padding: 40px 16px;
            background: #F4F8FD;
            color: #0A2A43;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            text-align: center;
        }
        .card {
            max-width: 420px;
            margin: 0 auto;
            background: #ffffff;
            border: 1px solid #D7E2EE;
            border-radius: 18px;
            padding: 28px 24px;
        }
        h1 {
            margin: 0 0 8px;
            font-size: 22px;
            line-height: 1.3;
        }
        p {
            margin: 0 0 16px;
            color: #475569;
            line-height: 1.5;
        }
        img {
            display: block;
            margin: 0 auto 16px;
            border: 0;
        }
        .code {
            display: inline-block;
            padding: 12px 16px;
            border-radius: 12px;
            background: #F4F8FD;
            border: 1px solid #D1FAF5;
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            font-size: 20px;
            font-weight: 700;
            letter-spacing: 0.04em;
        }
    </style>
</head>
<body>
    <div class="card">
        <h1>Your invite QR code</h1>
        <p>Scan this code in the Havena app, or enter the invite code below.</p>
        <img src="{{ $imageUrl }}" width="280" height="280" alt="Invite QR code">
        <p class="code">{{ $code }}</p>
    </div>
</body>
</html>
