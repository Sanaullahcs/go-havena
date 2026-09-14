{{ $brandName }}
{{ $tagline }}

{{ $heading }}

{{ $intro }}
@foreach($paragraphs as $paragraph)

{{ $paragraph }}
@endforeach
@if(count($details))

@foreach($details as $detail)
{{ $detail['label'] }}: {{ $detail['value'] }}
@endforeach
@endif
@if($highlightCode)

{{ $highlightLabel ?: 'Your code' }}: {{ $highlightCode }}
@if(!empty($highlightQrSrc))
Scan the QR code in this email with the Havena app, or enter the code manually.
@endif
@endif
@if(!empty($includeAppStoreLinks))
@if(!empty($appStoreUrl))

App Store: {{ $appStoreUrl }}
@endif
@if(!empty($playStoreUrl))
Google Play: {{ $playStoreUrl }}
@endif
@endif
@if($ctaLabel && $ctaUrl)

{{ $ctaLabel }}: {{ $ctaUrl }}
@endif

{{ $footerNote ?: 'If you were not expecting this email, you can ignore it.' }}

— {{ $brandName }}
{{ $tagline }}
{{ $supportEmail }}
{{ $websiteUrl }}
Privacy: {{ $privacyUrl }}
Terms: {{ $termsUrl }}
App Store: {{ $appStoreUrl }}
Google Play: {{ $playStoreUrl }}
