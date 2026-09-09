@php
    $appStoreBadge = $appStoreBadgeSrc ?? \App\Support\EmailBrand::imageSrc('badge-app-store.png');
    $playStoreBadge = $playStoreBadgeSrc ?? \App\Support\EmailBrand::imageSrc('badge-google-play.png');
@endphp
<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
    <tr>
        @if(!empty($appStoreUrl))
            <td style="padding:0 6px 4px;">
                <a href="{{ $appStoreUrl }}" style="text-decoration:none;">
                    <img src="{{ $appStoreBadge }}" width="135" height="40" alt="Download on the App Store" style="display:block;border:0;outline:none;text-decoration:none;width:135px;height:40px;">
                </a>
            </td>
        @endif
        @if(!empty($playStoreUrl))
            <td style="padding:0 6px 4px;">
                <a href="{{ $playStoreUrl }}" style="text-decoration:none;">
                    <img src="{{ $playStoreBadge }}" width="135" height="40" alt="Get it on Google Play" style="display:block;border:0;outline:none;text-decoration:none;width:135px;height:40px;">
                </a>
            </td>
        @endif
    </tr>
</table>
