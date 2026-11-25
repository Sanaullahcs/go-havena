<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>New Havena demo request</title>
</head>
@php
    $note = ($demo['note'] ?? '') !== '' ? $demo['note'] : $submission->message;
    $initial = strtoupper(substr(trim((string) $submission->name), 0, 1)) ?: 'H';
    $submittedAt = optional($submission->created_at)->timezone(config('app.timezone'))->format('M j, Y · g:i A');
    $phone = $demo['phone'] ?? null;
    $size = $demo['community_size'] ?? null;
    $preferredTime = $demo['preferred_time'] ?? null;
@endphp
<body style="margin:0;padding:0;background:#F4F8FD;-webkit-text-size-adjust:100%;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
        {{ $submission->name }} requested a Havena demo{{ $submission->community ? ' for '.$submission->community : '' }}.
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F4F8FD;border-collapse:collapse;">
        <tr>
            <td align="center" style="padding:32px 16px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;border-collapse:collapse;">
                    @include('emails.partials.brand-header', ['headerKicker' => 'Demo inbox'])

                    {{-- Card --}}
                    <tr>
                        <td style="background:#ffffff;border:1px solid #D7E2EE;border-top:0;border-radius:0 0 20px 20px;">

                            {{-- Intro --}}
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td style="padding:28px 32px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:18px;">
                                            <tr>
                                                <td style="background:#D1FAF5;border:1px solid #A7F3D0;border-radius:999px;padding:6px 12px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#0F766E;">
                                                    New request
                                                </td>
                                            </tr>
                                        </table>
                                        <h1 style="margin:0 0 8px;font-size:26px;line-height:1.25;font-weight:700;letter-spacing:-0.03em;color:#0A2A43;">
                                            {{ $submission->name }} wants a demo
                                        </h1>
                                        <p style="margin:0;font-size:15px;line-height:1.55;color:#64748b;">
                                            A walkthrough request just came in from the public site.
                                            @if($submittedAt)
                                                Submitted {{ $submittedAt }}.
                                            @endif
                                        </p>
                                    </td>
                                </tr>
                            </table>

                            {{-- Contact card --}}
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td style="padding:20px 32px 8px;">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;">
                                            <tr>
                                                <td style="padding:18px 20px;">
                                                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                                        <tr>
                                                            <td width="48" valign="top" style="padding-right:14px;">
                                                                <div style="width:44px;height:44px;border-radius:999px;background:#0A2A43;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;line-height:44px;text-align:center;">
                                                                    {{ $initial }}
                                                                </div>
                                                            </td>
                                                            <td valign="middle" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                                                                <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#0b1f3a;">{{ $submission->name }}</p>
                                                                <p style="margin:0 0 2px;font-size:14px;">
                                                                    <a href="mailto:{{ $submission->email }}" style="color:#2b59ff;text-decoration:none;font-weight:600;">{{ $submission->email }}</a>
                                                                </p>
                                                                @if($phone)
                                                                    <p style="margin:0;font-size:13px;color:#64748b;">{{ $phone }}</p>
                                                                @endif
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            {{-- Detail rows --}}
                            @php
                                $demoDetails = [
                                    ['label' => 'Community', 'value' => $submission->community ?: 'Not provided'],
                                    ['label' => 'Role', 'value' => $roleLabel],
                                    ['label' => 'Community size', 'value' => $size ?: 'Not provided'],
                                    ['label' => 'Preferred time', 'value' => $preferredTime ?: 'Not provided'],
                                ];
                            @endphp
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td style="padding:16px 32px 8px;">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F8FBFE;border:1px solid #E4EDF5;border-radius:14px;">
                                            @foreach($demoDetails as $detail)
                                                @php
                                                    $iconSrc = \App\Support\EmailBrand::iconSrc($detail['label']);
                                                @endphp
                                                <tr>
                                                    <td style="padding:12px 16px;{{ $loop->last ? '' : 'border-bottom:1px solid #E4EDF5;' }}">
                                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                                            <tr>
                                                                <td valign="middle" width="40" style="padding-right:10px;">
                                                                    <img src="{{ $iconSrc }}" width="28" height="28" alt="" style="display:block;border:0;">
                                                                </td>
                                                                <td valign="middle" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                                                                    <p style="margin:0 0 2px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#94A3B8;">{{ $detail['label'] }}</p>
                                                                    <p style="margin:0;font-size:14px;font-weight:600;line-height:1.4;color:#0A2A43;">{{ $detail['value'] }}</p>
                                                                </td>
                                                            </tr>
                                                        </table>
                                                    </td>
                                                </tr>
                                            @endforeach
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            {{-- Note --}}
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td style="padding:20px 32px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                                        <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#94a3b8;">
                                            What they want to see
                                        </p>
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F4F8FD;border:1px solid #D7E2EE;border-left:4px solid #14B8A6;border-radius:12px;">
                                            <tr>
                                                <td style="padding:16px 18px;font-size:14px;line-height:1.65;color:#334155;white-space:pre-wrap;">{{ $note }}</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            {{-- CTA --}}
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td align="center" style="padding:28px 32px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                                            <tr>
                                                <td align="center" style="border-radius:12px;background:#14B8A6;">
                                                    <a href="{{ $adminUrl }}" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">
                                                        Review in admin
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>
                                        <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#64748b;">
                                            Or reply to this email to message {{ $submission->name }} directly.
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    @include('emails.partials.brand-footer')
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
