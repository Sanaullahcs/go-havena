<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>{{ $heading }}</title>
</head>
<body style="margin:0;padding:0;background:#F4F8FD;-webkit-text-size-adjust:100%;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">{{ $preheader }}</div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F4F8FD;border-collapse:collapse;">
        <tr>
            <td align="center" style="padding:28px 16px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;border-collapse:collapse;">
                    @include('emails.partials.brand-header')

                    <tr>
                        <td style="background:#ffffff;border:1px solid #D7E2EE;border-top:0;border-radius:0 0 18px 18px;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td style="padding:28px 28px 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                                        @if($eyebrow)
                                            <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#0F766E;">
                                                {{ $eyebrow }}
                                            </p>
                                        @endif
                                        <h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.03em;color:#0A2A43;">
                                            {{ $heading }}
                                        </h1>
                                        <p style="margin:0;font-size:15px;line-height:1.6;color:#475569;">
                                            {{ $intro }}
                                        </p>
                                    </td>
                                </tr>
                            </table>

                            @if(count($paragraphs))
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                    <tr>
                                        <td style="padding:10px 28px 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                                            @foreach($paragraphs as $paragraph)
                                                <p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#475569;">{{ $paragraph }}</p>
                                            @endforeach
                                        </td>
                                    </tr>
                                </table>
                            @endif

                            @if(count($details))
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                    <tr>
                                        <td style="padding:12px 28px;">
                                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F8FBFE;border:1px solid #E4EDF5;border-radius:14px;">
                                                @foreach($details as $detail)
                                                    @php
                                                        $iconSrc = \App\Support\EmailBrand::iconSrc($detail['label']);
                                                    @endphp
                                                    <tr>
                                                        <td style="padding:{{ $loop->first ? '14px 16px 10px' : '10px 16px' }} {{ $loop->last ? '14px' : '10px' }};{{ $loop->last ? '' : 'border-bottom:1px solid #E4EDF5;' }}">
                                                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                                                <tr>
                                                                    <td valign="middle" width="40" style="padding-right:10px;">
                                                                        <img src="{{ $iconSrc }}" width="28" height="28" alt="" style="display:block;border:0;outline:none;">
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
                            @endif

                            @if($highlightCode)
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                    <tr>
                                        <td style="padding:4px 28px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:8px;">
                                                <tr>
                                                    <td valign="middle" style="padding-right:8px;">
                                                        <img src="{{ \App\Support\EmailBrand::imageSrc('icon-code.png') }}" width="20" height="20" alt="" style="display:block;border:0;">
                                                    </td>
                                                    <td valign="middle" style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#94A3B8;">
                                                        {{ $highlightLabel ?: 'Your code' }}
                                                    </td>
                                                </tr>
                                            </table>
                                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F4F8FD;border:1px solid #D1FAF5;border-radius:12px;">
                                                <tr>
                                                    <td align="center" style="padding:16px 12px;font-size:22px;font-weight:700;letter-spacing:0.04em;color:#0A2A43;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">
                                                        {{ $highlightCode }}
                                                    </td>
                                                </tr>
                                                @if(!empty($highlightQrSrc))
                                                    <tr>
                                                        <td align="center" style="padding:0 12px 16px;">
                                                            <img src="{{ $highlightQrSrc }}" width="168" height="168" alt="Invite QR code" style="display:block;border:0;outline:none;width:168px;height:168px;">
                                                            <p style="margin:10px 0 0;font-size:12px;line-height:1.5;color:#64748B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                                                                Scan this QR in the Havena app, or type the code above.
                                                            </p>
                                                        </td>
                                                    </tr>
                                                @endif
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                            @endif

                            @if(!empty($includeAppStoreLinks) && (!empty($appStoreUrl) || !empty($playStoreUrl)))
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                    <tr>
                                        <td align="center" style="padding:8px 28px 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                                            <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#0A2A43;">Get the Havena app</p>
                                            <p style="margin:0 0 14px;font-size:13px;line-height:1.5;color:#64748B;">
                                                Notices, guests, and amenities in one private app.
                                            </p>
                                            @include('emails.partials.store-badges')
                                        </td>
                                    </tr>
                                </table>
                            @endif

                            @if($ctaLabel && $ctaUrl)
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                    <tr>
                                        <td align="center" style="padding:18px 28px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                                                <tr>
                                                    <td align="center" style="border-radius:12px;background:#14B8A6;">
                                                        <a href="{{ $ctaUrl }}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">
                                                            {{ $ctaLabel }}
                                                        </a>
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                            @endif

                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td style="padding:16px 28px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                                        <p style="margin:0;font-size:12px;line-height:1.55;color:#94A3B8;">
                                            {{ $footerNote ?: 'If you were not expecting this email, you can ignore it.' }}
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
