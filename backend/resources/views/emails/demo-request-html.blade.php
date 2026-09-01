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
<body style="margin:0;padding:0;background:#eef2f7;-webkit-text-size-adjust:100%;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
        {{ $submission->name }} requested a Havena demo{{ $submission->community ? ' for '.$submission->community : '' }}.
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef2f7;border-collapse:collapse;">
        <tr>
            <td align="center" style="padding:40px 16px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;border-collapse:collapse;">
                    {{-- Brand bar --}}
                    <tr>
                        <td style="padding:0 8px 18px;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td align="left" style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1;font-weight:700;letter-spacing:-0.02em;color:#0b1f3a;">
                                        Havena
                                    </td>
                                    <td align="right" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1;color:#64748b;">
                                        Demo inbox
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    {{-- Card --}}
                    <tr>
                        <td style="background:#ffffff;border:1px solid #dbe3ef;border-radius:20px;overflow:hidden;">
                            {{-- Accent strip --}}
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td style="height:4px;line-height:4px;font-size:0;background:#1b4f8a;">&nbsp;</td>
                                </tr>
                            </table>

                            {{-- Intro --}}
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td style="padding:28px 32px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:18px;">
                                            <tr>
                                                <td style="background:#eef4ff;border:1px solid #d7e4ff;border-radius:999px;padding:6px 12px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#1b4f8a;">
                                                    New request
                                                </td>
                                            </tr>
                                        </table>
                                        <h1 style="margin:0 0 8px;font-size:26px;line-height:1.25;font-weight:700;letter-spacing:-0.03em;color:#0b1f3a;">
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
                                                                <div style="width:44px;height:44px;border-radius:999px;background:#1b4f8a;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;line-height:44px;text-align:center;">
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

                            {{-- Detail chips --}}
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td style="padding:16px 32px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                            <tr>
                                                <td width="50%" valign="top" style="padding:0 6px 12px 0;">
                                                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e2e8f0;border-radius:14px;">
                                                        <tr>
                                                            <td style="padding:14px 16px;">
                                                                <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#94a3b8;">Community</p>
                                                                <p style="margin:0;font-size:14px;font-weight:600;line-height:1.4;color:#0b1f3a;">{{ $submission->community ?: 'Not provided' }}</p>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                                <td width="50%" valign="top" style="padding:0 0 12px 6px;">
                                                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e2e8f0;border-radius:14px;">
                                                        <tr>
                                                            <td style="padding:14px 16px;">
                                                                <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#94a3b8;">Role</p>
                                                                <p style="margin:0;font-size:14px;font-weight:600;line-height:1.4;color:#0b1f3a;">{{ $roleLabel }}</p>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td width="50%" valign="top" style="padding:0 6px 0 0;">
                                                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e2e8f0;border-radius:14px;">
                                                        <tr>
                                                            <td style="padding:14px 16px;">
                                                                <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#94a3b8;">Community size</p>
                                                                <p style="margin:0;font-size:14px;font-weight:600;line-height:1.4;color:#0b1f3a;">{{ $size ?: 'Not provided' }}</p>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                                <td width="50%" valign="top" style="padding:0 0 0 6px;">
                                                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e2e8f0;border-radius:14px;">
                                                        <tr>
                                                            <td style="padding:14px 16px;">
                                                                <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#94a3b8;">Preferred time</p>
                                                                <p style="margin:0;font-size:14px;font-weight:600;line-height:1.4;color:#0b1f3a;">{{ $preferredTime ?: 'Not provided' }}</p>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
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
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#fbfcfe;border:1px solid #e2e8f0;border-left:4px solid #2b59ff;border-radius:12px;">
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
                                                <td align="center" style="border-radius:999px;background:#1b4f8a;">
                                                    <a href="{{ $adminUrl }}" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">
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

                    {{-- Footer --}}
                    <tr>
                        <td style="padding:22px 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;text-align:center;">
                            <p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:#94a3b8;">
                                Sent by Havena · Request a Demo notifications
                            </p>
                            <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;">
                                hello@gohavena.com
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
