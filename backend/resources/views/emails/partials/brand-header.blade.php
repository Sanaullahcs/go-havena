@php
    $logoSrc = $logoSrc ?? \App\Support\EmailBrand::logoSrc();
    $headerKicker = $headerKicker ?? 'Community living';
@endphp
<tr>
    <td style="padding:0;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0A2A43;border-radius:18px 18px 0 0;border-collapse:collapse;">
            <tr>
                <td style="padding:22px 28px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                            <td valign="middle" width="44" style="padding-right:12px;">
                                <img src="{{ $logoSrc }}" width="36" height="36" alt="{{ $brandName }}" style="display:block;border:0;outline:none;text-decoration:none;border-radius:10px;background:#ffffff;">
                            </td>
                            <td valign="middle" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                                <p style="margin:0;font-size:20px;line-height:1;font-weight:700;letter-spacing:-0.03em;color:#ffffff;">{{ $brandName }}</p>
                                <p style="margin:5px 0 0;font-size:11px;line-height:1;letter-spacing:0.04em;text-transform:uppercase;color:#99B4C7;">{{ $headerKicker }}</p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
            <tr>
                <td style="height:3px;line-height:3px;font-size:0;background:#14B8A6;">&nbsp;</td>
            </tr>
        </table>
    </td>
</tr>
